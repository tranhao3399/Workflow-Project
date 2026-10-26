import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ApprovalTask } from '../approvals/schemas/approval-task.schema.js';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { RequestDocument } from '../requests/schemas/request.schema.js';
import {
  approvalModes,
  assigneeRuleTypes,
  workflowConditionOperators,
  workflowConditionSources,
  workflowEndResults,
  workflowStepTypes,
  type ApprovalMode,
} from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { AssigneeResolverService } from './assignee-resolver.service.js';
import { ConditionEvaluatorService } from './condition-evaluator.service.js';
import { WorkflowHistoryService } from './workflow-history.service.js';
import type {
  ApprovalTransitionOutcome,
  RuntimeAssigneeRule,
  RuntimeCondition,
  RuntimeWorkflowSnapshot,
  RuntimeWorkflowStep,
  WorkflowRuntimeResult,
} from './workflow-runtime.types.js';

@Injectable()
export class WorkflowRuntimeService {
  constructor(
    @InjectModel(ApprovalTask.name) private readonly tasks: Model<ApprovalTask>,
    private readonly assigneeResolver: AssigneeResolverService,
    private readonly conditionEvaluator: ConditionEvaluatorService,
    private readonly history: WorkflowHistoryService,
    private readonly notifications: NotificationsService,
  ) {}

  async start(request: RequestDocument, session: ClientSession): Promise<WorkflowRuntimeResult> {
    if (request.status !== 'DRAFT') {
      throw this.runtimeConflict('WORKFLOW_ALREADY_STARTED', 'Chỉ có thể khởi chạy Workflow cho phiếu DRAFT.');
    }
    const snapshot = this.snapshot(request);
    request.status = 'IN_PROGRESS';
    request.currentStepKey = undefined;
    request.currentStepRunNo = undefined;
    return this.advanceWithSnapshot(request, snapshot, snapshot.startStepKey, session);
  }

  async advance(
    request: RequestDocument,
    stepKey: string,
    session: ClientSession,
  ): Promise<WorkflowRuntimeResult> {
    if (request.status !== 'IN_PROGRESS') {
      throw this.runtimeConflict('WORKFLOW_NOT_IN_PROGRESS', 'Phiếu không ở trạng thái cho phép tiếp tục Workflow.');
    }
    return this.advanceWithSnapshot(request, this.snapshot(request), stepKey, session);
  }

  async enterApprovalStep(
    request: RequestDocument,
    step: RuntimeWorkflowStep,
    session: ClientSession,
  ): Promise<WorkflowRuntimeResult> {
    if (step.type !== 'APPROVAL' || !step.assigneeRule || !step.approvalMode) {
      throw this.invalidSnapshot(`Bước ${step.stepKey} không có cấu hình phê duyệt hợp lệ.`);
    }
    const assignees = await this.assigneeResolver.resolve(
      request,
      step.assigneeRule,
      step.allowSelfApproval,
      session,
    );
    const requiredApprovals = this.requiredApprovals(step.approvalMode, assignees.length);
    const stepRunNo = (request.currentStepRunNo ?? 0) + 1;
    const assignedAt = new Date();
    const dueAt = step.dueInHours
      ? new Date(assignedAt.getTime() + step.dueInHours * 60 * 60 * 1000)
      : undefined;

    request.status = 'IN_PROGRESS';
    request.currentStepKey = step.stepKey;
    request.currentStepRunNo = stepRunNo;
    await request.save({ session });

    let tasks;
    try {
      tasks = await this.tasks.insertMany(assignees.map((assignee) => ({
        requestId: request._id,
        stepKey: step.stepKey,
        stepNameSnapshot: step.name,
        stepRunNo,
        assigneeUserId: assignee.userId,
        assigneeEmployeeId: assignee.employeeId,
        assigneeSnapshot: assignee.snapshot,
        assigneeRuleSnapshot: this.assigneeRuleSnapshot(step.assigneeRule!),
        approvalMode: step.approvalMode,
        requiredApprovals,
        revisionRound: request.revisionRound,
        status: 'PENDING',
        assignedAt,
        dueAt,
      })), { session, ordered: true });
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        throw this.runtimeConflict(
          'APPROVAL_TASK_ALREADY_EXISTS',
          'Nhiệm vụ phê duyệt cho bước chạy này đã tồn tại.',
        );
      }
      throw error;
    }

