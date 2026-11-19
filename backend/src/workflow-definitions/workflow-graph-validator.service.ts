import { Injectable } from '@nestjs/common';
import type { FormField } from '../form-definitions/schemas/form-definition.schema.js';
import type {
  ApprovalMode,
  AssigneeRuleType,
  WorkflowActionType,
  WorkflowConditionOperator,
  WorkflowConditionSource,
  WorkflowEndResult,
  WorkflowStepType,
} from './schemas/workflow-definition.schema.js';

export interface WorkflowGraphValidationError {
  code: string;
  path: string;
  stepKey?: string;
  message: string;
}

export interface WorkflowGraphValidationResult {
  valid: boolean;
  errors: WorkflowGraphValidationError[];
}

const requesterAttributes = new Set([
  'employeeCode',
  'workUnitId',
  'departmentId',
  'positionId',
  'managerEmployeeId',
]);
const forwardTransitionFields = ['onApproveStepKey', 'onRejectStepKey', 'onTrueStepKey', 'onFalseStepKey', 'onNextStepKey'] as const;
const transitionFields = ['onApproveStepKey', 'onRejectStepKey', 'onRevisionStepKey', 'onTrueStepKey', 'onFalseStepKey', 'onNextStepKey'] as const;

interface GraphAssigneeRule {
  type: AssigneeRuleType;
  roleIds?: readonly unknown[];
  positionIds?: readonly unknown[];
  userIds?: readonly unknown[];
  includeInactive: boolean;
}

interface GraphWorkflowStep {
  stepKey: string;
  name: string;
  type: WorkflowStepType;
  assigneeRule?: GraphAssigneeRule;
  approvalMode?: ApprovalMode;
  allowSelfApproval?: boolean;
  allowReassign?: boolean;
  condition?: { source: WorkflowConditionSource; fieldKey: string; operator: WorkflowConditionOperator; value: unknown };
  actionConfig?: {
    actionType: WorkflowActionType;
    fieldKey?: string;
    allowNegative?: boolean;
    assigneeRule?: GraphAssigneeRule;
    notificationTitle?: string;
    notificationMessage?: string;
  };
  endResult?: WorkflowEndResult;
  onApproveStepKey?: string;
  onRejectStepKey?: string;
  onRevisionStepKey?: string;
  onTrueStepKey?: string;
  onFalseStepKey?: string;
  onNextStepKey?: string;
}

@Injectable()
export class WorkflowGraphValidatorService {
  validate(startStepKey: string, steps: readonly GraphWorkflowStep[], formFields: readonly FormField[]): WorkflowGraphValidationResult {
    const errors: WorkflowGraphValidationError[] = [];
    const stepsByKey = new Map<string, GraphWorkflowStep>();
    steps.forEach((step, index) => {
      if (stepsByKey.has(step.stepKey)) this.add(errors, 'DUPLICATE_STEP_KEY', `steps.${index}.stepKey`, step.stepKey, 'Step key không được trùng.');
      stepsByKey.set(step.stepKey, step);
    });
    if (!stepsByKey.has(startStepKey)) this.add(errors, 'START_STEP_NOT_FOUND', 'startStepKey', startStepKey, 'Bước bắt đầu phải tham chiếu một node đang tồn tại.');

    const formFieldsByKey = new Map(formFields.map((field) => [field.key, field]));
    steps.forEach((step, index) => {
      this.validateStep(step, index, stepsByKey, formFieldsByKey, errors);
    });
    if (stepsByKey.has(startStepKey)) this.validateTraversal(startStepKey, stepsByKey, errors);
    if (!steps.some((step) => step.type === 'END')) this.add(errors, 'END_STEP_REQUIRED', 'steps', undefined, 'Quy trình cần ít nhất một bước kết thúc.');
    return { valid: errors.length === 0, errors };
  }

