import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  ClientSession,
  Connection,
  Model,
  Types,
} from 'mongoose';
import { ApprovalTask } from '../approvals/schemas/approval-task.schema.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { FilesService } from '../files/files.service.js';
import { DynamicFormValidatorService } from '../form-definitions/dynamic-form-validator.service.js';
import { evaluateFormCalculations } from '../form-definitions/form-calculation.helper.js';
import { FormDefinition } from '../form-definitions/schemas/form-definition.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WorkflowDefinition } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { WorkflowHistoryService } from '../workflow-runtime/workflow-history.service.js';
import { WorkflowRuntimeService } from '../workflow-runtime/workflow-runtime.service.js';
import {
  CreateRequestDto,
  ListRequestsDto,
  UpdateRequestDto,
} from './dto/request.dto.js';
import {
  extractLeaveDaysFromFormData,
  extractLeaveDeductionConfig,
  roundLeaveDays,
} from './leave-deduction.helper.js';
import { RequestAccessPolicy } from './request-access.policy.js';
import {
  RequestActorContextService,
  type RequestActorAutoFillProfile,
} from './request-actor-context.service.js';
import {
  applyAutoFillToMigratedFormData,
  buildInitialRequestFormData,
  enforceLockedAutoFillFormData,
  hasLockedAutoFillFields,
  isRecord,
} from './request-data.helpers.js';
import { RequestDraftMigrationService } from './request-draft-migration.service.js';
import { RequestNumberService } from './request-number.service.js';
import { RequestQueryService } from './request-query.service.js';
import { RequestSnapshotFactory } from './request-snapshot.factory.js';
import type { StoredRequest } from './request.types.js';
import {
  Request,
  type RequestDocument,
} from './schemas/request.schema.js';

export type {
  AvailableActions,
  DefinitionSummary,
  DraftMigrationReviewItem,
  RequestDefinitionVersion,
  RequestFormSummary,
} from './request.types.js';