    for (const task of tasks) {
      await this.history.record(request, {
        taskId: task._id,
        stepKey: step.stepKey,
        stepRunNo,
        action: 'ASSIGNED',
        metadata: { approvalMode: step.approvalMode, requiredApprovals },
      }, session);
      await this.notifications.createPersonal({
        recipientUserId: task.assigneeUserId,
        type: 'APPROVAL',
        title: 'Bạn có phiếu cần phê duyệt',
        message: `Phiếu ${request.requestNo} đang chờ bạn xử lý tại bước ${step.name}.`,
        link: `/requests/${request._id.toString()}?from=approval-inbox`,
        resource: { type: 'APPROVAL_TASK', id: task._id },
        data: {
          requestId: request._id.toString(),
          requestNo: request.requestNo,
          stepKey: step.stepKey,
          stepRunNo,
        },
        dedupeKey: this.notificationDedupeKey(
          request._id,
          step.stepKey,
          stepRunNo,
          'ASSIGNED',
        ),
      }, session);
    }

    return {
      state: 'AWAITING_APPROVAL',
      requestStatus: request.status,
      currentStepKey: step.stepKey,
      stepRunNo,
      taskIds: tasks.map((task) => task._id.toString()),
      requiredApprovals,
    };
  }

  async continueTransition(
    request: RequestDocument,
    outcome: ApprovalTransitionOutcome,
    session: ClientSession,
  ): Promise<WorkflowRuntimeResult> {
    if (request.status !== 'IN_PROGRESS' || !request.currentStepKey) {
      throw this.runtimeConflict('WORKFLOW_NOT_AT_APPROVAL', 'Phiếu không dừng tại một bước phê duyệt đang hoạt động.');
    }
    const snapshot = this.snapshot(request);
    const currentStep = snapshot.steps.find((step) => step.stepKey === request.currentStepKey);
    if (!currentStep || currentStep.type !== 'APPROVAL') {
      throw this.invalidSnapshot('Bước hiện tại của phiếu không phải là bước phê duyệt hợp lệ.');
    }

    const targetStepKey = outcome === 'APPROVED'
      ? currentStep.onApproveStepKey
      : outcome === 'REJECTED'
        ? currentStep.onRejectStepKey
        : currentStep.onRevisionStepKey ?? currentStep.stepKey;
    if (!targetStepKey) {
      throw this.invalidSnapshot(`Bước ${currentStep.stepKey} thiếu transition cho kết quả ${outcome}.`);
    }

    if (outcome === 'REVISION_REQUESTED') {
      const stepRunNo = request.currentStepRunNo ?? 0;
      request.status = 'REVISION_REQUESTED';
      request.currentStepKey = targetStepKey;
      await request.save({ session });
      await this.notifications.createPersonal({
        recipientUserId: request.requesterUserId,
        type: 'REVISION',
        title: 'Phiếu cần bổ sung thông tin',
        message: `Phiếu ${request.requestNo} đã được yêu cầu bổ sung thông tin.`,
        link: `/requests/${request._id.toString()}`,
        resource: { type: 'REQUEST', id: request._id },
        data: {
          requestId: request._id.toString(),
          requestNo: request.requestNo,
          stepKey: currentStep.stepKey,
          stepRunNo,
        },
        dedupeKey: this.notificationDedupeKey(
          request._id,
          currentStep.stepKey,
          stepRunNo,
          'REVISION_REQUESTED',
        ),
      }, session);
      return {
        state: 'REVISION_REQUESTED',
        requestStatus: request.status,
        currentStepKey: targetStepKey,
        stepRunNo: request.currentStepRunNo,
      };
    }
    return this.advanceWithSnapshot(request, snapshot, targetStepKey, session);
  }

  async complete(
    request: RequestDocument,
    step: RuntimeWorkflowStep,
    session: ClientSession,
  ): Promise<WorkflowRuntimeResult> {
    if (step.type !== 'END' || !step.endResult) {
      throw this.invalidSnapshot(`Bước ${step.stepKey} không có endResult hợp lệ.`);
    }
    const fromStatus = request.status;
    const stepRunNo = request.currentStepRunNo ?? 0;
    request.status = step.endResult;
    request.completedAt = new Date();
    request.currentStepKey = undefined;
    request.currentStepRunNo = undefined;
    await request.save({ session });
    await this.history.record(request, {
      stepKey: step.stepKey,
      action: 'COMPLETED',
      fromStatus,
      toStatus: request.status,
      metadata: { endResult: step.endResult },
    }, session);
    await this.notifications.createPersonal({
      recipientUserId: request.requesterUserId,
      type: 'DECISION',
      title: step.endResult === 'APPROVED' ? 'Phiếu đã được phê duyệt' : 'Phiếu đã bị từ chối',
      message: `Phiếu ${request.requestNo} đã ${step.endResult === 'APPROVED' ? 'được phê duyệt' : 'bị từ chối'}.`,
      link: `/requests/${request._id.toString()}`,
      resource: { type: 'REQUEST', id: request._id },
      data: {
        requestId: request._id.toString(),
        requestNo: request.requestNo,
        stepKey: step.stepKey,
        stepRunNo,
        result: step.endResult,
      },
      dedupeKey: this.notificationDedupeKey(
        request._id,
        step.stepKey,
        stepRunNo,
        step.endResult,
      ),
    }, session);
    return { state: 'COMPLETED', requestStatus: request.status };
  }

  private async advanceWithSnapshot(
    request: RequestDocument,
    snapshot: RuntimeWorkflowSnapshot,
    initialStepKey: string,
    session: ClientSession,
  ): Promise<WorkflowRuntimeResult> {
    const steps = new Map(snapshot.steps.map((step) => [step.stepKey, step]));
    let stepKey = initialStepKey;
    for (let hop = 0; hop < snapshot.steps.length; hop += 1) {
      const step = steps.get(stepKey);
      if (!step) throw this.invalidSnapshot(`Không tìm thấy Workflow step: ${stepKey}`);
      if (step.type === 'APPROVAL') return this.enterApprovalStep(request, step, session);
      if (step.type === 'END') return this.complete(request, step, session);
      if (!step.condition) throw this.invalidSnapshot(`Bước điều kiện ${step.stepKey} thiếu cấu hình condition.`);

      const result = this.conditionEvaluator.evaluate(request, step.condition);
      await this.history.record(request, {
        stepKey: step.stepKey,
        action: 'CONDITION_EVALUATED',
        metadata: {
          source: step.condition.source,
          fieldKey: step.condition.fieldKey,
          operator: step.condition.operator,
          result,
        },
      }, session);
      const nextStepKey = result ? step.onTrueStepKey : step.onFalseStepKey;
      if (!nextStepKey) {
        throw this.invalidSnapshot(`Bước điều kiện ${step.stepKey} thiếu transition ${result ? 'TRUE' : 'FALSE'}.`);
      }
      stepKey = nextStepKey;
    }
    throw new BadRequestException({
      code: 'WORKFLOW_HOP_LIMIT_EXCEEDED',
      message: 'Workflow vượt quá giới hạn số bước cho phép. Có thể snapshot chứa vòng lặp.',
    });
  }

  private snapshot(request: RequestDocument): RuntimeWorkflowSnapshot {
    const value = request.workflowSnapshot;
    if (!this.isRecord(value)) throw this.invalidSnapshot('Phiếu chưa có workflowSnapshot hợp lệ.');
    const startStepKey = this.requiredString(value.startStepKey, 'startStepKey');
    if (!Array.isArray(value.steps) || value.steps.length === 0) {
      throw this.invalidSnapshot('workflowSnapshot phải có ít nhất một step.');
    }
    const steps = value.steps.map((step, index) => this.parseStep(step, index));
    const keys = new Set<string>();
    for (const step of steps) {
      if (keys.has(step.stepKey)) throw this.invalidSnapshot(`Workflow có stepKey trùng: ${step.stepKey}`);
      keys.add(step.stepKey);
    }
    if (!keys.has(startStepKey)) throw this.invalidSnapshot('startStepKey không tham chiếu đến step tồn tại.');
    return { startStepKey, steps };
  }

  private parseStep(value: unknown, index: number): RuntimeWorkflowStep {
    if (!this.isRecord(value)) throw this.invalidSnapshot(`Workflow step tại vị trí ${index} không hợp lệ.`);
    const stepKey = this.requiredString(value.stepKey, `steps.${index}.stepKey`).toUpperCase();
    const name = this.requiredString(value.name, `steps.${index}.name`);
    const type = this.enumValue(value.type, workflowStepTypes, `steps.${index}.type`);
    const base = {
      stepKey,
      name,
      type,
      allowSelfApproval: value.allowSelfApproval === true,
      ...this.optionalPositiveNumber(value.dueInHours, `steps.${index}.dueInHours`),
      ...this.optionalTransition(value, 'onApproveStepKey'),
      ...this.optionalTransition(value, 'onRejectStepKey'),
      ...this.optionalTransition(value, 'onRevisionStepKey'),
      ...this.optionalTransition(value, 'onTrueStepKey'),
      ...this.optionalTransition(value, 'onFalseStepKey'),
    };

    if (type === 'APPROVAL') {
      return {
        ...base,
        approvalMode: this.enumValue(value.approvalMode, approvalModes, `steps.${index}.approvalMode`),
        assigneeRule: this.parseAssigneeRule(value.assigneeRule, index),
      };
    }
    if (type === 'CONDITION') return { ...base, condition: this.parseCondition(value.condition, index) };
    return {
      ...base,
      endResult: this.enumValue(value.endResult, workflowEndResults, `steps.${index}.endResult`),
    };
  }

  private parseAssigneeRule(value: unknown, stepIndex: number): RuntimeAssigneeRule {
    if (!this.isRecord(value)) throw this.invalidSnapshot(`steps.${stepIndex}.assigneeRule không hợp lệ.`);
    return {
      type: this.enumValue(value.type, assigneeRuleTypes, `steps.${stepIndex}.assigneeRule.type`),
      ...this.optionalObjectIdArray(value.roleIds, 'roleIds'),
      ...this.optionalObjectIdArray(value.positionIds, 'positionIds'),
      ...this.optionalObjectIdArray(value.userIds, 'userIds'),
      ...this.optionalObjectId(value.departmentId, 'departmentId'),
      includeInactive: value.includeInactive === true,
    };
  }

  private parseCondition(value: unknown, stepIndex: number): RuntimeCondition {
    if (!this.isRecord(value)) throw this.invalidSnapshot(`steps.${stepIndex}.condition không hợp lệ.`);
    if (!Object.prototype.hasOwnProperty.call(value, 'value')) {
      throw this.invalidSnapshot(`steps.${stepIndex}.condition.value là bắt buộc.`);
    }
    return {
      source: this.enumValue(value.source, workflowConditionSources, `steps.${stepIndex}.condition.source`),
      fieldKey: this.requiredString(value.fieldKey, `steps.${stepIndex}.condition.fieldKey`),
      operator: this.enumValue(value.operator, workflowConditionOperators, `steps.${stepIndex}.condition.operator`),
      value: value.value,
    };
  }

  private requiredApprovals(mode: ApprovalMode, assigneeCount: number): number {
    if (mode === 'ANY') return 1;
    if (mode === 'ALL') return assigneeCount;
    return Math.floor(assigneeCount / 2) + 1;
  }

  private assigneeRuleSnapshot(rule: RuntimeAssigneeRule): Record<string, unknown> {
    return {
      type: rule.type,
      ...(rule.roleIds ? { roleIds: rule.roleIds.map((id) => id.toString()) } : {}),
      ...(rule.positionIds ? { positionIds: rule.positionIds.map((id) => id.toString()) } : {}),
      ...(rule.userIds ? { userIds: rule.userIds.map((id) => id.toString()) } : {}),
      ...(rule.departmentId ? { departmentId: rule.departmentId.toString() } : {}),
      includeInactive: rule.includeInactive,
    };
  }

  private optionalObjectIdArray(value: unknown, field: 'roleIds' | 'positionIds' | 'userIds') {
    if (value === undefined) return {};
    if (!Array.isArray(value)) throw this.invalidSnapshot(`${field} phải là một mảng ObjectId.`);
    return { [field]: value.map((item) => this.objectId(item, field)) } as Pick<RuntimeAssigneeRule, typeof field>;
  }

  private optionalObjectId(value: unknown, field: 'departmentId') {
    if (value === undefined || value === null) return {};
    return { [field]: this.objectId(value, field) } as Pick<RuntimeAssigneeRule, typeof field>;
  }

  private objectId(value: unknown, field: string): Types.ObjectId {
    if (value instanceof Types.ObjectId) return value;
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
      throw this.invalidSnapshot(`${field} chứa ObjectId không hợp lệ.`);
    }
    return new Types.ObjectId(value);
  }

  private optionalPositiveNumber(value: unknown, field: string): { dueInHours?: number } {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw this.invalidSnapshot(`${field} phải là số dương.`);
    }
    return { dueInHours: value };
  }

  private optionalTransition(record: Record<string, unknown>, field: keyof RuntimeWorkflowStep) {
    const value = record[field];
    if (value === undefined || value === null || value === '') return {};
    return { [field]: this.requiredString(value, field).toUpperCase() };
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw this.invalidSnapshot(`${field} phải là chuỗi không rỗng.`);
    return value.trim();
  }

  private enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
    if (typeof value !== 'string' || !values.includes(value as T)) {
      throw this.invalidSnapshot(`${field} không thuộc tập giá trị cho phép.`);
    }
    return value as T;
  }

  private invalidSnapshot(message: string): BadRequestException {
    return new BadRequestException({ code: 'WORKFLOW_SNAPSHOT_INVALID', message });
  }

  private runtimeConflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message });
  }

  private notificationDedupeKey(
    requestId: Types.ObjectId,
    stepKey: string,
    stepRunNo: number,
    action: string,
  ): string {
    return `REQUEST:${requestId.toString()}:STEP:${stepKey}:RUN:${stepRunNo}:${action}`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
