import { Injectable } from '@nestjs/common';
import type { FormField } from '../form-definitions/schemas/form-definition.schema.js';
import type {
  ApprovalMode,
  AssigneeRuleType,
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

const requesterAttributes = new Set(['employeeCode', 'departmentId', 'positionId', 'managerEmployeeId']);
const transitionFields = ['onApproveStepKey', 'onRejectStepKey', 'onRevisionStepKey', 'onTrueStepKey', 'onFalseStepKey'] as const;

interface GraphWorkflowStep {
  stepKey: string;
  name: string;
  type: WorkflowStepType;
  assigneeRule?: {
    type: AssigneeRuleType;
    roleIds?: readonly unknown[];
    positionIds?: readonly unknown[];
    userIds?: readonly unknown[];
    includeInactive: boolean;
  };
  approvalMode?: ApprovalMode;
  allowSelfApproval?: boolean;
  condition?: { source: WorkflowConditionSource; fieldKey: string; operator: WorkflowConditionOperator; value: unknown };
  endResult?: WorkflowEndResult;
  onApproveStepKey?: string;
  onRejectStepKey?: string;
  onRevisionStepKey?: string;
  onTrueStepKey?: string;
  onFalseStepKey?: string;
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
      if (!step.onApproveStepKey) this.add(errors, 'APPROVE_TRANSITION_REQUIRED', `${path}.onApproveStepKey`, step.stepKey, 'Thiếu nhánh sau khi phê duyệt.');
      if (!step.onRejectStepKey) this.add(errors, 'REJECT_TRANSITION_REQUIRED', `${path}.onRejectStepKey`, step.stepKey, 'Thiếu nhánh sau khi từ chối.');
      this.validateAssigneeRule(step, path, errors);
      if (step.condition || step.endResult || step.onTrueStepKey || step.onFalseStepKey) this.add(errors, 'APPROVAL_FIELDS_INVALID', path, step.stepKey, 'Bước phê duyệt chứa thuộc tính của loại node khác.');
    } else if (step.type === 'CONDITION') {
      if (!step.condition) this.add(errors, 'CONDITION_REQUIRED', `${path}.condition`, step.stepKey, 'Node điều kiện chưa có biểu thức điều kiện.');
      if (!step.onTrueStepKey) this.add(errors, 'TRUE_TRANSITION_REQUIRED', `${path}.onTrueStepKey`, step.stepKey, 'Thiếu nhánh Đúng.');
      if (!step.onFalseStepKey) this.add(errors, 'FALSE_TRANSITION_REQUIRED', `${path}.onFalseStepKey`, step.stepKey, 'Thiếu nhánh Sai.');
      if (step.condition) this.validateCondition(step, path, formFieldsByKey, errors);
      if (step.assigneeRule || step.approvalMode || step.allowSelfApproval !== undefined || step.endResult || step.onApproveStepKey || step.onRejectStepKey || step.onRevisionStepKey) {
        this.add(errors, 'CONDITION_FIELDS_INVALID', path, step.stepKey, 'Node điều kiện chứa thuộc tính của loại node khác.');
      }
    } else {
      if (!step.endResult) this.add(errors, 'END_RESULT_REQUIRED', `${path}.endResult`, step.stepKey, 'Node kết thúc phải chọn kết quả APPROVED hoặc REJECTED.');
      if (transitionFields.some((field) => Boolean(step[field]))) this.add(errors, 'END_HAS_OUTGOING', path, step.stepKey, 'Node kết thúc không được có transition đi ra.');
      if (step.assigneeRule || step.approvalMode || step.allowSelfApproval !== undefined || step.condition) this.add(errors, 'END_FIELDS_INVALID', path, step.stepKey, 'Node kết thúc chứa thuộc tính của loại node khác.');
    }
    for (const field of transitionFields) {
      const target = step[field];
      if (target && !stepsByKey.has(target)) this.add(errors, 'TRANSITION_TARGET_NOT_FOUND', `${path}.${field}`, step.stepKey, `Không tìm thấy node đích ${target}.`);
    }
  }

  private validateAssigneeRule(step: GraphWorkflowStep, path: string, errors: WorkflowGraphValidationError[]): void {
    const rule = step.assigneeRule;
    if (!rule) return;
    if ((rule.type === 'ROLE' || rule.type === 'ROLE_IN_REQUESTER_DEPARTMENT') && !rule.roleIds?.length) {
      this.add(errors, 'ROLE_REQUIRED', `${path}.assigneeRule.roleIds`, step.stepKey, 'Quy tắc này cần ít nhất một vai trò.');
    }
    if (rule.type === 'POSITION_IN_REQUESTER_DEPARTMENT' && !rule.positionIds?.length) {
      this.add(errors, 'POSITION_REQUIRED', `${path}.assigneeRule.positionIds`, step.stepKey, 'Quy tắc này cần ít nhất một chức danh.');
    }
    if (rule.type === 'SPECIFIC_USER' && !rule.userIds?.length) {
      this.add(errors, 'USER_REQUIRED', `${path}.assigneeRule.userIds`, step.stepKey, 'Quy tắc này cần ít nhất một người dùng.');
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
      const ordered = new Set(['NUMBER', 'CURRENCY', 'DATE', 'DATETIME']);
      if ((condition.operator === 'GREATER_THAN' || condition.operator === 'LESS_THAN') && !ordered.has(field.type)) {
        this.add(errors, 'CONDITION_OPERATOR_TYPE_MISMATCH', `${path}.condition.operator`, step.stepKey, 'Toán tử so sánh lớn/nhỏ không phù hợp với kiểu trường này.');
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
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (stepKey: string) => {
      if (visiting.has(stepKey)) {
        this.add(errors, 'WORKFLOW_CYCLE', 'steps', stepKey, `Quy trình tạo vòng lặp tại ${stepKey}.`);
        return;
      }
      if (visited.has(stepKey)) return;
      const step = stepsByKey.get(stepKey);
      if (!step) return;
      visiting.add(stepKey);
      for (const target of transitionFields.flatMap((field) => step[field] ? [step[field]!] : [])) visit(target);
      visiting.delete(stepKey);
      visited.add(stepKey);
    };
    visit(startStepKey);
    for (const key of stepsByKey.keys()) {
      if (!visited.has(key)) this.add(errors, 'ORPHAN_STEP', 'steps', key, `Node ${key} không thể đi tới từ START.`);
    }

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
      const targets = transitionFields.flatMap((field) => step[field] ? [step[field]!] : []);
      const nextTrail = new Set(trail).add(stepKey);
      const result = targets.length > 0 && targets.every((target) => reachesEnd(target, nextTrail));
      endReachability.set(stepKey, result);
      return result;
    };
    for (const key of visited) {
      if (!reachesEnd(key, new Set())) {
        this.add(errors, 'PATH_DOES_NOT_REACH_END', 'steps', key, `Mọi nhánh từ node ${key} phải dẫn tới END.`);
      }
    }
  }

  private add(errors: WorkflowGraphValidationError[], code: string, path: string, stepKey: string | undefined, message: string): void {
    errors.push({ code, path, ...(stepKey ? { stepKey } : {}), message });
  }
}