  private validateStep(
    step: GraphWorkflowStep,
    index: number,
    stepsByKey: ReadonlyMap<string, GraphWorkflowStep>,
    formFieldsByKey: ReadonlyMap<string, FormField>,
    errors: WorkflowGraphValidationError[],
  ): void {
    const path = `steps.${index}`;
    if (step.type === 'APPROVAL') {
      if (!step.assigneeRule) this.add(errors, 'ASSIGNEE_RULE_REQUIRED', `${path}.assigneeRule`, step.stepKey, 'Bước phê duyệt chưa có quy tắc người duyệt.');
      if (!step.approvalMode) this.add(errors, 'APPROVAL_MODE_REQUIRED', `${path}.approvalMode`, step.stepKey, 'Bước phê duyệt chưa có chế độ phê duyệt.');
      const hasNextTransition = Boolean(step.onNextStepKey);
      const hasLegacyTransitions = Boolean(step.onApproveStepKey || step.onRejectStepKey);
      if (hasNextTransition && hasLegacyTransitions) {
        this.add(errors, 'APPROVAL_TRANSITION_CONFLICT', path, step.stepKey, 'Không thể kết hợp onNextStepKey với onApproveStepKey/onRejectStepKey.');
      } else if (!hasNextTransition && !hasLegacyTransitions) {
        this.add(errors, 'NEXT_TRANSITION_REQUIRED', `${path}.onNextStepKey`, step.stepKey, 'Bước phê duyệt cần nối tới bước tiếp theo (ví dụ Exclusive Gateway).');
      } else if (hasLegacyTransitions) {
        if (!step.onApproveStepKey) this.add(errors, 'APPROVE_TRANSITION_REQUIRED', `${path}.onApproveStepKey`, step.stepKey, 'Thiếu nhánh sau khi phê duyệt.');
        if (!step.onRejectStepKey) this.add(errors, 'REJECT_TRANSITION_REQUIRED', `${path}.onRejectStepKey`, step.stepKey, 'Thiếu nhánh sau khi từ chối.');
      }
      this.validateAssigneeRule(step.assigneeRule, `${path}.assigneeRule`, step.stepKey, errors);
      if (step.condition || step.actionConfig || step.endResult || step.onTrueStepKey || step.onFalseStepKey) {
        this.add(errors, 'APPROVAL_FIELDS_INVALID', path, step.stepKey, 'Bước phê duyệt chứa thuộc tính của loại node khác.');
      }
    } else if (step.type === 'CONDITION') {
      if (!step.condition) this.add(errors, 'CONDITION_REQUIRED', `${path}.condition`, step.stepKey, 'Node điều kiện chưa có biểu thức điều kiện.');
      if (!step.onTrueStepKey) this.add(errors, 'TRUE_TRANSITION_REQUIRED', `${path}.onTrueStepKey`, step.stepKey, 'Thiếu nhánh Đúng.');
      if (!step.onFalseStepKey) this.add(errors, 'FALSE_TRANSITION_REQUIRED', `${path}.onFalseStepKey`, step.stepKey, 'Thiếu nhánh Sai.');
      if (step.condition) this.validateCondition(step, path, formFieldsByKey, errors);
      if (step.assigneeRule || step.approvalMode || step.allowSelfApproval !== undefined || step.allowReassign !== undefined || step.actionConfig || step.endResult || step.onApproveStepKey || step.onRejectStepKey || step.onRevisionStepKey || step.onNextStepKey) {
        this.add(errors, 'CONDITION_FIELDS_INVALID', path, step.stepKey, 'Node điều kiện chứa thuộc tính của loại node khác.');
      }
    } else if (step.type === 'ACTION') {
      if (!step.actionConfig) this.add(errors, 'ACTION_CONFIG_REQUIRED', `${path}.actionConfig`, step.stepKey, 'Bước hành động tự động chưa có cấu hình thực thi.');
      if (!step.onNextStepKey) this.add(errors, 'NEXT_TRANSITION_REQUIRED', `${path}.onNextStepKey`, step.stepKey, 'Bước hành động tự động thiếu nhánh tiếp theo.');
      if (step.actionConfig) this.validateActionConfig(step, path, formFieldsByKey, errors);
      if (step.assigneeRule || step.approvalMode || step.allowSelfApproval !== undefined || step.allowReassign !== undefined || step.condition || step.endResult || step.onApproveStepKey || step.onRejectStepKey || step.onRevisionStepKey || step.onTrueStepKey || step.onFalseStepKey) {
        this.add(errors, 'ACTION_FIELDS_INVALID', path, step.stepKey, 'Node hành động tự động chứa thuộc tính của loại node khác.');
      }
    } else {
      if (!step.endResult) this.add(errors, 'END_RESULT_REQUIRED', `${path}.endResult`, step.stepKey, 'Node kết thúc phải chọn kết quả APPROVED hoặc REJECTED.');
      if (transitionFields.some((field) => Boolean(step[field]))) this.add(errors, 'END_HAS_OUTGOING', path, step.stepKey, 'Node kết thúc không được có transition đi ra.');
      if (step.assigneeRule || step.approvalMode || step.allowSelfApproval !== undefined || step.allowReassign !== undefined || step.condition || step.actionConfig) {
        this.add(errors, 'END_FIELDS_INVALID', path, step.stepKey, 'Node kết thúc chứa thuộc tính của loại node khác.');
      }
    }
    for (const field of transitionFields) {
      const target = step[field];
      if (target && !stepsByKey.has(target)) this.add(errors, 'TRANSITION_TARGET_NOT_FOUND', `${path}.${field}`, step.stepKey, `Không tìm thấy node đích ${target}.`);
    }
  }