@Injectable()
export class RequestsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(FormDefinition.name) private readonly forms: Model<FormDefinition>,
    @InjectModel(WorkflowDefinition.name) private readonly workflows: Model<WorkflowDefinition>,
    @InjectModel(ApprovalTask.name) private readonly tasks: Model<ApprovalTask>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    private readonly dynamicFormValidator: DynamicFormValidatorService,
    private readonly files: FilesService,
    private readonly runtime: WorkflowRuntimeService,
    private readonly workflowHistory: WorkflowHistoryService,
    private readonly auditLogs: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly queryService: RequestQueryService,
    private readonly accessPolicy: RequestAccessPolicy,
    private readonly actorContext: RequestActorContextService,
    private readonly snapshots: RequestSnapshotFactory,
    private readonly draftMigration: RequestDraftMigrationService,
    private readonly requestNumbers: RequestNumberService,
  ) {}

  availableForms() {
    return this.queryService.availableForms();
  }

  findOwn(userId: string, query: ListRequestsDto) {
    return this.queryService.findOwn(userId, query);
  }

  findAll(query: ListRequestsDto) {
    return this.queryService.findAll(query);
  }

  findManaged(userId: string, query: ListRequestsDto) {
    return this.queryService.findManaged(userId, query);
  }

  findOne(userId: string, id: string, permissionKeys: readonly string[]) {
    return this.queryService.findOne(userId, id, permissionKeys);
  }

  history(userId: string, id: string, permissionKeys: readonly string[]) {
    return this.queryService.history(userId, id, permissionKeys);
  }

  async addComment(
    context: RequestWithContext,
    userId: string,
    id: string,
    comment: string,
    permissionKeys: readonly string[] = [],
  ) {
    return this.inTransaction(async (session) => {
      const request = await this.requests.findById(id).session(session).exec();
      if (!request) throw this.accessPolicy.notFound();
      await this.accessPolicy.requireReadAccess(request as StoredRequest, userId, permissionKeys);

      const actorUserId = new Types.ObjectId(userId);
      let actorSnapshot: { fullName?: string; employeeCode?: string; departmentName?: string; positionName?: string };
      try {
        const actor = await this.actorContext.resolve(userId, session);
        actorSnapshot = {
          fullName: actor.requesterSnapshot.fullName,
          employeeCode: actor.requesterSnapshot.employeeCode,
          departmentName: actor.requesterSnapshot.departmentName,
          positionName: actor.requesterSnapshot.positionName,
        };
      } catch {
        actorSnapshot = {
          fullName: context.user?.fullName || context.user?.email || 'Người dùng',
          ...(context.user?.department ? { departmentName: context.user.department } : {}),
        };
      }

      const historyEntry = await this.workflowHistory.record(request, {
        stepKey: request.currentStepKey,
        stepRunNo: request.currentStepRunNo,
        actorUserId,
        actorSnapshot,
        action: 'COMMENTED',
        comment,
      }, session);

      if (request.status !== 'DRAFT') {
        const recipients = await this.requestParticipantUserIds(request._id, userId, session);
        if (request.requesterUserId.toString() !== userId) {
          recipients.add(request.requesterUserId.toString());
        }
        await this.notifyRequestParticipants(
          recipients,
          request,
          'COMMENT',
          historyEntry.sequenceNo,
          'COMMENTED',
          'Có bình luận mới trên phiếu',
          `${actorSnapshot.fullName || 'Một người dùng'} đã bình luận trên phiếu ${request.requestNo}.`,
          userId,
          session,
        );
      }

      await this.recordRequestAudit(
        context,
        request,
        'REQUEST.COMMENTED',
        'Đã bình luận trên phiếu yêu cầu.',
        session,
        undefined,
        undefined,
        { sequenceNo: historyEntry.sequenceNo, commentLength: comment.length },
      );

      return historyEntry.toObject();
    });
  }

  async create(
    context: RequestWithContext,
    userId: string,
    input: CreateRequestDto,
    permissionKeys: readonly string[] = [],
  ) {
    const requestId = await this.inTransaction(async (session) => {
      const moduleEnabled = await this.queryService.isMyRequestsModuleEnabled(session);
      if (!moduleEnabled) {
        throw new ConflictException({ code: 'REQUESTS_MODULE_DISABLED', message: 'Module Phiếu của tôi đang tắt.' });
      }

      const actor = await this.actorContext.resolve(userId, session);
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

      const requestNo = await this.requestNumbers.next(form.code, session);
      const [request] = await this.requests.create([{
        requestNo,
        title: form.name,
        formDefinitionId: form._id,
        workflowDefinitionId: workflow._id,
        formVersion: form.version,
        workflowVersion: workflow.version,
        requesterUserId: actor.userId,
        requesterEmployeeId: actor.employeeId,
        requesterSnapshot: actor.requesterSnapshot,
        formData: buildInitialRequestFormData(form.fields, actor.autoFillProfile),
        formSnapshot: this.snapshots.createFormSnapshot(form),
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
      const request = await this.accessPolicy.ownedRequest(id, userId, session);
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
        let nextFormData = input.formData;
        if (hasLockedAutoFillFields(source.fields)) {
          const actor = await this.actorContext.resolve(userId, session, {
            excludeRequestId: request._id,
          });
          nextFormData = enforceLockedAutoFillFormData(
            source.fields,
            input.formData,
            request.formData,
            actor.autoFillProfile,
          );
        }
        await this.files.attachRequestFileReferences(request._id, nextFormData, source, session);
        request.formData = nextFormData;
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
      const moduleEnabled = await this.queryService.isMyRequestsModuleEnabled(session);
      if (!moduleEnabled) {
        throw new ConflictException({ code: 'REQUESTS_MODULE_DISABLED', message: 'Module Phiếu của tôi đang tắt.' });
      }
      const source = await this.accessPolicy.ownedRequest(id, userId, session);
      if (source.status !== 'DRAFT') {
        throw new ConflictException({
          code: 'REQUEST_RECREATE_NOT_ALLOWED',
          message: 'Chỉ có thể tạo phiếu mới từ một bản nháp lỗi thời.',
        });
      }

      const version = await this.queryService.getDefinitionVersion(source as StoredRequest, session);
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
      if (!form || !workflow) throw this.queryService.definitionVersionOutdated(version);
      await this.lockPublishedPackage(form, workflow, session);

      const actor = await this.actorContext.resolve(userId, session);
      const sourceForm = isRecord(source.formSnapshot) && Array.isArray(source.formSnapshot.fields)
        ? undefined
        : await this.forms.findById(source.formDefinitionId).select({ fields: 1 }).session(session).lean().exec();
      const migration = this.draftMigration.migrate(source, form.fields, sourceForm?.fields);
      const recreatedFormData = applyAutoFillToMigratedFormData(
        form.fields,
        migration.formData,
        actor.autoFillProfile,
      );
      const reviewItems = migration.reviewItems.filter(
        (item) => !(item.reason === 'REQUIRED_VALUE_MISSING' && Boolean(recreatedFormData[item.fieldKey])),
      );
      const requestNo = await this.requestNumbers.next(form.code, session);
      const [request] = await this.requests.create([{
        requestNo,
        title: source.title,
        formDefinitionId: form._id,
        workflowDefinitionId: workflow._id,
        formVersion: form.version,
        workflowVersion: workflow.version,
        requesterUserId: actor.userId,
        requesterEmployeeId: actor.employeeId,
        requesterSnapshot: actor.requesterSnapshot,
        formData: recreatedFormData,
        formSnapshot: this.snapshots.createFormSnapshot(form),
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
          reviewFieldKeys: reviewItems.map((item) => item.fieldKey),
        },
      );
      return {
        requestId: request._id.toString(),
        copiedFieldKeys: migration.copiedFieldKeys,
        reviewItems,
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
      const request = await this.accessPolicy.ownedRequest(id, userId, session);
      if (request.status !== 'DRAFT') {
        throw new ConflictException({ code: 'REQUEST_NOT_DRAFT', message: 'Chỉ phiếu DRAFT mới có thể gửi.' });
      }
      const actor = await this.actorContext.resolve(userId, session, {
        excludeRequestId: request._id,
      });
      const { form, workflow } = await this.publishedPackage(request, session);
      request.formData = hasLockedAutoFillFields(form.fields)
        ? enforceLockedAutoFillFormData(
            form.fields,
            request.formData,
            request.formData,
            actor.autoFillProfile,
          )
        : evaluateFormCalculations(form.fields, request.formData);
      request.markModified('formData');
      this.dynamicFormValidator.assertFormDataValid({ fields: form.fields }, request.formData);
      await this.files.assertRequestFileReferencesValid(request._id, request.formData, { fields: form.fields }, session);
      this.assertLeaveBalanceSufficient(form.settings, request.formData, actor.autoFillProfile);

      request.requesterEmployeeId = actor.employeeId;
      request.requesterSnapshot = actor.requesterSnapshot;
      request.formSnapshot = this.snapshots.createFormSnapshot(form);
      request.workflowSnapshot = this.snapshots.createWorkflowSnapshot(workflow);
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
      const request = await this.accessPolicy.ownedRequest(id, userId, session);
      if (request.status !== 'REVISION_REQUESTED') {
        throw new ConflictException({
          code: 'REQUEST_NOT_REVISION_REQUESTED',
          message: 'Chỉ phiếu đang được yêu cầu chỉnh sửa mới có thể gửi lại.',
        });
      }
      const formSnapshot = this.snapshots.requireSnapshot(request.formSnapshot, 'Form Snapshot');
      const fields = Array.isArray(formSnapshot.fields) ? formSnapshot.fields : [];
      const leaveConfig = extractLeaveDeductionConfig(formSnapshot.settings);
      const needsActor = hasLockedAutoFillFields(fields) || Boolean(leaveConfig?.enabled);
      const actor = needsActor
        ? await this.actorContext.resolve(userId, session, { excludeRequestId: request._id })
        : undefined;
      request.formData = actor && hasLockedAutoFillFields(fields)
        ? enforceLockedAutoFillFormData(
            fields,
            request.formData,
            request.formData,
            actor.autoFillProfile,
          )
        : evaluateFormCalculations(fields, request.formData);
      request.markModified('formData');
      const result = this.dynamicFormValidator.validateSnapshot(formSnapshot, request.formData);
      if (!result.valid) {
        throw new BadRequestException({
          code: 'INVALID_FORM_DATA',
          message: result.errors.map((error) => error.message).join(' '),
          field: result.errors[0]?.fieldKey,
        });
      }
      await this.files.assertRequestFileReferencesValid(request._id, request.formData, { fields }, session);
      if (actor) {
        this.assertLeaveBalanceSufficient(formSnapshot.settings, request.formData, actor.autoFillProfile);
      }
      if (request.leaveDeductionApplied && !request.leaveDeductionApplied.refundedAt) {
        const nextDays = extractLeaveDaysFromFormData(
          request.formData,
          request.leaveDeductionApplied.fieldKey,
        );
        if (nextDays === undefined || nextDays < 0) {
          throw new BadRequestException({
            code: 'INVALID_LEAVE_DAYS',
            message: 'Số ngày nghỉ phép không hợp lệ.',
            field: request.leaveDeductionApplied.fieldKey,
          });
        }
        const delta = roundLeaveDays(nextDays - request.leaveDeductionApplied.days);
        if (delta !== 0) {
          const updatedEmployee = await this.employees
            .findOneAndUpdate(
              {
                _id: request.requesterEmployeeId,
                ...(delta > 0 ? { annualLeaveDays: { $gte: delta } } : {}),
              },
              { $inc: { annualLeaveDays: -delta } },
              { session, returnDocument: 'after' },
            )
            .select({ annualLeaveDays: 1 })
            .exec();
          if (!updatedEmployee) {
            throw new ConflictException({
              code: 'INSUFFICIENT_ANNUAL_LEAVE',
              message: 'Số ngày phép năm còn lại không đủ cho phần điều chỉnh tăng thêm.',
            });
          }
          request.leaveDeductionApplied = {
            ...request.leaveDeductionApplied,
            days: nextDays,
            deductedAt: new Date(),
          };
          request.markModified('leaveDeductionApplied');
        }
      }
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
      const request = await this.accessPolicy.ownedRequest(id, userId, session);
      if (request.status !== 'IN_PROGRESS' && request.status !== 'REVISION_REQUESTED') {
        throw new ConflictException({
          code: 'REQUEST_NOT_CANCELLABLE',
          message: 'Trạng thái hiện tại không cho phép hủy phiếu.',
        });
      }
      if (!this.accessPolicy.isCancellationAllowed(request.formSnapshot)) {
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
      if (request.leaveDeductionApplied && !request.leaveDeductionApplied.refundedAt) {
        const refundDays = roundLeaveDays(request.leaveDeductionApplied.days);
        if (refundDays > 0) {
          await this.employees
            .findOneAndUpdate(
              { _id: request.requesterEmployeeId },
              { $inc: { annualLeaveDays: refundDays } },
              { session, returnDocument: 'after' },
            )
            .select({ annualLeaveDays: 1 })
            .exec();
          request.leaveDeductionApplied = {
            ...request.leaveDeductionApplied,
            refundedAt: new Date(),
          };
          request.markModified('leaveDeductionApplied');
        }
      }
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
      if (!request) throw this.accessPolicy.notFound();
      if (!this.accessPolicy.isVoidable(request.status)) {
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
      let leaveRefundedDays: number | undefined;
      if (request.leaveDeductionApplied && !request.leaveDeductionApplied.refundedAt) {
        const refundDays = roundLeaveDays(request.leaveDeductionApplied.days);
        if (refundDays > 0) {
          const updatedEmployee = await this.employees
            .findOneAndUpdate(
              { _id: request.requesterEmployeeId },
              { $inc: { annualLeaveDays: refundDays } },
              { session, returnDocument: 'after' },
            )
            .select({ annualLeaveDays: 1 })
            .exec();
          if (!updatedEmployee) {
            throw new ConflictException({
              code: 'EMPLOYEE_NOT_FOUND',
              message: 'Không tìm thấy hồ sơ nhân viên để hoàn lại ngày phép năm.',
            });
          }
          request.leaveDeductionApplied = {
            ...request.leaveDeductionApplied,
            refundedAt: new Date(),
          };
          request.markModified('leaveDeductionApplied');
          leaveRefundedDays = refundDays;
        }
      }
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
        ...(leaveRefundedDays !== undefined ? { metadata: { leaveRefundedDays } } : {}),
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
        {
          reason,
          ...(leaveRefundedDays !== undefined ? { leaveRefundedDays } : {}),
        },
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
      const request = await this.accessPolicy.ownedRequest(id, userId, session);
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
      throw this.queryService.definitionVersionOutdated(
        await this.queryService.getDefinitionVersion(request as StoredRequest, session),
      );
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

  private async requestFileValidationSource(
    request: RequestDocument,
    session: ClientSession,
  ): Promise<{ fields: readonly unknown[] }> {
    if (isRecord(request.formSnapshot) && Array.isArray(request.formSnapshot.fields)) {
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
    action: 'CANCELLED' | 'VOIDED' | 'COMMENTED',
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
    if (!isRecord(error)) return false;
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

  private assertLeaveBalanceSufficient(
    settings: unknown,
    formData: Record<string, unknown>,
    profile: RequestActorAutoFillProfile,
  ): void {
    const config = extractLeaveDeductionConfig(settings);
    if (!config?.enabled) return;
    const days = extractLeaveDaysFromFormData(formData, config.fieldKey);
    if (days === undefined) {
      throw new BadRequestException({
        code: 'INVALID_LEAVE_DAYS',
        message: 'Số ngày nghỉ phép không hợp lệ.',
        field: config.fieldKey,
      });
    }
    if (days < 0) {
      throw new BadRequestException({
        code: 'INVALID_LEAVE_DAYS',
        message: 'Số ngày nghỉ phép không được nhỏ hơn 0.',
        field: config.fieldKey,
      });
    }
    if (profile.annualLeaveDays === undefined) {
      throw new ConflictException({
        code: 'ANNUAL_LEAVE_NOT_CONFIGURED',
        message: 'Nhân viên chưa được cấu hình số ngày phép năm.',
      });
    }
    if (!config.allowNegative) {
      const available = profile.availableAnnualLeaveDays ?? 0;
      if (days > available) {
        throw new ConflictException({
          code: 'INSUFFICIENT_ANNUAL_LEAVE',
          message: `Số ngày phép năm khả dụng không đủ (cần ${days} ngày, còn ${available} ngày khả dụng).`,
        });
      }
    }
  }

}
