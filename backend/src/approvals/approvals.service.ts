import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  ClientSession,
  Connection,
  Model,
  QueryFilter,
  Types,
} from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { Department } from '../departments/schemas/department.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Position } from '../positions/schemas/position.schema.js';
import { Request, type RequestDocument } from '../requests/schemas/request.schema.js';
import { Role } from '../roles/schemas/role.schema.js';
import { User } from '../users/schemas/user.schema.js';
import { WorkflowHistoryService } from '../workflow-runtime/workflow-history.service.js';
import { WorkflowRuntimeService } from '../workflow-runtime/workflow-runtime.service.js';
import {
  ListApprovalInboxDto,
  type ApprovalInboxScope,
} from './dto/approval.dto.js';
import { ApprovalHistory } from './schemas/approval-history.schema.js';
import {
  ApprovalTask,
  type ApprovalAssigneeSnapshot,
  type ApprovalTaskDocument,
  type ApprovalTaskStatus,
} from './schemas/approval-task.schema.js';

type Decision = 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';
type StoredTask = ApprovalTask & { _id: Types.ObjectId; __v?: number };
type StoredRequest = Request & { _id: Types.ObjectId };

const SCOPE_STATUSES: Readonly<Record<ApprovalInboxScope, readonly ApprovalTaskStatus[]>> = {
  pending: ['PENDING'],
  processed: ['APPROVED', 'REJECTED', 'REVISION_REQUESTED'],
  closed: ['CANCELLED', 'SKIPPED', 'EXPIRED'],
};

