import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import { createPaginationMetadata } from '../common/http/pagination.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { escapeRegExp } from '../common/text/escape-reg-exp.js';
import { FormDefinition } from '../form-definitions/schemas/form-definition.schema.js';
import { Request } from '../requests/schemas/request.schema.js';
import {
  CloneWorkflowDefinitionDto,
  CreateWorkflowDefinitionDto,
  ListWorkflowDefinitionsDto,
  UpdateWorkflowDefinitionDto,
  ValidateWorkflowDefinitionDto,
} from './dto/workflow-definition.dto.js';
import { WorkflowDefinition, type WorkflowDefinitionDocument } from './schemas/workflow-definition.schema.js';
import { Role } from '../roles/schemas/role.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { User } from '../users/schemas/user.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { BpmnWorkflowCompilerService } from './bpmn-workflow-compiler.service.js';

type StoredWorkflow = WorkflowDefinition & { _id: Types.ObjectId; __v?: number };
type StoredForm = Pick<FormDefinition, 'code' | 'name' | 'version' | 'status'> & { _id: Types.ObjectId };
type StoredWorkflowForm = StoredForm & Pick<FormDefinition, 'fields'>;

@Injectable()
export class WorkflowDefinitionsService {
  constructor(
    @InjectModel(WorkflowDefinition.name) private readonly workflows: Model<WorkflowDefinition>,
    @InjectModel(FormDefinition.name) private readonly forms: Model<FormDefinition>,
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(Role.name) private readonly roles: Model<Role>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    private readonly bpmnCompiler: BpmnWorkflowCompilerService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll(query: ListWorkflowDefinitionsDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.formDefinitionId) filter.formDefinitionId = new Types.ObjectId(query.formDefinitionId);
    if (query.search) {
      const pattern = new RegExp(escapeRegExp(query.search), 'i');
      const matchingForms = await this.forms.find({ $or: [{ code: pattern }, { name: pattern }] }).select({ _id: 1 }).lean().exec();
      filter.$or = [{ code: pattern }, { name: pattern }, { formDefinitionId: { $in: matchingForms.map((item) => item._id) } }];
    }
    const direction: 1 | -1 = query.sortOrder === 'asc' ? 1 : -1;
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.workflows.find(filter).select({ bpmnXml: 0 }).sort({ [query.sortBy]: direction, _id: direction }).skip(skip).limit(query.limit).lean().exec(),
      this.workflows.countDocuments(filter).exec(),
    ]);
    const forms = await this.formMap(items as StoredWorkflow[]);
    return {
      data: items.map((item) => this.toResponse(item as StoredWorkflow, forms, false)),
      pagination: createPaginationMetadata(query.page, query.limit, total),
    };
  }

  async findOne(id: string) {
    const item = await this.workflows.findById(id).lean().exec();
    if (!item) throw new NotFoundException('Không tìm thấy Workflow Definition.');
    return this.toResponse(item as StoredWorkflow, await this.formMap([item as StoredWorkflow]));
  }

  async referenceData() {
    const [roles, positions, users] = await Promise.all([
      this.roles.find({ isActive: true, permissionKeys: 'APPROVALS.APPROVE_ASSIGNED' }).select({ key: 1, name: 1 }).sort({ name: 1 }).lean().exec(),
      this.positions.find({ isActive: true }).select({ code: 1, name: 1 }).sort({ name: 1 }).lean().exec(),
      this.users.find({ isActive: true }).select({ displayName: 1, email: 1, employeeId: 1 }).sort({ email: 1 }).lean().exec(),
    ]);
    const employeeIds = users.flatMap((user) => user.employeeId ? [user.employeeId] : []);
    const employees = employeeIds.length
      ? await this.employees.find({ _id: { $in: employeeIds }, isActive: true }).select({ fullName: 1, employeeCode: 1 }).lean().exec()
      : [];
    const employeeMap = new Map(employees.map((employee) => [employee._id.toString(), employee]));
    return {
      roles: roles.map((role) => ({ id: role._id.toString(), key: role.key, name: role.name })),
      positions: positions.map((position) => ({ id: position._id.toString(), code: position.code, name: position.name })),
      users: users.flatMap((user) => {
        const employee = user.employeeId ? employeeMap.get(user.employeeId.toString()) : undefined;
        if (user.employeeId && !employee) return [];
        return [{ id: user._id.toString(), name: employee?.fullName ?? user.displayName ?? user.email, email: user.email, ...(employee ? { employeeCode: employee.employeeCode } : {}) }];
      }),
    };
  }

  async create(request: RequestWithContext, input: CreateWorkflowDefinitionDto) {
    const code = input.code.trim().toUpperCase();
    if (await this.workflows.exists({ code })) throw new ConflictException({ field: 'code', message: 'Mã Workflow đã tồn tại.' });
    const form = await this.requireWorkflowForm(input.formDefinitionId);
    if (await this.workflows.exists({ formDefinitionId: form._id, status: 'DRAFT' })) {
      throw new ConflictException('Form này đã có một Workflow DRAFT đang được chỉnh sửa.');
    }
    const compiled = this.bpmnCompiler.compileOrThrow(input.bpmnXml, form.fields);
    try {
      const item = await this.workflows.create({
        code,
        version: 1,
        name: input.name.trim(),
        description: input.description?.trim(),
        formDefinitionId: form._id,
        status: 'DRAFT',
        bpmnXml: input.bpmnXml,
        startStepKey: compiled.startStepKey,
        steps: compiled.steps,
        createdBy: this.actorId(request),
        updatedBy: this.actorId(request),
      });
      await this.auditLogs.record(request, {
        action: 'WORKFLOW.CREATED', description: 'Đã tạo Workflow nháp.', outcome: AuditOutcome.SUCCESS,
        resource: { type: 'WORKFLOW_DEFINITION', id: item._id.toString(), code: item.code, name: item.name },
        changes: { after: { code: item.code, name: item.name, version: item.version, status: item.status } },
      });
      return this.toResponse(item, new Map([[form._id.toString(), form as StoredForm]]));
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) throw this.duplicateError();
      throw error;
    }
  }

  async update(request: RequestWithContext, id: string, input: UpdateWorkflowDefinitionDto) {
    const current = await this.workflows.findById(id).exec();
    if (!current) throw new NotFoundException('Không tìm thấy Workflow Definition.');
    this.requireDraft(current);
    const update: Record<string, unknown> = { updatedBy: this.actorId(request) };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.description !== undefined) update.description = input.description.trim();
    if (input.bpmnXml !== undefined) {
      const form = await this.forms.findById(current.formDefinitionId).select({ fields: 1 }).lean().exec();
      if (!form) throw new NotFoundException('Không tìm thấy Form Definition của Workflow.');
      const compiled = this.bpmnCompiler.compileOrThrow(input.bpmnXml, form.fields);
      update.bpmnXml = input.bpmnXml;
      update.startStepKey = compiled.startStepKey;
      update.steps = compiled.steps;
    }
    const item = await this.workflows.findOneAndUpdate(
      { _id: current._id, status: 'DRAFT', __v: input.expectedRevision },
      { $set: update, $inc: { __v: 1 } },
      { returnDocument: 'after', runValidators: true },
    ).exec();
    if (!item) await this.throwConcurrentOrState(current._id);
    const updated = item!;
    await this.auditLogs.record(request, {
      action: 'WORKFLOW.UPDATED', description: 'Đã cập nhật Workflow nháp.', outcome: AuditOutcome.SUCCESS,
      resource: { type: 'WORKFLOW_DEFINITION', id: updated._id.toString(), code: updated.code, name: updated.name },
      changes: { before: { name: current.name, version: current.version, status: current.status }, after: { name: updated.name, version: updated.version, status: updated.status } },
      metadata: { changedGraph: input.bpmnXml !== undefined, changedDescription: input.description !== undefined },
    });
    return this.toResponse(updated, await this.formMap([updated as StoredWorkflow]));
  }

  async clone(request: RequestWithContext, id: string, input: CloneWorkflowDefinitionDto) {
    const source = await this.workflows.findById(id).exec();
    if (!source) throw new NotFoundException('Không tìm thấy Workflow nguồn.');
    if (await this.workflows.exists({ code: source.code, status: 'DRAFT' })) {
      throw new ConflictException('Workflow này đã có một phiên bản DRAFT đang được chỉnh sửa.');
    }
    const targetForm = await this.requireWorkflowForm(input.formDefinitionId ?? source.formDefinitionId.toString());
    if (await this.workflows.exists({ formDefinitionId: targetForm._id, status: 'DRAFT' })) {
      throw new ConflictException('Form đích đã có một Workflow DRAFT.');
    }
    const latest = await this.workflows.findOne({ code: source.code }).sort({ version: -1 }).select({ version: 1 }).lean().exec();
    const compiled = this.bpmnCompiler.compileOrThrow(source.bpmnXml ?? '', targetForm.fields);
    try {
      const cloned = await this.workflows.create({
        code: source.code,
        version: (latest?.version ?? source.version) + 1,
        previousVersionId: source._id,
        name: input.name?.trim() ?? source.name,
        description: input.description === undefined ? source.description : input.description.trim(),
        formDefinitionId: targetForm._id,
        status: 'DRAFT',
        bpmnXml: source.bpmnXml,
        startStepKey: compiled.startStepKey,
        steps: compiled.steps,
        createdBy: this.actorId(request),
        updatedBy: this.actorId(request),
      });
      await this.auditLogs.record(request, {
        action: 'WORKFLOW.CLONED', description: 'Đã sao chép Workflow thành phiên bản nháp mới.', outcome: AuditOutcome.SUCCESS,
        resource: { type: 'WORKFLOW_DEFINITION', id: cloned._id.toString(), code: cloned.code, name: cloned.name },
        changes: { after: { code: cloned.code, name: cloned.name, version: cloned.version, status: cloned.status } },
        metadata: { sourceWorkflowDefinitionId: source._id.toString(), targetFormDefinitionId: targetForm._id.toString() },
      });
      return this.toResponse(cloned, new Map([[targetForm._id.toString(), targetForm as StoredForm]]));
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) throw this.duplicateError();
      throw error;
    }
  }

  async validate(id: string, input: ValidateWorkflowDefinitionDto = {}) {
    const item = await this.workflows.findById(id).lean().exec();
    if (!item) throw new NotFoundException('Không tìm thấy Workflow Definition.');
    const form = await this.forms.findById(item.formDefinitionId).select({ fields: 1 }).lean().exec();
    if (!form) throw new NotFoundException('Không tìm thấy Form Definition của Workflow.');
    const validatesPersistedXml = input.bpmnXml === undefined;
    const result = this.bpmnCompiler.compile(input.bpmnXml ?? item.bpmnXml ?? '', form.fields);
    if (!result.valid || !result.compiled) return result;
    if (validatesPersistedXml && (item.startStepKey !== result.compiled.startStepKey || this.stableSerialize(item.steps) !== this.stableSerialize(result.compiled.steps))) {
      return {
        valid: false,
        errors: [{
          code: 'BPMN_COMPILED_STEPS_OUT_OF_SYNC',
          path: 'steps',
          message: 'BPMN XML và steps đã biên dịch không đồng bộ. Hãy lưu lại Workflow DRAFT.',
        }],
      };
    }
    return result;
  }

  async remove(request: RequestWithContext, id: string): Promise<{ id: string }> {
    const item = await this.workflows.findById(id).exec();
    if (!item) throw new NotFoundException('Không tìm thấy Workflow Definition.');
    this.requireDraft(item);
    if (await this.requests.exists({ workflowDefinitionId: item._id })) throw new ConflictException('Không thể xóa Workflow đang được phiếu yêu cầu tham chiếu.');
    const result = await this.workflows.deleteOne({ _id: item._id, status: 'DRAFT', __v: item.get('__v') }).exec();
    if (result.deletedCount !== 1) await this.throwConcurrentOrState(item._id);
    await this.auditLogs.record(request, {
      action: 'WORKFLOW.DELETED', description: 'Đã xóa Workflow nháp.', outcome: AuditOutcome.SUCCESS,
      resource: { type: 'WORKFLOW_DEFINITION', id: item._id.toString(), code: item.code, name: item.name },
      changes: { before: { code: item.code, name: item.name, version: item.version, status: item.status } },
    });
    return { id: item._id.toString() };
  }

  private async requireWorkflowForm(id: string): Promise<StoredWorkflowForm> {
    const form = await this.forms.findById(id).select({ code: 1, name: 1, version: 1, status: 1, fields: 1 }).lean().exec();
    if (!form) throw new NotFoundException('Không tìm thấy Form Definition.');
    if (form.status !== 'DRAFT' && form.status !== 'PUBLISHED') {
      throw new ConflictException({
        code: 'WORKFLOW_FORM_STATUS_NOT_ALLOWED',
        message: 'Workflow DRAFT chỉ được liên kết với Form DRAFT hoặc PUBLISHED.',
      });
    }
    return form as StoredWorkflowForm;
  }

  private requireDraft(item: Pick<WorkflowDefinition, 'status'>): void {
    if (item.status !== 'DRAFT') throw new ConflictException({ code: 'WORKFLOW_NOT_EDITABLE', message: 'Chỉ Workflow DRAFT mới được chỉnh sửa hoặc xóa.' });
  }

  private async throwConcurrentOrState(id: Types.ObjectId): Promise<never> {
    const latest = await this.workflows.findById(id).select({ status: 1 }).lean().exec();
    if (!latest) throw new NotFoundException('Không tìm thấy Workflow Definition.');
    if (latest.status !== 'DRAFT') throw new ConflictException({ code: 'WORKFLOW_NOT_EDITABLE', message: 'Workflow đã rời trạng thái DRAFT.' });
    throw new ConflictException({ code: 'CONCURRENT_MODIFICATION', message: 'Workflow vừa được cập nhật ở nơi khác. Vui lòng tải lại.' });
  }

  private async formMap(items: readonly StoredWorkflow[]): Promise<Map<string, StoredForm>> {
    const ids = [...new Set(items.map((item) => item.formDefinitionId.toString()))];
    const forms = ids.length ? await this.forms.find({ _id: { $in: ids } }).select({ code: 1, name: 1, version: 1, status: 1 }).lean().exec() : [];
    return new Map(forms.map((form) => [form._id.toString(), form as StoredForm]));
  }

  private toResponse(item: StoredWorkflow | WorkflowDefinitionDocument, forms: ReadonlyMap<string, StoredForm>, includeBpmnXml = true) {
    const formId = item.formDefinitionId.toString();
    const form = forms.get(formId);
    return {
      id: item._id.toString(), code: item.code, version: item.version, revision: this.documentRevision(item),
      ...(item.previousVersionId ? { previousVersionId: item.previousVersionId.toString() } : {}),
      name: item.name, ...(item.description ? { description: item.description } : {}),
      formDefinitionId: formId,
      ...(form ? { formDefinition: { id: form._id.toString(), code: form.code, name: form.name, version: form.version, status: form.status } } : {}),
      status: item.status, ...(includeBpmnXml ? { bpmnXml: item.bpmnXml ?? '' } : {}), startStepKey: item.startStepKey, steps: item.steps,
      createdBy: item.createdBy.toString(),
      ...(item.updatedBy ? { updatedBy: item.updatedBy.toString() } : {}),
      ...(item.publishedBy ? { publishedBy: item.publishedBy.toString() } : {}),
      ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
      createdAt: item.createdAt, updatedAt: item.updatedAt,
    };
  }

  private actorId(request: RequestWithContext): Types.ObjectId {
    const id = request.user?.id;
    if (!id || !Types.ObjectId.isValid(id)) throw new UnauthorizedException('Không thể xác định người dùng hiện tại.');
    return new Types.ObjectId(id);
  }

  private documentRevision(item: StoredWorkflow | WorkflowDefinitionDocument): number {
    if ('get' in item && typeof item.get === 'function') {
      const revision = item.get('__v');
      return typeof revision === 'number' ? revision : 0;
    }
    return typeof item.__v === 'number' ? item.__v : 0;
  }

  private duplicateError(): ConflictException { return new ConflictException('Mã/version Workflow đã tồn tại hoặc Form đã có Workflow DRAFT.'); }
  private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

  private stableSerialize(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (value instanceof Types.ObjectId) return JSON.stringify(value.toString());
    if (Array.isArray(value)) return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    const record = value as Record<string, unknown>;
    const toJson = record.toJSON;
    if (typeof toJson === 'function') return this.stableSerialize(toJson.call(value));
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${this.stableSerialize(record[key])}`).join(',')}}`;
  }
}
