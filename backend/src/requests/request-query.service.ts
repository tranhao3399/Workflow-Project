import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model, QueryFilter } from 'mongoose';
import { Types } from 'mongoose';
import { ApprovalHistory } from '../approvals/schemas/approval-history.schema.js';
import { createPaginationMetadata } from '../common/http/pagination.js';
import { escapeRegExp } from '../common/text/escape-reg-exp.js';
import { FormDefinition } from '../form-definitions/schemas/form-definition.schema.js';
import { WorkflowDefinition } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { WorkspaceModule } from '../workspace-modules/schemas/workspace-module.schema.js';
import type { ListRequestsDto } from './dto/request.dto.js';
import { RequestAccessPolicy } from './request-access.policy.js';
import { RequestSnapshotFactory } from './request-snapshot.factory.js';
import type {
  AvailableActions,
  DefinitionSummary,
  RequestDefinitionVersion,
  RequestFormSummary,
  StoredRequest,
} from './request.types.js';
import { Request, type RequestStatus } from './schemas/request.schema.js';

const REQUEST_STATUS_GROUPS: Readonly<Record<NonNullable<ListRequestsDto['statusGroup']>, readonly RequestStatus[]>> = {
  DRAFT: ['DRAFT'],
  IN_PROGRESS: ['IN_PROGRESS'],
  REVISION_REQUESTED: ['REVISION_REQUESTED'],
  COMPLETED: ['APPROVED', 'REJECTED'],
  CANCELLED: ['CANCELLED', 'VOIDED'],
};

@Injectable()
export class RequestQueryService {
  constructor(
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(FormDefinition.name) private readonly forms: Model<FormDefinition>,
    @InjectModel(WorkflowDefinition.name) private readonly workflows: Model<WorkflowDefinition>,
    @InjectModel(WorkspaceModule.name) private readonly workspaceModules: Model<WorkspaceModule>,
    @InjectModel(ApprovalHistory.name) private readonly histories: Model<ApprovalHistory>,
    private readonly accessPolicy: RequestAccessPolicy,
    private readonly snapshots: RequestSnapshotFactory,
  ) {}

  async availableForms() {
    const moduleEnabled = await this.workspaceModules.exists({ moduleKey: 'MY_REQUESTS', isEnabled: true });
    if (!moduleEnabled) return [];

    const workflows = await this.workflows.find({ status: 'PUBLISHED' })
      .select({ _id: 1, code: 1, version: 1, formDefinitionId: 1 })
      .lean().exec();
    if (!workflows.length) return [];

    const workflowByForm = new Map(workflows.map((workflow) => [workflow.formDefinitionId.toString(), workflow]));
    const forms = await this.forms.find({
      _id: { $in: workflows.map((workflow) => workflow.formDefinitionId) },
      status: 'PUBLISHED',
    }).sort({ name: 1, code: 1 }).lean().exec();

    return forms.flatMap((form) => {
      const workflow = workflowByForm.get(form._id.toString());
      if (!workflow) return [];
      return [{
        id: form._id.toString(),
        code: form.code,
        version: form.version,
        name: form.name,
        description: form.description,
        fields: form.fields,
        settings: form.settings,
        workflow: {
          id: workflow._id.toString(),
          code: workflow.code,
          version: workflow.version,
        },
      }];
    });
  }

  async isMyRequestsModuleEnabled(session?: ClientSession): Promise<boolean> {
    const query = this.workspaceModules.exists({ moduleKey: 'MY_REQUESTS', isEnabled: true });
    if (session) query.session(session);
    return Boolean(await query);
  }

  findOwn(userId: string, query: ListRequestsDto) {
    return this.list(query, { requesterUserId: new Types.ObjectId(userId) });
  }

  findAll(query: ListRequestsDto) {
    return this.list(query, {});
  }

