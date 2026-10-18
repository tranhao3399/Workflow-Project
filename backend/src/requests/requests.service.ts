import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import {
  ClientSession,
  Connection,
  Model,
  QueryFilter,
  Types,
} from 'mongoose';
import { ApprovalHistory } from '../approvals/schemas/approval-history.schema.js';
import { ApprovalTask } from '../approvals/schemas/approval-task.schema.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { Department } from '../departments/schemas/department.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { FilesService } from '../files/files.service.js';
import { DynamicFormValidatorService } from '../form-definitions/dynamic-form-validator.service.js';
import {
  FormDefinition,
  type FormField,
} from '../form-definitions/schemas/form-definition.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Position } from '../positions/schemas/position.schema.js';
import { User } from '../users/schemas/user.schema.js';
import { WorkflowDefinition } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { WorkflowHistoryService } from '../workflow-runtime/workflow-history.service.js';
import { WorkflowRuntimeService } from '../workflow-runtime/workflow-runtime.service.js';
import { WorkspaceModule } from '../workspace-modules/schemas/workspace-module.schema.js';
import {
  CreateRequestDto,
  ListRequestsDto,
  UpdateRequestDto,
} from './dto/request.dto.js';
import {
  Request,
  type RequestDocument,
  type RequestStatus,
  type RequesterSnapshot,
} from './schemas/request.schema.js';

type StoredRequest = Request & { _id: Types.ObjectId; __v?: number };

interface ActorContext {
  userId: Types.ObjectId;
  employeeId: Types.ObjectId;
  requesterSnapshot: RequesterSnapshot;
}

export interface AvailableActions {
  canEdit: boolean;
  canSubmit: boolean;
  canResubmit: boolean;
  canCancel: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRequestRevision: boolean;
  canVoid: boolean;
  canDelete: boolean;
  canRecreate: boolean;
}

export interface RequestFormSummary {
  id: string;
  code: string;
  name: string;
  version: number;
}

export interface DefinitionSummary {
  id: string;
  code: string;
  name: string;
  version: number;
}

export interface RequestDefinitionVersion {
  status: 'CURRENT' | 'OUTDATED' | 'SNAPSHOT_LOCKED';
  currentForm?: DefinitionSummary;
  currentWorkflow?: DefinitionSummary;
}

export interface DraftMigrationReviewItem {
  fieldKey: string;
  label: string;
  reason: 'FILE_REUPLOAD_REQUIRED' | 'FIELD_REMOVED' | 'TYPE_CHANGED' | 'VALUE_INVALID' | 'REQUIRED_VALUE_MISSING';
  message: string;
}

const VOIDABLE_STATUSES = new Set<RequestStatus>([
  'IN_PROGRESS',
  'REVISION_REQUESTED',
  'APPROVED',
  'REJECTED',
]);

const REQUEST_STATUS_GROUPS: Readonly<Record<NonNullable<ListRequestsDto['statusGroup']>, readonly RequestStatus[]>> = {
  DRAFT: ['DRAFT'],
  IN_PROGRESS: ['IN_PROGRESS'],
  REVISION_REQUESTED: ['REVISION_REQUESTED'],
  COMPLETED: ['APPROVED', 'REJECTED'],
  CANCELLED: ['CANCELLED', 'VOIDED'],
};