  private validateAssigneeRule(
    rule: GraphAssigneeRule | undefined,
    rulePath: string,
    stepKey: string,
    errors: WorkflowGraphValidationError[],
  ): void {
    if (!rule) return;
    if ((rule.type === 'ROLE' || rule.type === 'ROLE_IN_REQUESTER_DEPARTMENT') && !rule.roleIds?.length) {
      this.add(errors, 'ROLE_REQUIRED', `${rulePath}.roleIds`, stepKey, 'Quy tắc này cần ít nhất một vai trò.');
    }
    if (rule.type === 'POSITION_IN_REQUESTER_DEPARTMENT' && !rule.positionIds?.length) {
      this.add(errors, 'POSITION_REQUIRED', `${rulePath}.positionIds`, stepKey, 'Quy tắc này cần ít nhất một chức danh.');
    }
    if (rule.type === 'SPECIFIC_USER' && !rule.userIds?.length) {
      this.add(errors, 'USER_REQUIRED', `${rulePath}.userIds`, stepKey, 'Quy tắc này cần ít nhất một người dùng.');
    }
  }

  private validateActionConfig(
    step: GraphWorkflowStep,
    path: string,
    formFieldsByKey: ReadonlyMap<string, FormField>,
    errors: WorkflowGraphValidationError[],
  ): void {
    const config = step.actionConfig!;
    if (config.actionType === 'BALANCE_DEDUCT' || config.actionType === 'BALANCE_ADD') {
      if (!config.fieldKey) {
        this.add(errors, 'ACTION_FIELD_REQUIRED', `${path}.actionConfig.fieldKey`, step.stepKey, 'Cần chọn trường dữ liệu số ngày phép trên Form.');
        return;
      }
      const field = formFieldsByKey.get(config.fieldKey);
      if (!field) {
        this.add(errors, 'FORM_FIELD_NOT_FOUND', `${path}.actionConfig.fieldKey`, step.stepKey, 'Trường Form dùng cho hành động quỹ phép không tồn tại.');
        return;
      }
      if (field.type !== 'NUMBER' || field.autoFill) {
        this.add(errors, 'ACTION_FIELD_TYPE_INVALID', `${path}.actionConfig.fieldKey`, step.stepKey, 'Trường lấy giá trị quỹ phép phải là trường kiểu Số (không phải trường tự điền).');
      }
    } else if (config.actionType === 'SEND_NOTIFICATION') {
      if (!config.assigneeRule) {
        this.add(errors, 'ASSIGNEE_RULE_REQUIRED', `${path}.actionConfig.assigneeRule`, step.stepKey, 'Hành động gửi thông báo chưa chọn quy tắc người nhận.');
        return;
      }
      this.validateAssigneeRule(config.assigneeRule, `${path}.actionConfig.assigneeRule`, step.stepKey, errors);
    }
  }