  async findOne(userId: string, id: string, permissionKeys: readonly string[]) {
    const request = await this.requests.findById(id).lean().exec();
    if (!request) throw this.accessPolicy.notFound();
    const stored = request as StoredRequest;
    if (!stored.formSnapshot) {
      const form = await this.forms.findOne({ _id: stored.formDefinitionId, version: stored.formVersion }).lean().exec();
      if (form) stored.formSnapshot = this.snapshots.createFormSnapshot(form as FormDefinition & { _id: Types.ObjectId });
    }
    await this.accessPolicy.requireReadAccess(stored, userId, permissionKeys);
    const currentApprovalTaskId = await this.accessPolicy.currentApprovalTaskId(stored, userId, permissionKeys);
    const definitionVersion = await this.getDefinitionVersion(stored);
    return this.toDetail(
      stored,
      this.accessPolicy.availableActions(
        stored,
        userId,
        permissionKeys,
        Boolean(currentApprovalTaskId),
        definitionVersion,
      ),
      currentApprovalTaskId,
      definitionVersion,
    );
  }

  async history(userId: string, id: string, permissionKeys: readonly string[]) {
    const request = await this.requests.findById(id).select({ requesterUserId: 1 }).lean().exec();
    if (!request) throw this.accessPolicy.notFound();
    await this.accessPolicy.requireReadAccess(request as StoredRequest, userId, permissionKeys);
    return this.histories.find({ requestId: request._id })
      .sort({ sequenceNo: 1, _id: 1 })
      .lean().exec();
  }

  async getDefinitionVersion(
    request: StoredRequest,
    session?: ClientSession,
  ): Promise<RequestDefinitionVersion> {
    if (request.status !== 'DRAFT') return { status: 'SNAPSHOT_LOCKED' };

    const referencedFormQuery = this.forms.findById(request.formDefinitionId)
      .select({ code: 1, name: 1, version: 1, status: 1 });
    if (session) referencedFormQuery.session(session);
    const referencedForm = await referencedFormQuery.lean().exec();
    if (!referencedForm) return { status: 'OUTDATED' };

    const currentFormQuery = this.forms.findOne({ code: referencedForm.code, status: 'PUBLISHED' })
      .select({ code: 1, name: 1, version: 1 });
    if (session) currentFormQuery.session(session);
    const currentForm = await currentFormQuery.lean().exec();
    if (!currentForm) return { status: 'OUTDATED' };

    const currentWorkflowQuery = this.workflows.findOne({
      formDefinitionId: currentForm._id,
      status: 'PUBLISHED',
    }).select({ code: 1, name: 1, version: 1 });
    if (session) currentWorkflowQuery.session(session);
    const currentWorkflow = await currentWorkflowQuery.lean().exec();
    const currentFormSummary = this.definitionSummary(currentForm);
    const currentWorkflowSummary = currentWorkflow ? this.definitionSummary(currentWorkflow) : undefined;
    const isCurrent = currentForm._id.equals(request.formDefinitionId)
      && currentForm.version === request.formVersion
      && currentWorkflow?._id.equals(request.workflowDefinitionId) === true
      && currentWorkflow.version === request.workflowVersion;
    return {
      status: isCurrent ? 'CURRENT' : 'OUTDATED',
      currentForm: currentFormSummary,
      ...(currentWorkflowSummary ? { currentWorkflow: currentWorkflowSummary } : {}),
    };
  }

  definitionVersionOutdated(version: RequestDefinitionVersion): ConflictException {
    return new ConflictException({
      code: 'DEFINITION_VERSION_OUTDATED',
      message: version.currentForm && version.currentWorkflow
        ? 'Bản nháp đang dùng phiên bản Form–Workflow cũ. Hãy tạo phiếu mới từ phiên bản hiện hành.'
        : 'Bản nháp đang dùng phiên bản Form–Workflow không còn được phát hành và chưa có phiên bản thay thế.',
      details: { definitionVersion: version },
    });
  }