@Injectable()
export class RequestsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(FormDefinition.name) private readonly forms: Model<FormDefinition>,
    @InjectModel(WorkflowDefinition.name) private readonly workflows: Model<WorkflowDefinition>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Department.name) private readonly departments: Model<Department>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
    @InjectModel(WorkspaceModule.name) private readonly workspaceModules: Model<WorkspaceModule>,
    @InjectModel(ApprovalTask.name) private readonly tasks: Model<ApprovalTask>,
    @InjectModel(ApprovalHistory.name) private readonly histories: Model<ApprovalHistory>,
    private readonly dynamicFormValidator: DynamicFormValidatorService,
    private readonly files: FilesService,
    private readonly runtime: WorkflowRuntimeService,
    private readonly workflowHistory: WorkflowHistoryService,
    private readonly auditLogs: AuditLogService,
    private readonly notifications: NotificationsService,
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

  findOwn(userId: string, query: ListRequestsDto) {
    return this.list(query, { requesterUserId: new Types.ObjectId(userId) });
  }

  findAll(query: ListRequestsDto) {
    return this.list(query, {});
  }

  async findOne(userId: string, id: string, permissionKeys: readonly string[]) {
    const request = await this.requests.findById(id).lean().exec();
    if (!request) throw this.notFound();
    const stored = request as StoredRequest;
    if (!stored.formSnapshot) {
      const form = await this.forms.findOne({ _id: stored.formDefinitionId, version: stored.formVersion }).lean().exec();
      if (form) stored.formSnapshot = this.formSnapshot(form as FormDefinition & { _id: Types.ObjectId });
    }
    await this.requireReadAccess(stored, userId, permissionKeys);
    const currentApprovalTaskId = await this.currentApprovalTaskId(stored, userId, permissionKeys);
    const definitionVersion = await this.definitionVersion(stored);
    return this.toDetail(
      stored,
      this.availableActions(stored, userId, permissionKeys, Boolean(currentApprovalTaskId), definitionVersion),
      currentApprovalTaskId,
      definitionVersion,
    );
  }

  async history(userId: string, id: string, permissionKeys: readonly string[]) {
    const request = await this.requests.findById(id).select({ requesterUserId: 1 }).lean().exec();
    if (!request) throw this.notFound();
    await this.requireReadAccess(request as StoredRequest, userId, permissionKeys);
    return this.histories.find({ requestId: request._id })
      .sort({ sequenceNo: 1, _id: 1 })
      .lean().exec();
  }

  async create(
    context: RequestWithContext,
    userId: string,
    input: CreateRequestDto,
    permissionKeys: readonly string[] = [],
  ) {
    const requestId = await this.inTransaction(async (session) => {
      const moduleEnabled = await this.workspaceModules.exists({
        moduleKey: 'MY_REQUESTS',
        isEnabled: true,
      }).session(session);
      if (!moduleEnabled) {
        throw new ConflictException({ code: 'REQUESTS_MODULE_DISABLED', message: 'Module Phiếu của tôi đang tắt.' });
      }

      const actor = await this.actorContext(userId, session);
      const form = await this.forms.findOne({ _id: input.formDefinitionId, status: 'PUBLISHED' })
        .session(session).exec();
      if (!form) throw new NotFoundException('Không tìm thấy biểu mẫu đang được phát hành.');
      const workflow = await this.workflows.findOne({ formDefinitionId: form._id, status: 'PUBLISHED' })
        .session(session).exec();
      if (!workflow) {
        throw new ConflictException({
          code: 'PUBLISHED_WORKFLOW_NOT_FOUND',
          message: 'Biểu mẫu chưa có Workflow đang được phát hành.',
        });
      }
      await this.lockPublishedPackage(form, workflow, session);

      const [request] = await this.requests.create([{
        requestNo: this.requestNumber(),
        title: form.name,
        formDefinitionId: form._id,
        workflowDefinitionId: workflow._id,
        formVersion: form.version,
        workflowVersion: workflow.version,
        requesterUserId: actor.userId,
        requesterEmployeeId: actor.employeeId,
        requesterSnapshot: actor.requesterSnapshot,
        formData: {},
        formSnapshot: this.formSnapshot(form),
        status: 'DRAFT',
        revisionRound: 0,
        historySequence: 0,
        updatedBy: actor.userId,
      }], { session });
      await this.workflowHistory.record(request, {
        actorUserId: actor.userId,
        actorSnapshot: actor.requesterSnapshot,
        action: 'CREATED',
        toStatus: 'DRAFT',
      }, session);
      await this.recordRequestAudit(
        context,
        request,
        'REQUEST.DRAFT_CREATED',
        'Đã tạo phiếu yêu cầu nháp.',
        session,
        undefined,
        {
          requestNo: request.requestNo,
          title: request.title,
          status: request.status,
        },
      );
      return request._id.toString();
    });
    return this.findOne(userId, requestId, permissionKeys);
  }

  async update(
    context: RequestWithContext,
    userId: string,
    id: string,
    input: UpdateRequestDto,
    permissionKeys: readonly string[] = [],
  ) {
    if (input.title === undefined && input.formData === undefined) {
      throw new BadRequestException('Cần cung cấp ít nhất một trường để cập nhật.');
    }
    await this.inTransaction(async (session) => {
      const request = await this.ownedRequest(id, userId, session);
      if (request.status !== 'DRAFT' && request.status !== 'REVISION_REQUESTED') {
        throw new ConflictException({
          code: 'REQUEST_NOT_EDITABLE',
          message: 'Chỉ phiếu DRAFT hoặc đang được yêu cầu chỉnh sửa mới có thể cập nhật.',
        });
      }
      if (request.status === 'DRAFT') await this.publishedPackage(request, session);
      const before = { title: request.title, status: request.status };
      if (input.title !== undefined) request.title = input.title;
      if (input.formData !== undefined) {
        const source = await this.requestFileValidationSource(request, session);
        await this.files.attachRequestFileReferences(request._id, input.formData, source, session);
        request.formData = input.formData;
        request.markModified('formData');
      }
      request.updatedBy = new Types.ObjectId(userId);
      await request.save({ session });
      await this.recordRequestAudit(
        context,
        request,
        'REQUEST.UPDATED',
        'Đã cập nhật nội dung phiếu yêu cầu.',
        session,
        before,
        { title: request.title, status: request.status },
        {
          changedFields: [
            ...(input.title !== undefined ? ['title'] : []),
            ...(input.formData !== undefined ? ['formData'] : []),
          ],
        },
      );
    });
    return this.findOne(userId, id, permissionKeys);
  }

  async recreateFromDraft(
    context: RequestWithContext,
    userId: string,
    id: string,
    permissionKeys: readonly string[] = [],
  ) {
    const result = await this.inTransaction(async (session) => {
      const moduleEnabled = await this.workspaceModules.exists({
        moduleKey: 'MY_REQUESTS',
        isEnabled: true,
      }).session(session);
      if (!moduleEnabled) {
        throw new ConflictException({ code: 'REQUESTS_MODULE_DISABLED', message: 'Module Phiếu của tôi đang tắt.' });
      }
      const source = await this.ownedRequest(id, userId, session);
      if (source.status !== 'DRAFT') {
        throw new ConflictException({
          code: 'REQUEST_RECREATE_NOT_ALLOWED',
          message: 'Chỉ có thể tạo phiếu mới từ một bản nháp lỗi thời.',
        });
      }

      const version = await this.definitionVersion(source as StoredRequest, session);
      if (version.status !== 'OUTDATED') {
        throw new ConflictException({
          code: 'REQUEST_DEFINITION_STILL_CURRENT',
          message: 'Bản nháp vẫn đang dùng phiên bản Form–Workflow hiện hành.',
        });
      }
      if (!version.currentForm || !version.currentWorkflow) {
        throw new ConflictException({
          code: 'DEFINITION_REPLACEMENT_NOT_AVAILABLE',
          message: 'Chưa có cặp Form–Workflow PUBLISHED thay thế cho bản nháp này.',
        });
      }

      const [form, workflow] = await Promise.all([
        this.forms.findOne({
          _id: version.currentForm.id,
          version: version.currentForm.version,
          status: 'PUBLISHED',
        }).session(session).exec(),
        this.workflows.findOne({
          _id: version.currentWorkflow.id,
          version: version.currentWorkflow.version,
          formDefinitionId: version.currentForm.id,
          status: 'PUBLISHED',
        }).session(session).exec(),
      ]);
      if (!form || !workflow) throw this.definitionVersionOutdated(version);
      await this.lockPublishedPackage(form, workflow, session);

      const actor = await this.actorContext(userId, session);
      const sourceForm = this.isRecord(source.formSnapshot) && Array.isArray(source.formSnapshot.fields)
        ? undefined
        : await this.forms.findById(source.formDefinitionId).select({ fields: 1 }).session(session).lean().exec();
      const migration = this.migrateDraftData(source, form.fields, sourceForm?.fields);
      const [request] = await this.requests.create([{
        requestNo: this.requestNumber(),
        title: source.title,
        formDefinitionId: form._id,
        workflowDefinitionId: workflow._id,
        formVersion: form.version,
        workflowVersion: workflow.version,
        requesterUserId: actor.userId,
        requesterEmployeeId: actor.employeeId,
        requesterSnapshot: actor.requesterSnapshot,
        formData: migration.formData,
        formSnapshot: this.formSnapshot(form),
        status: 'DRAFT',
        revisionRound: 0,
        historySequence: 0,
        updatedBy: actor.userId,
      }], { session });
      await this.workflowHistory.record(request, {
        actorUserId: actor.userId,
        actorSnapshot: actor.requesterSnapshot,
        action: 'CREATED',
        toStatus: 'DRAFT',
        metadata: { recreatedFromRequestId: source._id.toString() },
      }, session);
      await this.recordRequestAudit(
        context,
        request,
        'REQUEST.DRAFT_CREATED',
        'Đã tạo phiếu nháp mới từ một bản nháp dùng phiên bản cũ.',
        session,
        undefined,
        {
          requestNo: request.requestNo,
          title: request.title,
          status: request.status,
        },
        {
          recreatedFromRequestId: source._id.toString(),
          copiedFieldKeys: migration.copiedFieldKeys,
          reviewFieldKeys: migration.reviewItems.map((item) => item.fieldKey),
        },
      );
      return {
        requestId: request._id.toString(),
        copiedFieldKeys: migration.copiedFieldKeys,
        reviewItems: migration.reviewItems,
      };
    });

    return {
      request: await this.findOne(userId, result.requestId, permissionKeys),
      migration: {
        copiedFieldKeys: result.copiedFieldKeys,
        reviewItems: result.reviewItems,
      },
    };
  }

  async submit(
    context: RequestWithContext,
    userId: string,
    id: string,
    permissionKeys: readonly string[] = [],
  ) {
    await this.inTransaction(async (session) => {
      const request = await this.ownedRequest(id, userId, session);
      if (request.status !== 'DRAFT') {
        throw new ConflictException({ code: 'REQUEST_NOT_DRAFT', message: 'Chỉ phiếu DRAFT mới có thể gửi.' });
      }
      const actor = await this.actorContext(userId, session);
      const { form, workflow } = await this.publishedPackage(request, session);
      this.dynamicFormValidator.assertFormDataValid({ fields: form.fields }, request.formData);
      await this.files.assertRequestFileReferencesValid(request._id, request.formData, { fields: form.fields }, session);

      request.requesterEmployeeId = actor.employeeId;
      request.requesterSnapshot = actor.requesterSnapshot;
      request.formSnapshot = this.formSnapshot(form);
      request.workflowSnapshot = this.workflowSnapshot(workflow);
      request.submittedAt = new Date();
      request.updatedBy = actor.userId;
      await this.workflowHistory.record(request, {
        actorUserId: actor.userId,
        actorSnapshot: actor.requesterSnapshot,
        action: 'SUBMITTED',
        fromStatus: 'DRAFT',
        toStatus: 'IN_PROGRESS',
      }, session);
      await this.runtime.start(request, session);
      await this.recordRequestAudit(
        context,
        request,
        'REQUEST.SUBMITTED',
        'Đã gửi phiếu yêu cầu vào quy trình phê duyệt.',
        session,
        { status: 'DRAFT' },
        {
          status: request.status,
          stepKey: request.currentStepKey,
          stepRunNo: request.currentStepRunNo,
          submittedAt: request.submittedAt,
        },
      );
    });
    return this.findOne(userId, id, permissionKeys);
  }

  async resubmit(
    context: RequestWithContext,
    userId: string,
    id: string,
    permissionKeys: readonly string[] = [],
  ) {
    await this.inTransaction(async (session) => {
      const request = await this.ownedRequest(id, userId, session);
      if (request.status !== 'REVISION_REQUESTED') {
        throw new ConflictException({
          code: 'REQUEST_NOT_REVISION_REQUESTED',
          message: 'Chỉ phiếu đang được yêu cầu chỉnh sửa mới có thể gửi lại.',
        });
      }
      const formSnapshot = this.recordSnapshot(request.formSnapshot, 'Form Snapshot');
      const result = this.dynamicFormValidator.validateSnapshot(formSnapshot, request.formData);
      if (!result.valid) {
        throw new BadRequestException({
          code: 'INVALID_FORM_DATA',
          message: result.errors.map((error) => error.message).join(' '),
          field: result.errors[0]?.fieldKey,
        });
      }
      const fields = Array.isArray(formSnapshot.fields) ? formSnapshot.fields : [];
      await this.files.assertRequestFileReferencesValid(request._id, request.formData, { fields }, session);
      const resumeStepKey = request.currentStepKey;
      const nextStepRunNo = (request.currentStepRunNo ?? 0) + 1;
      if (!resumeStepKey) {
        throw new ConflictException({
          code: 'REVISION_RESUME_STEP_MISSING',
          message: 'Phiếu không có bước Workflow để tiếp tục sau khi chỉnh sửa.',
        });
      }

      request.status = 'IN_PROGRESS';
      request.revisionRound += 1;
      request.updatedBy = new Types.ObjectId(userId);
      await this.workflowHistory.record(request, {
        actorUserId: new Types.ObjectId(userId),
        actorSnapshot: request.requesterSnapshot,
        action: 'RESUBMITTED',
        fromStatus: 'REVISION_REQUESTED',
        toStatus: 'IN_PROGRESS',
        metadata: { revisionRound: request.revisionRound },
      }, session);
      const runtimeResult = await this.runtime.advance(request, resumeStepKey, session);
      const notificationStepKey = runtimeResult.currentStepKey ?? resumeStepKey;
      const notificationStepRunNo = runtimeResult.stepRunNo ?? nextStepRunNo;
      const revisionActors = await this.revisionActorUserIds(
        request._id,
        request.revisionRound - 1,
        session,
      );
      revisionActors.add(request.requesterUserId.toString());
      for (const recipientUserId of revisionActors) {
        await this.notifications.createPersonal({
          recipientUserId,
          type: 'REVISION',
          title: 'Phiếu đã được gửi lại',
          message: `Phiếu ${request.requestNo} đã được bổ sung và gửi lại.`,
          link: `/requests/${request._id.toString()}`,
          resource: { type: 'REQUEST', id: request._id },
          createdByUserId: userId,
          data: {
            requestId: request._id.toString(),
            requestNo: request.requestNo,
            stepKey: notificationStepKey,
            stepRunNo: notificationStepRunNo,
          },
          dedupeKey: this.notificationDedupeKey(
            request._id,
            notificationStepKey,
            notificationStepRunNo,
            'RESUBMITTED',
          ),
        }, session);
      }
      await this.recordRequestAudit(
        context,
        request,
        'REQUEST.RESUBMITTED',
        'Đã gửi lại phiếu sau khi bổ sung thông tin.',
        session,
        { status: 'REVISION_REQUESTED' },
        {
          status: request.status,
          stepKey: request.currentStepKey,
          stepRunNo: request.currentStepRunNo,
        },
        { revisionRound: request.revisionRound },
      );
    });
    return this.findOne(userId, id, permissionKeys);
  }

  async cancel(
    context: RequestWithContext,
    userId: string,
    id: string,
    reason: string,
    permissionKeys: readonly string[] = [],
  ) {
    await this.inTransaction(async (session) => {
      const request = await this.ownedRequest(id, userId, session);
      if (request.status !== 'IN_PROGRESS' && request.status !== 'REVISION_REQUESTED') {
        throw new ConflictException({
          code: 'REQUEST_NOT_CANCELLABLE',
          message: 'Trạng thái hiện tại không cho phép hủy phiếu.',
        });
      }
      if (!this.cancelAllowed(request.formSnapshot)) {
        throw new ConflictException({
          code: 'REQUEST_CANCELLATION_DISABLED',
          message: 'Biểu mẫu không cho phép người tạo hủy phiếu sau khi gửi.',
        });
      }
      const fromStatus = request.status;
      const stepKey = request.currentStepKey ?? 'REQUEST';
      const stepRunNo = request.currentStepRunNo ?? 0;
      const notificationRecipients = await this.requestParticipantUserIds(request._id, userId, session);
      notificationRecipients.add(request.requesterUserId.toString());
      await this.cancelPendingTasks(request._id, 'Phiếu đã bị người tạo hủy.', session);
      request.status = 'CANCELLED';
      request.cancelledAt = new Date();
      request.cancelledBy = new Types.ObjectId(userId);
      request.cancelReason = reason;
      request.currentStepKey = undefined;
      request.currentStepRunNo = undefined;
      request.updatedBy = new Types.ObjectId(userId);
      await request.save({ session });
      await this.workflowHistory.record(request, {
        actorUserId: new Types.ObjectId(userId),
        actorSnapshot: request.requesterSnapshot,
        action: 'CANCELLED',
        fromStatus,
        toStatus: 'CANCELLED',
        comment: reason,
      }, session);
      await this.notifyRequestParticipants(
        notificationRecipients,
        request,
        stepKey,
        stepRunNo,
        'CANCELLED',
        'Phiếu đã bị hủy',
        `Phiếu ${request.requestNo} đã bị người tạo hủy.`,
        userId,
        session,
      );
      await this.recordRequestAudit(
        context,
        request,
        'REQUEST.CANCELLED',
        'Đã hủy phiếu yêu cầu.',
        session,
        { status: fromStatus, stepKey, stepRunNo },
        { status: request.status },
        { reason },
      );
    });
    return this.findOne(userId, id, permissionKeys);
  }

  async voidRequest(
    context: RequestWithContext,
    userId: string,
    id: string,
    reason: string,
    permissionKeys: readonly string[] = [],
  ) {
    await this.inTransaction(async (session) => {
      const request = await this.requests.findById(id).session(session).exec();
      if (!request) throw this.notFound();
      if (!VOIDABLE_STATUSES.has(request.status)) {
        throw new ConflictException({
          code: 'REQUEST_NOT_VOIDABLE',
          message: 'Trạng thái hiện tại không cho phép vô hiệu hóa phiếu.',
        });
      }
      const actorUserId = new Types.ObjectId(userId);
      const fromStatus = request.status;
      const stepKey = request.currentStepKey ?? 'REQUEST';
      const stepRunNo = request.currentStepRunNo ?? 0;
      const notificationRecipients = await this.requestParticipantUserIds(request._id, userId, session);
      notificationRecipients.add(request.requesterUserId.toString());
      await this.cancelPendingTasks(request._id, 'Phiếu đã bị vô hiệu hóa.', session);
      request.status = 'VOIDED';
      request.voidedAt = new Date();
      request.voidedBy = actorUserId;
      request.voidReason = reason;
      request.currentStepKey = undefined;
      request.currentStepRunNo = undefined;
      request.updatedBy = actorUserId;
      await request.save({ session });
      await this.workflowHistory.record(request, {
        actorUserId,
        action: 'VOIDED',
        fromStatus,
        toStatus: 'VOIDED',
        comment: reason,
      }, session);
      await this.notifyRequestParticipants(
        notificationRecipients,
        request,
        stepKey,
        stepRunNo,
        'VOIDED',
        'Phiếu đã bị vô hiệu hóa',
        `Phiếu ${request.requestNo} đã bị vô hiệu hóa.`,
        userId,
        session,
      );
      await this.recordRequestAudit(
        context,
        request,
        'REQUEST.VOIDED',
        'Đã vô hiệu hóa phiếu yêu cầu.',
        session,
        { status: fromStatus, stepKey, stepRunNo },
        { status: request.status },
        { reason },
      );
    });
    return this.findOne(userId, id, [...permissionKeys, 'REQUESTS.VIEW_ALL']);
  }

  async remove(
    context: RequestWithContext,
    userId: string,
    id: string,
  ): Promise<{ id: string }> {
    const result = await this.inTransaction(async (session) => {
      const request = await this.ownedRequest(id, userId, session);
      if (request.status !== 'DRAFT' || request.submittedAt) {
        throw new ConflictException({
          code: 'REQUEST_DELETE_NOT_ALLOWED',
          message: 'Chỉ phiếu DRAFT chưa từng gửi mới có thể xóa.',
        });
      }
      const claimedFiles = await this.files.claimDraftRequestFilesForDeletion(
        request._id,
        new Types.ObjectId(userId),
        session,
      );
      const version = request.get('__v');
      const deletion = await this.requests.deleteOne({ _id: request._id, __v: version }, { session }).exec();
      if (deletion.deletedCount !== 1) throw this.concurrentModification();
      await this.recordRequestAudit(
        context,
        request,
        'REQUEST.DELETED',
        'Đã xóa phiếu yêu cầu nháp.',
        session,
        {
          requestNo: request.requestNo,
          title: request.title,
          status: request.status,
        },
      );
      return { id: request._id.toString(), claimedFiles };
    });
    await this.files.finalizeClaimedDeletions(result.claimedFiles);
    return { id: result.id };
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
      const search = new RegExp(this.escapeRegExp(query.search), 'i');
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
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private async ownedRequest(id: string, userId: string, session: ClientSession): Promise<RequestDocument> {
    const request = await this.requests.findOne({ _id: id, requesterUserId: userId }).session(session).exec();
    if (!request) throw this.notFound();
    return request;
  }

  private async publishedPackage(request: RequestDocument, session: ClientSession) {
    const [form, workflow] = await Promise.all([
      this.forms.findOne({
        _id: request.formDefinitionId,
        version: request.formVersion,
        status: 'PUBLISHED',
      }).session(session).exec(),
      this.workflows.findOne({
        _id: request.workflowDefinitionId,
        version: request.workflowVersion,
        formDefinitionId: request.formDefinitionId,
        status: 'PUBLISHED',
      }).session(session).exec(),
    ]);
    if (!form || !workflow) {
      throw this.definitionVersionOutdated(await this.definitionVersion(request as StoredRequest, session));
    }
    await this.lockPublishedPackage(form, workflow, session);
    return { form, workflow };
  }

  private async lockPublishedPackage(
    form: { _id: Types.ObjectId; version: number },
    workflow: { _id: Types.ObjectId; version: number },
    session: ClientSession,
  ): Promise<void> {
    const formResult = await this.forms.updateOne(
      { _id: form._id, version: form.version, status: 'PUBLISHED' },
      { $set: { status: 'PUBLISHED' } },
      { session, timestamps: false },
    ).exec();
    const workflowResult = await this.workflows.updateOne(
      {
        _id: workflow._id,
        version: workflow.version,
        formDefinitionId: form._id,
        status: 'PUBLISHED',
      },
      { $set: { status: 'PUBLISHED' } },
      { session, timestamps: false },
    ).exec();
    if (formResult.matchedCount !== 1 || workflowResult.matchedCount !== 1) {
      throw this.concurrentModification();
    }
  }

  private async actorContext(userId: string, session: ClientSession): Promise<ActorContext> {
    const user = await this.users.findOne({ _id: userId, isActive: true })
      .select({ _id: 1, employeeId: 1 }).session(session).lean().exec();
    if (!user?.employeeId) {
      throw new ConflictException({
        code: 'ACTIVE_EMPLOYEE_REQUIRED',
        message: 'Tài khoản phải liên kết với một nhân viên đang hoạt động.',
      });
    }
    const employee = await this.employees.findOne({ _id: user.employeeId, isActive: true })
      .select({ employeeCode: 1, fullName: 1, departmentId: 1, positionId: 1, managerId: 1 })
      .session(session).lean().exec();
    if (!employee) {
      throw new ConflictException({
        code: 'ACTIVE_EMPLOYEE_REQUIRED',
        message: 'Tài khoản phải liên kết với một nhân viên đang hoạt động.',
      });
    }
    const [department, position] = await Promise.all([
      this.departments.findById(employee.departmentId).select({ name: 1 }).session(session).lean().exec(),
      this.positions.findById(employee.positionId).select({ name: 1 }).session(session).lean().exec(),
    ]);
    if (!department || !position) {
      throw new ConflictException({
        code: 'EMPLOYEE_ORGANIZATION_INVALID',
        message: 'Thông tin phòng ban hoặc chức danh của nhân viên không hợp lệ.',
      });
    }
    return {
      userId: user._id,
      employeeId: employee._id,
      requesterSnapshot: {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        departmentId: employee.departmentId,
        departmentName: department.name,
        positionId: employee.positionId,
        positionName: position.name,
        managerEmployeeId: employee.managerId,
      },
    };
  }

  private formSnapshot(form: FormDefinition & { _id: Types.ObjectId }): Record<string, unknown> {
    return {
      id: form._id.toString(),
      code: form.code,
      version: form.version,
      name: form.name,
      fields: form.fields,
      settings: form.settings,
    };
  }

  private async requestFileValidationSource(
    request: RequestDocument,
    session: ClientSession,
  ): Promise<{ fields: readonly unknown[] }> {
    if (this.isRecord(request.formSnapshot) && Array.isArray(request.formSnapshot.fields)) {
      return { fields: request.formSnapshot.fields };
    }
    const form = await this.forms.findOne({
      _id: request.formDefinitionId,
      version: request.formVersion,
    }).select({ fields: 1 }).session(session).lean().exec();
    if (!form) {
      throw new ConflictException({
        code: 'FORM_DEFINITION_NOT_AVAILABLE',
        message: 'Không tìm thấy cấu hình biểu mẫu của phiếu.',
      });
    }
    return { fields: form.fields };
  }

  private workflowSnapshot(workflow: WorkflowDefinition & { _id: Types.ObjectId }): Record<string, unknown> {
    return {
      id: workflow._id.toString(),
      code: workflow.code,
      version: workflow.version,
      name: workflow.name,
      startStepKey: workflow.startStepKey,
      steps: workflow.steps,
    };
  }

  private async requireReadAccess(
    request: Pick<StoredRequest, '_id' | 'requesterUserId'>,
    userId: string,
    permissionKeys: readonly string[],
  ): Promise<void> {
    if (request.requesterUserId.toString() === userId || permissionKeys.includes('REQUESTS.VIEW_ALL')) return;
    const hasTask = await this.tasks.exists({ requestId: request._id, assigneeUserId: userId });
    if (!hasTask) throw this.notFound();
  }

  private availableActions(
    request: StoredRequest,
    userId: string,
    permissionKeys: readonly string[],
    hasPendingTask: boolean,
    definitionVersion: RequestDefinitionVersion,
  ): AvailableActions {
    const permissions = new Set(permissionKeys);
    const owner = request.requesterUserId.toString() === userId;
    const editable = request.status === 'REVISION_REQUESTED'
      || (request.status === 'DRAFT' && definitionVersion.status === 'CURRENT');
    const pendingTask = request.status === 'IN_PROGRESS'
      && hasPendingTask
      && permissions.has('APPROVALS.APPROVE_ASSIGNED');
    return {
      canEdit: owner && editable && permissions.has('REQUESTS.UPDATE_OWN_DRAFT'),
      canSubmit: owner
        && request.status === 'DRAFT'
        && definitionVersion.status === 'CURRENT'
        && permissions.has('REQUESTS.SUBMIT'),
      canResubmit: owner && request.status === 'REVISION_REQUESTED' && permissions.has('REQUESTS.SUBMIT'),
      canCancel: owner
        && (request.status === 'IN_PROGRESS' || request.status === 'REVISION_REQUESTED')
        && this.cancelAllowed(request.formSnapshot)
        && permissions.has('REQUESTS.CANCEL_OWN'),
      canApprove: pendingTask,
      canReject: pendingTask,
      canRequestRevision: pendingTask,
      canVoid: VOIDABLE_STATUSES.has(request.status) && permissions.has('REQUESTS.VOID'),
      canDelete: owner && request.status === 'DRAFT' && !request.submittedAt && permissions.has('REQUESTS.DELETE_OWN_DRAFT'),
      canRecreate: owner
        && request.status === 'DRAFT'
        && definitionVersion.status === 'OUTDATED'
        && Boolean(definitionVersion.currentForm && definitionVersion.currentWorkflow)
        && permissions.has('REQUESTS.CREATE'),
    };
  }

  private async currentApprovalTaskId(
    request: StoredRequest,
    userId: string,
    permissionKeys: readonly string[],
  ): Promise<string | undefined> {
    if (request.status !== 'IN_PROGRESS' || !permissionKeys.includes('APPROVALS.APPROVE_ASSIGNED')) {
      return undefined;
    }
    const task = await this.tasks.findOne({
      requestId: request._id,
      assigneeUserId: new Types.ObjectId(userId),
      stepKey: request.currentStepKey,
      stepRunNo: request.currentStepRunNo,
      status: 'PENDING',
    }).select({ _id: 1 }).lean().exec();
    return task?._id.toString();
  }

  private async cancelPendingTasks(
    requestId: Types.ObjectId,
    cancelReason: string,
    session: ClientSession,
  ): Promise<void> {
    await this.tasks.updateMany(
      { requestId, status: 'PENDING' },
      { $set: { status: 'CANCELLED', cancelReason } },
      { session, runValidators: true },
    ).exec();
  }

  private async requestParticipantUserIds(
    requestId: Types.ObjectId,
    excludedUserId: string,
    session: ClientSession,
  ): Promise<Set<string>> {
    const tasks = await this.tasks.find({ requestId })
      .select({ assigneeUserId: 1 })
      .session(session)
      .lean()
      .exec();
    return new Set(tasks
      .map((task) => task.assigneeUserId.toString())
      .filter((assigneeUserId) => assigneeUserId !== excludedUserId));
  }

  private async revisionActorUserIds(
    requestId: Types.ObjectId,
    revisionRound: number,
    session: ClientSession,
  ): Promise<Set<string>> {
    const tasks = await this.tasks.find({
      requestId,
      revisionRound,
      status: 'REVISION_REQUESTED',
    }).select({ assigneeUserId: 1 }).session(session).lean().exec();
    return new Set(tasks.map((task) => task.assigneeUserId.toString()));
  }

  private async notifyRequestParticipants(
    recipients: ReadonlySet<string>,
    request: RequestDocument,
    stepKey: string,
    stepRunNo: number,
    action: 'CANCELLED' | 'VOIDED',
    title: string,
    message: string,
    actorUserId: string,
    session: ClientSession,
  ): Promise<void> {
    for (const recipientUserId of recipients) {
      await this.notifications.createPersonal({
        recipientUserId,
        type: 'SYSTEM',
        title,
        message,
        link: `/requests/${request._id.toString()}`,
        resource: { type: 'REQUEST', id: request._id },
        createdByUserId: actorUserId,
        data: {
          requestId: request._id.toString(),
          requestNo: request.requestNo,
          stepKey,
          stepRunNo,
          action,
        },
        dedupeKey: this.notificationDedupeKey(
          request._id,
          stepKey,
          stepRunNo,
          action,
        ),
      }, session);
    }
  }

  private async recordRequestAudit(
    context: RequestWithContext,
    request: RequestDocument,
    action: string,
    description: string,
    session?: ClientSession,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogs.record(context, {
      action,
      description,
      outcome: AuditOutcome.SUCCESS,
      resource: {
        type: 'REQUEST',
        id: request._id.toString(),
        code: request.requestNo,
        name: request.title,
      },
      changes: before || after ? { before, after } : undefined,
      metadata: {
        formDefinitionId: request.formDefinitionId.toString(),
        workflowDefinitionId: request.workflowDefinitionId.toString(),
        ...metadata,
      },
    }, session);
  }

  private notificationDedupeKey(
    requestId: Types.ObjectId,
    stepKey: string,
    stepRunNo: number,
    action: string,
  ): string {
    return `REQUEST:${requestId.toString()}:STEP:${stepKey}:RUN:${stepRunNo}:${action}`;
  }

  private cancelAllowed(snapshot: Record<string, unknown> | undefined): boolean {
    if (!snapshot || !this.isRecord(snapshot.settings)) return false;
    return snapshot.settings.allowCancelAfterSubmit === true;
  }

  private recordSnapshot(value: unknown, label: string): Record<string, unknown> {
    if (!this.isRecord(value)) {
      throw new ConflictException({ code: 'INVALID_REQUEST_SNAPSHOT', message: `${label} không hợp lệ.` });
    }
    return value;
  }

  private async definitionVersion(
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

  private definitionVersionOutdated(version: RequestDefinitionVersion): ConflictException {
    return new ConflictException({
      code: 'DEFINITION_VERSION_OUTDATED',
      message: version.currentForm && version.currentWorkflow
        ? 'Bản nháp đang dùng phiên bản Form–Workflow cũ. Hãy tạo phiếu mới từ phiên bản hiện hành.'
        : 'Bản nháp đang dùng phiên bản Form–Workflow không còn được phát hành và chưa có phiên bản thay thế.',
      details: { definitionVersion: version },
    });
  }

  private migrateDraftData(
    source: RequestDocument,
    targetFields: readonly FormField[],
    sourceFieldFallback: readonly FormField[] = [],
  ): {
      formData: Record<string, unknown>;
      copiedFieldKeys: string[];
      reviewItems: DraftMigrationReviewItem[];
    } {
    const sourceFields = this.isRecord(source.formSnapshot) && Array.isArray(source.formSnapshot.fields)
      ? source.formSnapshot.fields.filter((field): field is Record<string, unknown> => this.isRecord(field))
      : sourceFieldFallback as unknown as readonly Record<string, unknown>[];
    const sourceByKey = new Map(sourceFields
      .filter((field) => typeof field.key === 'string')
      .map((field) => [String(field.key), field]));
    const targetRecords = targetFields as unknown as readonly Record<string, unknown>[];
    const targetByKey = new Map(targetRecords.map((field) => [String(field.key), field]));
    const formData: Record<string, unknown> = {};
    const reviewItems = new Map<string, DraftMigrationReviewItem>();
    const addReview = (item: DraftMigrationReviewItem) => {
      reviewItems.set(`${item.fieldKey}:${item.reason}`, item);
    };

    for (const [fieldKey, value] of Object.entries(source.formData)) {
      if (!this.hasFormValue(value)) continue;
      const sourceField = sourceByKey.get(fieldKey);
      const targetField = targetByKey.get(fieldKey);
      const label = this.fieldLabel(sourceField, fieldKey);
      if (!targetField) {
        addReview({ fieldKey, label, reason: 'FIELD_REMOVED', message: `${label} không còn trong biểu mẫu mới.` });
        continue;
      }
      if (!sourceField || sourceField.type !== targetField.type) {
        addReview({ fieldKey, label, reason: 'TYPE_CHANGED', message: `${label} đã đổi kiểu dữ liệu và cần nhập lại.` });
        continue;
      }
      if (targetField.type === 'FILE') {
        addReview({
          fieldKey,
          label,
          reason: 'FILE_REUPLOAD_REQUIRED',
          message: `${label} là tệp đính kèm và cần được tải lại trên phiếu mới.`,
        });
        continue;
      }
      formData[fieldKey] = value;
    }

    let validation = this.dynamicFormValidator.validateFormData({ fields: targetFields }, formData);
    for (const error of validation.errors) {
      if (error.fieldKey === '$definition' || !Object.prototype.hasOwnProperty.call(formData, error.fieldKey)) continue;
      const field = targetByKey.get(error.fieldKey);
      delete formData[error.fieldKey];
      addReview({
        fieldKey: error.fieldKey,
        label: this.fieldLabel(field, error.fieldKey),
        reason: 'VALUE_INVALID',
        message: `${this.fieldLabel(field, error.fieldKey)} có giá trị không còn hợp lệ và cần kiểm tra lại.`,
      });
    }

    validation = this.dynamicFormValidator.validateFormData({ fields: targetFields }, formData);
    for (const error of validation.errors) {
      if (error.fieldKey === '$definition' || error.code !== 'REQUIRED') continue;
      if ([...reviewItems.values()].some((item) => item.fieldKey === error.fieldKey)) continue;
      const field = targetByKey.get(error.fieldKey);
      addReview({
        fieldKey: error.fieldKey,
        label: this.fieldLabel(field, error.fieldKey),
        reason: 'REQUIRED_VALUE_MISSING',
        message: `${this.fieldLabel(field, error.fieldKey)} là trường bắt buộc cần được bổ sung.`,
      });
    }

    return {
      formData,
      copiedFieldKeys: Object.keys(formData),
      reviewItems: [...reviewItems.values()],
    };
  }

  private fieldLabel(field: Record<string, unknown> | undefined, fallback: string): string {
    return typeof field?.label === 'string' && field.label.trim() ? field.label : fallback;
  }

  private hasFormValue(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return false;
    return !Array.isArray(value) || value.length > 0;
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

  private requestNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `REQ-${date}-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  }

  private async inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let completed = false;
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
        completed = true;
      });
      if (!completed) throw new Error('Transaction did not complete.');
      return result as T;
    } catch (error) {
      this.rethrowConcurrency(error);
    } finally {
      await session.endSession();
    }
  }

  private rethrowConcurrency(error: unknown): never {
    if (this.isConcurrencyError(error)) throw this.concurrentModification();
    throw error;
  }

  private isConcurrencyError(error: unknown): boolean {
    if (!this.isRecord(error)) return false;
    if (error.name === 'VersionError' || error.code === 112 || error.code === 251) return true;
    const labels = error.errorLabels;
    return Array.isArray(labels) && labels.some((label) => (
      label === 'TransientTransactionError' || label === 'UnknownTransactionCommitResult'
    ));
  }

  private concurrentModification(): ConflictException {
    return new ConflictException({
      code: 'CONCURRENT_MODIFICATION',
      message: 'Phiếu đã được thay đổi bởi một thao tác khác. Vui lòng tải lại dữ liệu.',
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException('Không tìm thấy phiếu yêu cầu.');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