  private validateCondition(
    step: GraphWorkflowStep,
    path: string,
    formFieldsByKey: ReadonlyMap<string, FormField>,
    errors: WorkflowGraphValidationError[],
  ): void {
    const condition = step.condition!;
    if (condition.source === 'FORM_FIELD') {
      const field = formFieldsByKey.get(condition.fieldKey);
      if (!field) {
        this.add(errors, 'FORM_FIELD_NOT_FOUND', `${path}.condition.fieldKey`, step.stepKey, 'Trường Form dùng trong điều kiện không tồn tại.');
        return;
      }
      if (field.type === 'FILE' || field.type === 'TABLE' || field.type === 'SECTION') {
        this.add(errors, 'CONDITION_FIELD_TYPE_UNSUPPORTED', `${path}.condition.fieldKey`, step.stepKey, 'Trường tệp, bảng dữ liệu hoặc tiêu đề phân đoạn không thể dùng trực tiếp làm điều kiện Workflow.');
        return;
      }
      const ordered = new Set(['NUMBER', 'CURRENCY', 'DATE', 'DATETIME']);
      if ((condition.operator === 'GREATER_THAN' || condition.operator === 'LESS_THAN') && !ordered.has(field.type)) {
        this.add(errors, 'CONDITION_OPERATOR_TYPE_MISMATCH', `${path}.condition.operator`, step.stepKey, 'Toán tử so sánh lớn/nhỏ không phù hợp với kiểu trường này.');
      }
    } else if (condition.source === 'APPROVAL_OUTCOME') {
      if (condition.fieldKey !== 'decision') {
        this.add(errors, 'APPROVAL_OUTCOME_FIELD_INVALID', `${path}.condition.fieldKey`, step.stepKey, 'Điều kiện kết quả phê duyệt phải kiểm tra trường decision.');
      } else if (condition.operator === 'GREATER_THAN' || condition.operator === 'LESS_THAN') {
        this.add(errors, 'APPROVAL_OUTCOME_OPERATOR_INVALID', `${path}.condition.operator`, step.stepKey, 'Kết quả phê duyệt chỉ hỗ trợ Bằng, Khác và Nằm trong.');
      }
      const allowedValues = new Set(['APPROVED', 'REJECTED']);
      if (condition.operator === 'IN') {
        if (!Array.isArray(condition.value) || condition.value.length === 0 || condition.value.some((item) => typeof item !== 'string' || !allowedValues.has(item))) {
          this.add(errors, 'APPROVAL_OUTCOME_VALUE_INVALID', `${path}.condition.value`, step.stepKey, 'Giá trị kết quả phê duyệt phải thuộc APPROVED hoặc REJECTED.');
        }
      } else if (typeof condition.value !== 'string' || !allowedValues.has(condition.value)) {
        this.add(errors, 'APPROVAL_OUTCOME_VALUE_INVALID', `${path}.condition.value`, step.stepKey, 'Giá trị kết quả phê duyệt phải là APPROVED hoặc REJECTED.');
      }
    } else if (!requesterAttributes.has(condition.fieldKey)) {
      this.add(errors, 'REQUESTER_ATTRIBUTE_NOT_ALLOWED', `${path}.condition.fieldKey`, step.stepKey, 'Thuộc tính người gửi không nằm trong whitelist.');
    } else if (condition.operator === 'GREATER_THAN' || condition.operator === 'LESS_THAN') {
      this.add(errors, 'REQUESTER_OPERATOR_NOT_ALLOWED', `${path}.condition.operator`, step.stepKey, 'Thuộc tính người gửi chỉ hỗ trợ Bằng, Khác và Nằm trong.');
    }
    if (condition.operator === 'IN' && !Array.isArray(condition.value)) {
      this.add(errors, 'IN_REQUIRES_ARRAY', `${path}.condition.value`, step.stepKey, 'Toán tử IN cần một danh sách giá trị.');
    }
  }

