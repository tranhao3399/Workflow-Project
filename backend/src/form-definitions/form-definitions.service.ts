import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import { createPaginationMetadata } from '../common/http/pagination.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { escapeRegExp } from '../common/text/escape-reg-exp.js';
import { Request } from '../requests/schemas/request.schema.js';
import { WorkflowDefinition } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { User } from '../users/schemas/user.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import {
  CloneFormDefinitionDto,
  CreateFormDefinitionDto,
  DuplicateFormDefinitionDto,
  ListFormDefinitionsDto,
  UpdateFormDefinitionDto,
} from './dto/form-definition.dto.js';
import { DynamicFormValidatorService, type DynamicFormValidationResult } from './dynamic-form-validator.service.js';
import { FormGroupsService } from './form-groups.service.js';
import { FormDefinition, type FormDefinitionDocument } from './schemas/form-definition.schema.js';
import { FormGroup } from './schemas/form-group.schema.js';

type StoredFormDefinition = FormDefinition & { _id: Types.ObjectId };

@Injectable()
export class FormDefinitionsService {
  constructor(
    @InjectModel(FormDefinition.name) private readonly forms: Model<FormDefinition>,
    @InjectModel(FormGroup.name) private readonly groups: Model<FormGroup>,
    @InjectModel(WorkflowDefinition.name) private readonly workflows: Model<WorkflowDefinition>,
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    private readonly validator: DynamicFormValidatorService,
    private readonly formGroups: FormGroupsService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll(query: ListFormDefinitionsDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.groupId) filter.groupId = new Types.ObjectId(query.groupId);
    if (query.ungrouped === 'true') filter.groupId = { $exists: false };
    if (query.search) {
      const search = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = [{ code: search }, { name: search }];
    }
    const skip = (query.page - 1) * query.limit;
    const direction: 1 | -1 = query.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [query.sortBy]: direction, _id: direction };
    const [items, total] = await Promise.all([
      this.forms.find(filter).sort(sort).skip(skip).limit(query.limit).lean().exec(),
      this.forms.countDocuments(filter).exec(),
    ]);
    const [updaterNames, groups] = await Promise.all([
      this.resolveUpdaterNames(items as StoredFormDefinition[]),
      this.resolveGroups(items as StoredFormDefinition[]),
    ]);
    return {
      data: items.map((item) => this.toResponse(item as StoredFormDefinition, updaterNames, groups)),
      pagination: createPaginationMetadata(query.page, query.limit, total),
    };
  }

  async findOne(id: string) {
    const item = await this.forms.findById(id).lean().exec();
    if (!item) throw new NotFoundException('Không tìm thấy biểu mẫu.');
    const [updaterNames, groups] = await Promise.all([
      this.resolveUpdaterNames([item as StoredFormDefinition]),
      this.resolveGroups([item as StoredFormDefinition]),
    ]);
    return this.toResponse(item as StoredFormDefinition, updaterNames, groups);
  }

  async create(request: RequestWithContext, input: CreateFormDefinitionDto) {
    const code = input.code.trim().toUpperCase();
    if (await this.forms.exists({ code })) {
      throw new ConflictException({ message: 'Mã biểu mẫu đã tồn tại. Hãy clone phiên bản hiện có để tạo version mới.', field: 'code' });
    }
    this.validator.assertDefinitionValid(input.fields);
    this.validator.assertSystemRequestFieldsValid(input.fields);
    const groupId = input.groupId ? await this.formGroups.requireAssignable(input.groupId) : undefined;
    try {
      const item = await this.forms.create({
        code,
        version: 1,
        name: input.name.trim(),
        ...(groupId ? { groupId } : {}),
        ...(input.category ? { category: input.category } : {}),
        description: input.description?.trim(),
        status: 'DRAFT',
        fields: input.fields,
        settings: input.settings ?? {},
        createdBy: this.actorId(request),
        updatedBy: this.actorId(request),
      });
      await this.auditLogs.record(request, {
        action: 'FORM.CREATED',
        description: 'Đã tạo biểu mẫu nháp.',
        outcome: AuditOutcome.SUCCESS,
        resource: {
          type: 'FORM_DEFINITION',
          id: item._id.toString(),
          code: item.code,
          name: item.name,
        },
        changes: {
          after: {
            code: item.code,
            name: item.name,
            version: item.version,
            status: item.status,
          },
        },
      });
      const groups = await this.resolveGroups([item]);
      return this.toResponse(item, new Map(), groups);
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) throw this.duplicateVersionError();
      throw error;
    }
  }

  async update(request: RequestWithContext, id: string, input: UpdateFormDefinitionDto) {
    const current = await this.forms.findById(id).exec();
    if (!current) throw new NotFoundException('Không tìm thấy biểu mẫu.');
    this.requireDraft(current);
    const before = {
      name: current.name,
      version: current.version,
      status: current.status,
    };

    const nextFields = input.fields ?? current.fields;
    this.validator.assertDefinitionValid(nextFields);
    this.validator.assertSystemRequestFieldsValid(nextFields);
    const groupChanged = input.groupId !== undefined
      && (input.groupId ?? '') !== (current.groupId?.toString() ?? '');
    const update: Record<string, unknown> = { updatedBy: this.actorId(request) };
    const unset: Record<string, 1> = {};
    if (input.name !== undefined) update.name = input.name.trim();
    if (groupChanged && input.groupId === null) unset.groupId = 1;
    else if (groupChanged && input.groupId != null) update.groupId = await this.formGroups.requireAssignable(input.groupId);
    if (input.category === null) unset.category = 1;
    else if (input.category !== undefined) update.category = input.category;
    if (input.description !== undefined) update.description = input.description.trim();
    if (input.fields !== undefined) update.fields = input.fields;
    if (input.settings !== undefined) {
      const currentSettings = current.toObject().settings;
      update.settings = { ...currentSettings, ...input.settings };
    }

    const item = await this.forms.findOneAndUpdate(
      { _id: current._id, status: 'DRAFT', __v: current.get('__v') },
      {
        $set: update,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
        $inc: { __v: 1 },
      },
      { returnDocument: 'after', runValidators: true },
    ).exec();
    if (!item) {
      const latest = await this.forms.findById(current._id).select({ status: 1 }).lean().exec();
      if (!latest) throw new NotFoundException('Không tìm thấy biểu mẫu.');
      if (latest.status !== 'DRAFT') {
        throw new ConflictException({
          code: 'FORM_NOT_DRAFT',
          message: 'Biểu mẫu đã rời trạng thái DRAFT và không thể cập nhật.',
        });
      }
      throw new ConflictException({
        code: 'FORM_CONCURRENT_MODIFICATION',
        message: 'Biểu mẫu vừa được cập nhật bởi thao tác khác. Vui lòng tải lại dữ liệu.',
      });
    }
    await this.auditLogs.record(request, {
      action: 'FORM.UPDATED',
      description: 'Đã cập nhật biểu mẫu nháp.',
      outcome: AuditOutcome.SUCCESS,
      resource: {
        type: 'FORM_DEFINITION',
        id: item._id.toString(),
        code: item.code,
        name: item.name,
      },
      changes: {
        before,
        after: {
          name: item.name,
          version: item.version,
          status: item.status,
        },
      },
      metadata: {
        changedDefinition: input.fields !== undefined,
        changedSettings: input.settings !== undefined,
        changedDescription: input.description !== undefined,
      },
    });
    if (groupChanged) {
      const siblingUpdate = input.groupId === null
        ? { $unset: { groupId: 1 } }
        : { $set: { groupId: new Types.ObjectId(input.groupId) } };
      await this.forms.updateMany({ code: item.code, _id: { $ne: item._id } }, siblingUpdate).exec();
    }
    const groups = await this.resolveGroups([item]);
    return this.toResponse(item, new Map(), groups);
  }

  async clone(request: RequestWithContext, id: string, input: CloneFormDefinitionDto) {
    const source = await this.forms.findById(id).exec();
    if (!source) throw new NotFoundException('Không tìm thấy biểu mẫu nguồn.');
    if (await this.forms.exists({ code: source.code, status: 'DRAFT' })) {
      throw new ConflictException('Mã biểu mẫu này đã có một phiên bản DRAFT đang được chỉnh sửa.');
    }
    const latestVersion = await this.forms.findOne({ code: source.code }).sort({ version: -1 }).select({ version: 1 }).lean().exec();
    const sourceData = source.toObject();
    const nextFields = this.validator.ensureSystemRequestFields(sourceData.fields);
    this.validator.assertDefinitionValid(nextFields);
    this.validator.assertSystemRequestFieldsValid(nextFields);
    try {
      const cloned = await this.forms.create({
        code: source.code,
        version: (latestVersion?.version ?? source.version) + 1,
        previousVersionId: source._id,
        name: input.name?.trim() ?? source.name,
        ...(source.groupId ? { groupId: source.groupId } : {}),
        ...(source.category ? { category: source.category } : {}),
        description: input.description === undefined ? source.description : input.description.trim(),
        status: 'DRAFT',
        fields: nextFields,
        settings: sourceData.settings,
        createdBy: this.actorId(request),
        updatedBy: this.actorId(request),
      });
      await this.auditLogs.record(request, {
        action: 'FORM.CLONED',
        description: 'Đã sao chép biểu mẫu thành phiên bản nháp mới.',
        outcome: AuditOutcome.SUCCESS,
        resource: {
          type: 'FORM_DEFINITION',
          id: cloned._id.toString(),
          code: cloned.code,
          name: cloned.name,
        },
        changes: {
          after: {
            code: cloned.code,
            name: cloned.name,
            version: cloned.version,
            status: cloned.status,
          },
        },
        metadata: { sourceFormDefinitionId: source._id.toString() },
      });
      const groups = await this.resolveGroups([cloned]);
      return this.toResponse(cloned, new Map(), groups);
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) throw this.duplicateVersionError();
      throw error;
    }
  }

  async duplicate(request: RequestWithContext, id: string, input: DuplicateFormDefinitionDto) {
    const source = await this.forms.findById(id).exec();
    if (!source) throw new NotFoundException('Không tìm thấy biểu mẫu nguồn.');

    const code = input.code.trim().toUpperCase();
    if (await this.forms.exists({ code })) {
      throw new ConflictException({ message: 'Mã biểu mẫu đã tồn tại.', field: 'code' });
    }

    const sourceData = source.toObject();
    const fields = this.validator.ensureSystemRequestFields(sourceData.fields);
    this.validator.assertDefinitionValid(fields);
    this.validator.assertSystemRequestFieldsValid(fields);

    try {
      const duplicated = await this.forms.create({
        code,
        version: 1,
        name: input.name.trim(),
        ...(source.groupId ? { groupId: source.groupId } : {}),
        ...(source.category ? { category: source.category } : {}),
        description: source.description,
        status: 'DRAFT',
        fields,
        settings: sourceData.settings,
        createdBy: this.actorId(request),
        updatedBy: this.actorId(request),
      });

      await this.auditLogs.record(request, {
        action: 'FORM.DUPLICATED',
        description: 'Đã tạo bản sao biểu mẫu độc lập.',
        outcome: AuditOutcome.SUCCESS,
        resource: {
          type: 'FORM_DEFINITION',
          id: duplicated._id.toString(),
          code: duplicated.code,
          name: duplicated.name,
        },
        changes: {
          after: {
            code: duplicated.code,
            name: duplicated.name,
            version: duplicated.version,
            status: duplicated.status,
          },
        },
        metadata: {
          sourceFormDefinitionId: source._id.toString(),
          sourceFormDefinitionCode: source.code,
          sourceFormDefinitionVersion: source.version,
        },
      });

      const groups = await this.resolveGroups([duplicated]);
      return this.toResponse(duplicated, new Map(), groups);
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        throw new ConflictException({ message: 'Mã biểu mẫu đã tồn tại.', field: 'code' });
      }
      throw error;
    }
  }

  async validate(id: string, formData: Record<string, unknown>): Promise<DynamicFormValidationResult> {
    const item = await this.forms.findById(id).select({ fields: 1 }).lean().exec();
    if (!item) throw new NotFoundException('Không tìm thấy biểu mẫu.');
    return this.validator.validateFormData({ fields: item.fields }, formData);
  }

  async updateGroup(request: RequestWithContext, id: string, groupId: string | null) {
    const item = await this.forms.findById(id).select({ code: 1, name: 1, groupId: 1 }).lean().exec();
    if (!item) throw new NotFoundException('Không tìm thấy biểu mẫu.');
    const nextGroupId = groupId ? await this.formGroups.requireAssignable(groupId) : undefined;
    const update = nextGroupId ? { $set: { groupId: nextGroupId } } : { $unset: { groupId: 1 } };
    const result = await this.forms.updateMany({ code: item.code }, update).exec();
    await this.auditLogs.record(request, {
      action: 'FORM.GROUP_CHANGED',
      description: 'Đã chuyển nhóm biểu mẫu.',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'FORM_DEFINITION', id: item._id.toString(), code: item.code, name: item.name },
      changes: {
        before: { groupId: item.groupId?.toString() },
        after: { groupId: nextGroupId?.toString() },
      },
      metadata: { affectedVersions: result.modifiedCount },
    });
    return { code: item.code, groupId: nextGroupId?.toString(), affectedVersions: result.modifiedCount };
  }

  async remove(request: RequestWithContext, id: string): Promise<{ id: string }> {
    const item = await this.forms.findById(id).exec();
    if (!item) throw new NotFoundException('Không tìm thấy biểu mẫu.');
    this.requireDraft(item);
    const [workflowReference, requestReference] = await Promise.all([
      this.workflows.exists({ formDefinitionId: item._id }),
      this.requests.exists({ formDefinitionId: item._id }),
    ]);
    if (workflowReference || requestReference) {
      throw new ConflictException('Không thể xóa biểu mẫu đang được Workflow hoặc phiếu yêu cầu tham chiếu.');
    }
    const deletion = await this.forms.deleteOne({ _id: item._id, status: 'DRAFT', __v: item.get('__v') }).exec();
    if (deletion.deletedCount !== 1) {
      const latest = await this.forms.findById(item._id).select({ status: 1 }).lean().exec();
      if (!latest) throw new NotFoundException('Không tìm thấy biểu mẫu.');
      if (latest.status !== 'DRAFT') {
        throw new ConflictException({
          code: 'FORM_NOT_DRAFT',
          message: 'Biểu mẫu đã rời trạng thái DRAFT và không thể xóa.',
        });
      }
      throw new ConflictException({
        code: 'FORM_CONCURRENT_MODIFICATION',
        message: 'Biểu mẫu vừa được cập nhật bởi thao tác khác. Vui lòng tải lại dữ liệu.',
      });
    }
    await this.auditLogs.record(request, {
      action: 'FORM.DELETED',
      description: 'Đã xóa biểu mẫu nháp.',
      outcome: AuditOutcome.SUCCESS,
      resource: {
        type: 'FORM_DEFINITION',
        id: item._id.toString(),
        code: item.code,
        name: item.name,
      },
      changes: {
        before: {
          code: item.code,
          name: item.name,
          version: item.version,
          status: item.status,
        },
      },
    });
    return { id: item._id.toString() };
  }

  private requireDraft(item: Pick<FormDefinition, 'status'>): void {
    if (item.status !== 'DRAFT') {
      throw new ConflictException('Chỉ biểu mẫu ở trạng thái DRAFT mới được chỉnh sửa hoặc xóa.');
    }
  }

  private actorId(request: RequestWithContext): Types.ObjectId {
    const id = request.user?.id;
    if (!id || !Types.ObjectId.isValid(id)) throw new UnauthorizedException('Không thể xác định người dùng hiện tại.');
    return new Types.ObjectId(id);
  }

  private duplicateVersionError(): ConflictException {
    return new ConflictException('Mã/version biểu mẫu đã tồn tại hoặc mã biểu mẫu đã có một DRAFT.');
  }

  private toResponse(
    item: StoredFormDefinition | FormDefinitionDocument,
    updaterNames: ReadonlyMap<string, string> = new Map(),
    groups: ReadonlyMap<string, { id: string; code: string; name: string; isActive: boolean }> = new Map(),
  ) {
    const updaterId = item.updatedBy?.toString();
    const group = item.groupId ? groups.get(item.groupId.toString()) : undefined;
    return {
      id: item._id.toString(),
      code: item.code,
      version: item.version,
      name: item.name,
      ...(group ? { group } : {}),
      ...(item.category ? { category: item.category } : {}),
      ...(item.description ? { description: item.description } : {}),
      status: item.status,
      fields: this.validator.ensureSystemRequestFields(item.fields),
      settings: item.settings,
      ...(item.previousVersionId ? { previousVersionId: item.previousVersionId.toString() } : {}),
      ...(updaterId ? { updatedBy: { id: updaterId, name: updaterNames.get(updaterId) ?? updaterId } } : {}),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private async resolveUpdaterNames(items: readonly StoredFormDefinition[]): Promise<Map<string, string>> {
    const ids = [...new Set(items.flatMap((item) => item.updatedBy ? [item.updatedBy.toString()] : []))];
    if (!ids.length) return new Map();
    const users = await this.users.find({ _id: { $in: ids } }).select({ displayName: 1, email: 1, employeeId: 1 }).lean().exec();
    const employeeIds = users.flatMap((user) => user.employeeId ? [user.employeeId] : []);
    const employees = employeeIds.length
      ? await this.employees.find({ _id: { $in: employeeIds } }).select({ fullName: 1 }).lean().exec()
      : [];
    const employeeNames = new Map(employees.map((employee) => [employee._id.toString(), employee.fullName]));
    return new Map(users.map((user) => [
      user._id.toString(),
      (user.employeeId ? employeeNames.get(user.employeeId.toString()) : undefined) ?? user.displayName ?? user.email,
    ]));
  }

  private async resolveGroups(
    items: readonly Pick<FormDefinition, 'groupId'>[],
  ): Promise<Map<string, { id: string; code: string; name: string; isActive: boolean }>> {
    const ids = [...new Set(items.flatMap((item) => item.groupId ? [item.groupId.toString()] : []))];
    if (!ids.length) return new Map();
    const groups = await this.groups.find({ _id: { $in: ids } })
      .select({ code: 1, name: 1, isActive: 1 })
      .lean().exec();
    return new Map(groups.map((group) => [group._id.toString(), {
      id: group._id.toString(),
      code: group.code,
      name: group.name,
      isActive: group.isActive,
    }]));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