  private async list(query: ListRequestsDto, baseFilter: QueryFilter<Request>) {
    const filter: QueryFilter<Request> = { ...baseFilter };
    if (query.status && query.statusGroup) {
      throw new BadRequestException('Chỉ được dùng status hoặc statusGroup trong một truy vấn.');
    }
    if (query.status) filter.status = query.status;
    if (query.statusGroup) filter.status = { $in: REQUEST_STATUS_GROUPS[query.statusGroup] };
    if (query.formDefinitionId) filter.formDefinitionId = new Types.ObjectId(query.formDefinitionId);
    if (query.search) {
      const search = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = [{ requestNo: search }, { title: search }];
    }
    if (query.dateFrom || query.dateTo) {
      const from = query.dateFrom ? new Date(query.dateFrom) : undefined;
      const to = query.dateTo ? new Date(query.dateTo) : undefined;
      if (from && to && from > to) throw new BadRequestException('dateFrom không được sau dateTo.');
      filter.createdAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }
    const direction: 1 | -1 = query.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [query.sortBy]: direction, _id: direction };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.requests.find(filter).sort(sort).skip(skip).limit(query.limit).lean().exec(),
      this.requests.countDocuments(filter).exec(),
    ]);
    const storedItems = items as StoredRequest[];
    const forms = await this.requestFormMap(storedItems);
    return {
      data: storedItems.map((item) => this.toSummary(item, forms)),
      pagination: createPaginationMetadata(query.page, query.limit, total),
    };
  }

  private definitionSummary(definition: {
    _id: Types.ObjectId;
    code: string;
    name: string;
    version: number;
  }): DefinitionSummary {
    return {
      id: definition._id.toString(),
      code: definition.code,
      name: definition.name,
      version: definition.version,
    };
  }

  private async requestFormMap(requests: readonly StoredRequest[]): Promise<Map<string, RequestFormSummary>> {
    const missingIds = [...new Set(requests
      .filter((request) => !this.formSummaryFromSnapshot(request.formSnapshot))
      .map((request) => request.formDefinitionId.toString()))];
    if (!missingIds.length) return new Map();
    const forms = await this.forms.find({ _id: { $in: missingIds } })
      .select({ code: 1, name: 1, version: 1 })
      .lean()
      .exec();
    return new Map(forms.map((form) => [form._id.toString(), {
      id: form._id.toString(),
      code: form.code,
      name: form.name,
      version: form.version,
    }]));
  }

  private formSummaryFromSnapshot(snapshot: Record<string, unknown> | undefined): RequestFormSummary | undefined {
    if (!snapshot) return undefined;
    const { id, code, name, version } = snapshot;
    if (typeof id !== 'string' || typeof code !== 'string' || typeof name !== 'string' || typeof version !== 'number') return undefined;
    return { id, code, name, version };
  }

  private toSummary(request: StoredRequest, forms: ReadonlyMap<string, RequestFormSummary> = new Map()) {
    const form = this.formSummaryFromSnapshot(request.formSnapshot) ?? forms.get(request.formDefinitionId.toString());
    return {
      id: request._id.toString(),
      requestNo: request.requestNo,
      title: request.title,
      status: request.status,
      formDefinitionId: request.formDefinitionId.toString(),
      formVersion: request.formVersion,
      ...(form ? { form } : {}),
      requesterUserId: request.requesterUserId.toString(),
      requesterSnapshot: request.requesterSnapshot,
      submittedAt: request.submittedAt,
      completedAt: request.completedAt,
      currentStepKey: request.currentStepKey,
      currentStepName: this.currentStepName(request),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private currentStepName(request: StoredRequest): string | undefined {
    if (!request.currentStepKey || !request.workflowSnapshot) return undefined;
    const steps = (request.workflowSnapshot as { steps?: unknown }).steps;
    if (!Array.isArray(steps)) return undefined;
    const step = steps.find((item): item is { stepKey: string; name?: string } => (
      typeof item === 'object'
      && item !== null
      && 'stepKey' in item
      && (item as { stepKey?: unknown }).stepKey === request.currentStepKey
    ));
    return step && typeof step.name === 'string' ? step.name : undefined;
  }

  private toDetail(
    request: StoredRequest,
    availableActions: AvailableActions,
    currentApprovalTaskId?: string,
    definitionVersion: RequestDefinitionVersion = { status: 'SNAPSHOT_LOCKED' },
  ) {
    return {
      ...this.toSummary(request),
      workflowDefinitionId: request.workflowDefinitionId.toString(),
      workflowVersion: request.workflowVersion,
      formData: request.formData,
      formSnapshot: request.formSnapshot,
      workflowSnapshot: request.workflowSnapshot,
      currentStepKey: request.currentStepKey,
      currentStepRunNo: request.currentStepRunNo,
      revisionRound: request.revisionRound,
      historySequence: request.historySequence,
      cancelledAt: request.cancelledAt,
      cancelReason: request.cancelReason,
      voidedAt: request.voidedAt,
      voidReason: request.voidReason,
      currentApprovalTaskId,
      definitionVersion,
      availableActions,
    };
  }
}