  private validateTraversal(startStepKey: string, stepsByKey: ReadonlyMap<string, GraphWorkflowStep>, errors: WorkflowGraphValidationError[]): void {
    // 1. Collect all nodes reachable from START (including revision transitions so
    //    revision-only branches are still treated as connected to the workflow).
    const reachable = new Set<string>();
    const collectReachable = (stepKey: string) => {
      if (reachable.has(stepKey) || !stepsByKey.has(stepKey)) return;
      reachable.add(stepKey);
      const step = stepsByKey.get(stepKey)!;
      for (const target of transitionFields.flatMap((field) => step[field] ? [step[field]!] : [])) {
        collectReachable(target);
      }
    };
    collectReachable(startStepKey);
    for (const key of stepsByKey.keys()) {
      if (!reachable.has(key)) this.add(errors, 'ORPHAN_STEP', 'steps', key, `Node ${key} không thể đi tới từ START.`);
    }

    // 2. Enforce acyclicity strictly on forward transitions so onRevisionStepKey can
    //    safely route back to an earlier step (or self) where execution pauses for resubmit.
    const visitedForward = new Set<string>();
    const visitingForward = new Set<string>();
    const visitForward = (stepKey: string) => {
      if (visitingForward.has(stepKey)) {
        this.add(errors, 'WORKFLOW_CYCLE', 'steps', stepKey, `Quy trình tạo vòng lặp tại ${stepKey}.`);
        return;
      }
      if (visitedForward.has(stepKey)) return;
      const step = stepsByKey.get(stepKey);
      if (!step) return;
      visitingForward.add(stepKey);
      for (const target of forwardTransitionFields.flatMap((field) => step[field] ? [step[field]!] : [])) {
        visitForward(target);
      }
      visitingForward.delete(stepKey);
      visitedForward.add(stepKey);
    };
    for (const key of reachable) visitForward(key);

    // 3. Every reachable node must reach END along all forward branches.
    const endReachability = new Map<string, boolean>();
    const reachesEnd = (stepKey: string, trail: Set<string>): boolean => {
      const cached = endReachability.get(stepKey);
      if (cached !== undefined) return cached;
      if (trail.has(stepKey)) return false;
      const step = stepsByKey.get(stepKey);
      if (!step) return false;
      if (step.type === 'END') {
        endReachability.set(stepKey, true);
        return true;
      }
      const targets = forwardTransitionFields.flatMap((field) => step[field] ? [step[field]!] : []);
      const nextTrail = new Set(trail).add(stepKey);
      const result = targets.length > 0 && targets.every((target) => reachesEnd(target, nextTrail));
      endReachability.set(stepKey, result);
      return result;
    };
    for (const key of reachable) {
      if (!reachesEnd(key, new Set())) {
        this.add(errors, 'PATH_DOES_NOT_REACH_END', 'steps', key, `Mọi nhánh từ node ${key} phải dẫn tới END.`);
      }
    }
  }

  private add(errors: WorkflowGraphValidationError[], code: string, path: string, stepKey: string | undefined, message: string): void {
    errors.push({ code, path, ...(stepKey ? { stepKey } : {}), message });
  }
}