@Injectable()
export class ApprovalsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(ApprovalTask.name) private readonly tasks: Model<ApprovalTask>,
    @InjectModel(ApprovalHistory.name) private readonly histories: Model<ApprovalHistory>,
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Role.name) private readonly roles: Model<Role>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Department.name) private readonly departments: Model<Department>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
    private readonly runtime: WorkflowRuntimeService,
    private readonly workflowHistory: WorkflowHistoryService,
    private readonly auditLogs: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async inbox(userId: string, query: ListApprovalInboxDto) {
    const scopeStatuses = SCOPE_STATUSES[query.scope];
    if (query.status && !scopeStatuses.includes(query.status)) {
      throw new BadRequestException('Trạng thái task không thuộc scope đã chọn.');
    }
    if (query.overdue && query.scope !== 'pending') {
      throw new BadRequestException('Bộ lọc quá hạn chỉ áp dụng cho scope pending.');
    }

    const taskFilter: QueryFilter<ApprovalTask> = {
      assigneeUserId: new Types.ObjectId(userId),
      status: query.status ?? { $in: scopeStatuses },
    };
    if (query.approvalMode) taskFilter.approvalMode = query.approvalMode;
    if (query.overdue) taskFilter.dueAt = { $lt: new Date() };
    if (query.dateFrom || query.dateTo) {
      const from = query.dateFrom ? new Date(query.dateFrom) : undefined;
      const to = query.dateTo ? new Date(query.dateTo) : undefined;
      if (from && to && from > to) throw new BadRequestException('dateFrom không được sau dateTo.');
      taskFilter.assignedAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const requestFilter: QueryFilter<Request> = {};
    if (query.requestStatus) requestFilter.status = query.requestStatus;
    let allowedRequestIds: Types.ObjectId[] | undefined;
    if (Object.keys(requestFilter).length) {
      const requests = await this.requests.find(requestFilter).select({ _id: 1 }).lean().exec();
      allowedRequestIds = requests.map((request) => request._id);
      taskFilter.requestId = { $in: allowedRequestIds };
    }
    if (query.search) {
      const search = new RegExp(this.escapeRegExp(query.search), 'i');
      const matchingRequests = await this.requests.find({
        ...(allowedRequestIds ? { _id: { $in: allowedRequestIds } } : {}),
        $or: [
          { requestNo: search },
          { title: search },
          { 'requesterSnapshot.fullName': search },
          { 'requesterSnapshot.employeeCode': search },
        ],
      }).select({ _id: 1 }).lean().exec();
      taskFilter.$or = [
        { stepNameSnapshot: search },
        { stepKey: search },
        { requestId: { $in: matchingRequests.map((request) => request._id) } },
      ];
    }

    const direction: 1 | -1 = query.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [query.sortBy]: direction, _id: direction };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.tasks.find(taskFilter).sort(sort).skip(skip).limit(query.limit).lean().exec(),
      this.tasks.countDocuments(taskFilter).exec(),
    ]);
    const requests = items.length
      ? await this.requests.find({ _id: { $in: items.map((task) => task.requestId) } }).lean().exec()
      : [];
    const requestsById = new Map(requests.map((request) => [request._id.toString(), request as StoredRequest]));
    return {
      data: items.map((task) => this.toTaskResponse(
        task as StoredTask,
        requestsById.get(task.requestId.toString()),
      )),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(userId: string, id: string, permissionKeys: readonly string[]) {
    const task = await this.tasks.findById(id).lean().exec();
    if (!task) throw this.notFound();
    const storedTask = task as StoredTask;
    if (
      storedTask.assigneeUserId.toString() !== userId
      && !permissionKeys.includes('REQUESTS.VIEW_ALL')
    ) {
      throw this.notFound();
    }
    const request = await this.requests.findById(storedTask.requestId).lean().exec();
    if (!request) throw this.notFound();
    const history = await this.histories.find({ requestId: storedTask.requestId })
      .sort({ sequenceNo: 1, _id: 1 }).lean().exec();
    return {
      ...this.toTaskResponse(storedTask, request as StoredRequest, true),
      history,
      availableActions: this.availableActions(
        storedTask,
        request as StoredRequest,
        userId,
        permissionKeys,
      ),
    };
  }

  approve(
    context: RequestWithContext,
    userId: string,
    id: string,
    comment: string | undefined,
    permissionKeys: readonly string[],
  ) {
    return this.decide(context, userId, id, 'APPROVED', comment, permissionKeys);
  }

  reject(
    context: RequestWithContext,
    userId: string,
    id: string,
    comment: string,
    permissionKeys: readonly string[],
  ) {
    return this.decide(context, userId, id, 'REJECTED', comment, permissionKeys);
  }

  requestRevision(
    context: RequestWithContext,
    userId: string,
    id: string,
    comment: string,
    permissionKeys: readonly string[],
  ) {
    return this.decide(context, userId, id, 'REVISION_REQUESTED', comment, permissionKeys);
  }

  async reassign(
    context: RequestWithContext,
    userId: string,
    id: string,
    newAssigneeUserId: string,
    reason: string,
    permissionKeys: readonly string[],
  ) {
    const newTaskId = await this.inTransaction(async (session) => {
      const task = await this.assignedTask(id, userId, session);
      if (task.status !== 'PENDING') throw this.taskAlreadyProcessed();
      const request = await this.currentRequest(task, session);
      if (newAssigneeUserId === userId) {
        throw new BadRequestException({
          code: 'SAME_APPROVAL_ASSIGNEE',
          message: 'Người nhận mới phải khác người đang được giao task.',
        });
      }
      if (
        request.requesterUserId.toString() === newAssigneeUserId
        && !this.selfApprovalAllowed(request, task.stepKey)
      ) {
        throw new ConflictException({
          code: 'SELF_APPROVAL_NOT_ALLOWED',
          message: 'Không thể chuyển task cho chính người tạo phiếu.',
        });
      }
      const assignee = await this.resolveEligibleAssignee(newAssigneeUserId, session);
      const existing = await this.tasks.exists({
        requestId: task.requestId,
        stepKey: task.stepKey,
        stepRunNo: task.stepRunNo,
        assigneeUserId: assignee.userId,
      }).session(session);
      if (existing) {
        throw new ConflictException({
          code: 'ASSIGNEE_ALREADY_HAS_TASK',
          message: 'Người dùng này đã có task trong cùng bước xử lý.',
        });
      }

      const updated = await this.tasks.findOneAndUpdate(
        {
          _id: task._id,
          assigneeUserId: new Types.ObjectId(userId),
          status: 'PENDING',
          __v: task.get('__v'),
        },
        {
          $set: {
            status: 'CANCELLED',
            actedAt: new Date(),
            cancelReason: reason,
          },
          $inc: { __v: 1 },
        },
        { returnDocument: 'after', runValidators: true, session },
      ).exec();
      if (!updated) throw this.taskAlreadyProcessed();

      let replacement: ApprovalTaskDocument;
      try {
        [replacement] = await this.tasks.create([{
          requestId: task.requestId,
          stepKey: task.stepKey,
          stepNameSnapshot: task.stepNameSnapshot,
          stepRunNo: task.stepRunNo,
          assigneeUserId: assignee.userId,
          assigneeEmployeeId: assignee.employeeId,
          assigneeSnapshot: assignee.snapshot,
          assigneeRuleSnapshot: task.assigneeRuleSnapshot,
          approvalMode: task.approvalMode,
          requiredApprovals: task.requiredApprovals,
          revisionRound: task.revisionRound,
          status: 'PENDING',
          assignedAt: new Date(),
          dueAt: task.dueAt,
        }], { session });
      } catch (error) {
        if (this.isDuplicateKey(error)) {
          throw new ConflictException({
            code: 'ASSIGNEE_ALREADY_HAS_TASK',
            message: 'Người dùng này đã có task trong cùng bước xử lý.',
          });
        }
        throw error;
      }
      await this.workflowHistory.record(request, {
        taskId: task._id,
        stepKey: task.stepKey,
        stepRunNo: task.stepRunNo,
        actorUserId: new Types.ObjectId(userId),
        actorSnapshot: task.assigneeSnapshot,
        action: 'REASSIGNED',
        fromStatus: 'PENDING',
        toStatus: 'CANCELLED',
        comment: reason,
        metadata: {
          newTaskId: replacement._id,
          newAssigneeUserId: assignee.userId,
        },
      }, session);
      await this.notifications.createPersonal({
        recipientUserId: assignee.userId,
        type: 'APPROVAL',
        title: 'Bạn được chuyển giao một task phê duyệt',
        message: `Phiếu ${request.requestNo} đã được chuyển cho bạn xử lý tại bước ${task.stepNameSnapshot}.`,
        link: `/requests/${request._id.toString()}?from=approval-inbox`,
        resource: { type: 'APPROVAL_TASK', id: replacement._id },
        createdByUserId: userId,
        data: {
          requestId: request._id.toString(),
          requestNo: request.requestNo,
          stepKey: task.stepKey,
          stepRunNo: task.stepRunNo,
        },
        dedupeKey: this.notificationDedupeKey(
          request._id,
          task.stepKey,
          task.stepRunNo,
          'REASSIGNED',
        ),
      }, session);
      await this.auditLogs.record(context, {
        action: 'APPROVAL.REASSIGNED',
        description: 'Đã chuyển giao task phê duyệt cho người xử lý khác.',
        outcome: AuditOutcome.SUCCESS,
        resource: {
          type: 'APPROVAL_TASK',
          id: task._id.toString(),
          code: task.stepKey,
          name: task.stepNameSnapshot,
        },
        changes: {
          before: {
            status: 'PENDING',
            assigneeId: task.assigneeUserId.toString(),
          },
          after: {
            status: 'CANCELLED',
            assigneeId: assignee.userId.toString(),
          },
        },
        metadata: {
          requestId: request._id.toString(),
          newTaskId: replacement._id.toString(),
          stepKey: task.stepKey,
          stepRunNo: task.stepRunNo,
          reason,
        },
      }, session);
      return replacement._id.toString();
    });
    return {
      previousTask: await this.findOne(userId, id, permissionKeys),
      newTaskId,
    };
  }

  private async decide(
    context: RequestWithContext,
    userId: string,
    id: string,
    decision: Decision,
    comment: string | undefined,
    permissionKeys: readonly string[],
  ) {
    if (decision !== 'APPROVED' && !comment?.trim()) {
      throw new BadRequestException('Nhận xét là bắt buộc khi từ chối hoặc yêu cầu chỉnh sửa.');
    }
    await this.inTransaction(async (session) => {
      const task = await this.assignedTask(id, userId, session);
      if (task.status !== 'PENDING') throw this.taskAlreadyProcessed();
      const request = await this.currentRequest(task, session);
      if (
        request.requesterUserId.toString() === userId
        && !this.selfApprovalAllowed(request, task.stepKey)
      ) {
        throw new ForbiddenException({
          code: 'SELF_APPROVAL_NOT_ALLOWED',
          message: 'Người tạo phiếu không được tự phê duyệt phiếu của mình.',
        });
      }

      const updated = await this.tasks.findOneAndUpdate(
        {
          _id: task._id,
          assigneeUserId: new Types.ObjectId(userId),
          status: 'PENDING',
          __v: task.get('__v'),
        },
        {
          $set: {
            status: decision,
            actedAt: new Date(),
            ...(comment ? { decisionComment: comment } : {}),
          },
          $inc: { __v: 1 },
        },
        { returnDocument: 'after', runValidators: true, session },
      ).exec();
      if (!updated) throw this.taskAlreadyProcessed();

      await this.workflowHistory.record(request, {
        taskId: updated._id,
        stepKey: updated.stepKey,
        stepRunNo: updated.stepRunNo,
        actorUserId: new Types.ObjectId(userId),
        actorSnapshot: updated.assigneeSnapshot,
        action: decision,
        fromStatus: 'PENDING',
        toStatus: decision,
        comment,
        metadata: { approvalMode: updated.approvalMode },
      }, session);

      const runTasks = await this.tasks.find({
        requestId: updated.requestId,
        stepKey: updated.stepKey,
        stepRunNo: updated.stepRunNo,
      }).session(session).exec();
      const outcome = this.stepOutcome(updated, decision, runTasks);
      if (outcome) {
        await this.closeRemainingTasks(request, updated, outcome, runTasks, session);
        await this.runtime.continueTransition(request, outcome, session);
      }
      await this.auditLogs.record(context, {
        action: `APPROVAL.${decision}`,
        description: this.decisionAuditDescription(decision),
        outcome: AuditOutcome.SUCCESS,
        resource: {
          type: 'APPROVAL_TASK',
          id: updated._id.toString(),
          code: updated.stepKey,
          name: updated.stepNameSnapshot,
        },
        changes: {
          before: { status: 'PENDING' },
          after: { status: updated.status },
        },
        metadata: {
          requestId: request._id.toString(),
          stepKey: updated.stepKey,
          stepRunNo: updated.stepRunNo,
          approvalMode: updated.approvalMode,
          stepOutcome: outcome,
        },
      }, session);
    });
    return this.findOne(userId, id, permissionKeys);
  }

  private stepOutcome(
    actedTask: ApprovalTaskDocument,
    decision: Decision,
    runTasks: ApprovalTaskDocument[],
  ): Decision | undefined {
    if (decision === 'REVISION_REQUESTED') return decision;
    if (actedTask.approvalMode === 'ANY') return decision;
    if (actedTask.approvalMode === 'ALL') {
      if (decision === 'REJECTED') return decision;
      const approved = runTasks.filter((task) => task.status === 'APPROVED').length;
      return approved >= actedTask.requiredApprovals ? 'APPROVED' : undefined;
    }

    const approved = runTasks.filter((task) => task.status === 'APPROVED').length;
    if (approved >= actedTask.requiredApprovals) return 'APPROVED';
    const pending = runTasks.filter((task) => task.status === 'PENDING').length;
    return approved + pending < actedTask.requiredApprovals ? 'REJECTED' : undefined;
  }

  private async closeRemainingTasks(
    request: RequestDocument,
    actedTask: ApprovalTaskDocument,
    outcome: Decision,
    runTasks: ApprovalTaskDocument[],
    session: ClientSession,
  ): Promise<void> {
    const pending = runTasks.filter((task) => task.status === 'PENDING');
    if (!pending.length) return;
    const nextStatus: ApprovalTaskStatus = outcome === 'REVISION_REQUESTED' ? 'CANCELLED' : 'SKIPPED';
    const now = new Date();
    const cancelReason = outcome === 'REVISION_REQUESTED'
      ? 'Bước xử lý đã yêu cầu người gửi chỉnh sửa phiếu.'
      : undefined;
    await this.tasks.updateMany(
      { _id: { $in: pending.map((task) => task._id) }, status: 'PENDING' },
      {
        $set: {
          status: nextStatus,
          actedAt: now,
          ...(cancelReason ? { cancelReason } : {}),
        },
        $inc: { __v: 1 },
      },
      { session, runValidators: true },
    ).exec();

    for (const task of pending) {
      await this.workflowHistory.record(request, {
        taskId: task._id,
        stepKey: task.stepKey,
        stepRunNo: task.stepRunNo,
        action: nextStatus === 'SKIPPED' ? 'AUTO_SKIPPED' : 'CANCELLED',
        fromStatus: 'PENDING',
        toStatus: nextStatus,
        metadata: {
          stepOutcome: outcome,
          decidedByTaskId: actedTask._id,
        },
      }, session);
    }
  }

  private async assignedTask(id: string, userId: string, session: ClientSession): Promise<ApprovalTaskDocument> {
    const task = await this.tasks.findById(id).session(session).exec();
    if (!task) throw this.notFound();
    if (task.assigneeUserId.toString() !== userId) throw this.taskAlreadyProcessed();
    return task;
  }

  private async currentRequest(task: ApprovalTaskDocument, session: ClientSession): Promise<RequestDocument> {
    const request = await this.requests.findById(task.requestId).session(session).exec();
    if (
      !request
      || request.status !== 'IN_PROGRESS'
      || request.currentStepKey !== task.stepKey
      || request.currentStepRunNo !== task.stepRunNo
    ) {
      throw this.taskAlreadyProcessed();
    }
    return request;
  }

  private async resolveEligibleAssignee(userId: string, session: ClientSession) {
    const user = await this.users.findOne({ _id: userId, isActive: true })
      .select({ _id: 1, displayName: 1, email: 1, employeeId: 1, roleIds: 1 })
      .session(session).lean().exec();
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_APPROVAL_ASSIGNEE',
        message: 'Người nhận mới không tồn tại hoặc đã ngưng hoạt động.',
      });
    }
    const role = await this.roles.exists({
      _id: { $in: user.roleIds },
      isActive: true,
      permissionKeys: 'APPROVALS.APPROVE_ASSIGNED',
    }).session(session);
    if (!role) {
      throw new BadRequestException({
        code: 'ASSIGNEE_PERMISSION_REQUIRED',
        message: 'Người nhận mới không có quyền xử lý phê duyệt.',
      });
    }

    if (!user.employeeId) {
      return {
        userId: user._id,
        snapshot: { fullName: user.displayName ?? user.email } satisfies ApprovalAssigneeSnapshot,
      };
    }
    const employee = await this.employees.findOne({ _id: user.employeeId, isActive: true })
      .select({ employeeCode: 1, fullName: 1, departmentId: 1, positionId: 1 })
      .session(session).lean().exec();
    if (!employee) {
      throw new BadRequestException({
        code: 'INVALID_APPROVAL_ASSIGNEE',
        message: 'Hồ sơ nhân viên của người nhận mới đã ngưng hoạt động.',
      });
    }
    const [department, position] = await Promise.all([
      this.departments.findById(employee.departmentId).select({ name: 1 }).session(session).lean().exec(),
      this.positions.findById(employee.positionId).select({ name: 1 }).session(session).lean().exec(),
    ]);
    return {
      userId: user._id,
      employeeId: employee._id,
      snapshot: {
        fullName: employee.fullName,
        employeeCode: employee.employeeCode,
        departmentName: department?.name,
        positionName: position?.name,
      } satisfies ApprovalAssigneeSnapshot,
    };
  }

  private availableActions(
    task: StoredTask,
    request: StoredRequest,
    userId: string,
    permissionKeys: readonly string[],
  ) {
    const assigned = task.assigneeUserId.toString() === userId;
    const current = task.status === 'PENDING'
      && request.status === 'IN_PROGRESS'
      && request.currentStepKey === task.stepKey
      && request.currentStepRunNo === task.stepRunNo;
    const selfApprovalBlocked = request.requesterUserId.toString() === userId
      && !this.selfApprovalAllowed(request, task.stepKey);
    const canDecide = assigned
      && current
      && !selfApprovalBlocked
      && permissionKeys.includes('APPROVALS.APPROVE_ASSIGNED');
    return {
      canApprove: canDecide,
      canReject: canDecide,
      canRequestRevision: canDecide,
      canReassign: assigned && current && permissionKeys.includes('APPROVALS.REASSIGN'),
    };
  }

  private toTaskResponse(task: StoredTask, request?: StoredRequest, includeRequestData = false) {
    return {
      id: task._id.toString(),
      requestId: task.requestId.toString(),
      stepKey: task.stepKey,
      stepName: task.stepNameSnapshot,
      stepRunNo: task.stepRunNo,
      assigneeUserId: task.assigneeUserId.toString(),
      assigneeSnapshot: task.assigneeSnapshot,
      approvalMode: task.approvalMode,
      requiredApprovals: task.requiredApprovals,
      revisionRound: task.revisionRound,
      status: task.status,
      assignedAt: task.assignedAt,
      dueAt: task.dueAt,
      actedAt: task.actedAt,
      decisionComment: task.decisionComment,
      isOverdue: task.status === 'PENDING' && Boolean(task.dueAt && task.dueAt < new Date()),
      ...(request ? {
        request: {
          id: request._id.toString(),
          requestNo: request.requestNo,
          title: request.title,
          status: request.status,
          requesterSnapshot: request.requesterSnapshot,
          submittedAt: request.submittedAt,
          form: this.formSummary(request.formSnapshot, request.formVersion),
          ...(includeRequestData ? {
            formData: request.formData,
            formSnapshot: request.formSnapshot,
          } : {}),
        },
      } : {}),
    };
  }

  private formSummary(snapshot: Record<string, unknown> | undefined, version: number) {
    if (!snapshot) return { version };
    return {
      ...(typeof snapshot.id === 'string' ? { id: snapshot.id } : {}),
      ...(typeof snapshot.code === 'string' ? { code: snapshot.code } : {}),
      ...(typeof snapshot.name === 'string' ? { name: snapshot.name } : {}),
      version: typeof snapshot.version === 'number' ? snapshot.version : version,
    };
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
      if (this.isConcurrencyError(error)) throw this.taskAlreadyProcessed();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private taskAlreadyProcessed(): ConflictException {
    return new ConflictException({
      code: 'TASK_ALREADY_PROCESSED',
      message: 'Task đã được xử lý hoặc trạng thái đã thay đổi. Vui lòng tải lại dữ liệu.',
    });
  }

  private decisionAuditDescription(decision: Decision): string {
    if (decision === 'APPROVED') return 'Đã phê duyệt task được giao.';
    if (decision === 'REJECTED') return 'Đã từ chối task được giao.';
    return 'Đã yêu cầu người gửi bổ sung thông tin.';
  }

  private selfApprovalAllowed(
    request: Pick<Request, 'workflowSnapshot'>,
    stepKey: string,
  ): boolean {
    const snapshot = request.workflowSnapshot;
    if (!this.isRecord(snapshot) || !Array.isArray(snapshot.steps)) return false;
    const step = snapshot.steps.find((candidate) => (
      this.isRecord(candidate)
      && candidate.stepKey === stepKey
      && candidate.type === 'APPROVAL'
    ));
    return this.isRecord(step) && step.allowSelfApproval === true;
  }

  private notificationDedupeKey(
    requestId: Types.ObjectId,
    stepKey: string,
    stepRunNo: number,
    action: string,
  ): string {
    return `REQUEST:${requestId.toString()}:STEP:${stepKey}:RUN:${stepRunNo}:${action}`;
  }

  private notFound(): NotFoundException {
    return new NotFoundException('Không tìm thấy task phê duyệt.');
  }

  private isConcurrencyError(error: unknown): boolean {
    if (!this.isRecord(error)) return false;
    if (error.name === 'VersionError' || error.code === 112 || error.code === 251) return true;
    return Array.isArray(error.errorLabels) && error.errorLabels.some((label) => (
      label === 'TransientTransactionError' || label === 'UnknownTransactionCommitResult'
    ));
  }

  private isDuplicateKey(error: unknown): boolean {
    return this.isRecord(error) && error.code === 11000;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
