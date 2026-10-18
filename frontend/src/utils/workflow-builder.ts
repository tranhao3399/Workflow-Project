import type { FormDefinition, FormField, WorkflowGraphValidationError, WorkflowStep, WorkflowStepType } from '../types/workflow'

export interface WorkflowBuilderIssue extends WorkflowGraphValidationError {}

const stepKeyPattern = /^[A-Z][A-Z0-9_]*$/
const transitionKeys = ['onApproveStepKey', 'onRejectStepKey', 'onRevisionStepKey', 'onTrueStepKey', 'onFalseStepKey'] as const

export function initialWorkflowSteps(): WorkflowStep[] {
  return [
    {
      stepKey: 'APPROVAL_1', name: 'Phê duyệt', type: 'APPROVAL', uiPosition: { x: 250, y: 160 },
      approvalMode: 'ANY', allowSelfApproval: false,
      assigneeRule: { type: 'REQUESTER_DIRECT_MANAGER', includeInactive: false },
      onApproveStepKey: 'END_APPROVED', onRejectStepKey: 'END_REJECTED',
    },
    { stepKey: 'END_APPROVED', name: 'Đã phê duyệt', type: 'END', endResult: 'APPROVED', uiPosition: { x: 540, y: 80 } },
    { stepKey: 'END_REJECTED', name: 'Đã từ chối', type: 'END', endResult: 'REJECTED', uiPosition: { x: 540, y: 250 } },
  ]
}

export function createWorkflowStep(type: WorkflowStepType, steps: readonly WorkflowStep[]): WorkflowStep {
  const number = nextStepNumber(type, steps)
  const stepKey = `${type}_${number}`
  const uiPosition = { x: 250 + ((steps.length % 3) * 260), y: 110 + (Math.floor(steps.length / 3) * 160) }
  if (type === 'APPROVAL') return { stepKey, name: `Phê duyệt ${number}`, type, uiPosition, approvalMode: 'ANY', allowSelfApproval: false, assigneeRule: { type: 'REQUESTER_DIRECT_MANAGER', includeInactive: false } }
  if (type === 'CONDITION') return { stepKey, name: `Điều kiện ${number}`, type, uiPosition, condition: { source: 'FORM_FIELD', fieldKey: '', operator: 'EQUALS', value: '' } }
  return { stepKey, name: `Kết thúc ${number}`, type, uiPosition, endResult: 'APPROVED' }
}

export function workflowEdges(steps: readonly WorkflowStep[]): Array<{ id: string; source: string; target: string; label: string; tone: string }> {
  const edges: Array<{ id: string; source: string; target: string; label: string; tone: string }> = []
  for (const step of steps) {
    const candidates: Array<[string | undefined, string, string]> = step.type === 'APPROVAL'
      ? [[step.onApproveStepKey, 'Duyệt', 'success'], [step.onRejectStepKey, 'Từ chối', 'danger'], [step.onRevisionStepKey, 'Bổ sung', 'warning']]
      : step.type === 'CONDITION'
        ? [[step.onTrueStepKey, 'Đúng', 'success'], [step.onFalseStepKey, 'Sai', 'danger']]
        : []
    candidates.forEach(([target, label, tone], index) => {
      if (target) edges.push({ id: `${step.stepKey}-${index}-${target}`, source: step.stepKey, target, label, tone })
    })
  }
  return edges
}

export function validateWorkflowDraft(startStepKey: string, steps: readonly WorkflowStep[], form?: FormDefinition | null): WorkflowBuilderIssue[] {
  const issues: WorkflowBuilderIssue[] = []
  const keyIndexes = new Map<string, number[]>()
  steps.forEach((step, index) => {
    keyIndexes.set(step.stepKey, [...(keyIndexes.get(step.stepKey) ?? []), index])
    if (!stepKeyPattern.test(step.stepKey)) add(issues, 'INVALID_STEP_KEY', `steps.${index}.stepKey`, step.stepKey, 'Step key phải bắt đầu bằng chữ in hoa và chỉ gồm chữ, số, dấu gạch dưới.')
    if (!step.name.trim()) add(issues, 'STEP_NAME_REQUIRED', `steps.${index}.name`, step.stepKey, 'Tên node là bắt buộc.')
  })
  for (const indexes of keyIndexes.values()) if (indexes.length > 1) indexes.forEach((index) => add(issues, 'DUPLICATE_STEP_KEY', `steps.${index}.stepKey`, steps[index].stepKey, 'Step key không được trùng.'))
  const keys = new Set(steps.map((step) => step.stepKey))
  if (!startStepKey || !keys.has(startStepKey)) add(issues, 'START_STEP_NOT_FOUND', 'startStepKey', startStepKey || undefined, 'START phải nối tới một node đang tồn tại.')
  if (!steps.some((step) => step.type === 'END')) add(issues, 'END_STEP_REQUIRED', 'steps', undefined, 'Quy trình cần ít nhất một node END.')
  steps.forEach((step, index) => validateStep(step, index, keys, form?.fields ?? [], issues))
  return issues
}

export function normalizeWorkflowSteps(steps: readonly WorkflowStep[]): WorkflowStep[] {
  return steps.map((step, index) => ({
    ...step,
    stepKey: step.stepKey.trim().toUpperCase(),
    name: step.name.trim(),
    uiPosition: step.uiPosition ?? { x: 250 + ((index % 3) * 260), y: 110 + (Math.floor(index / 3) * 160) },
  }))
}

export function operatorOptionsForField(field?: FormField): Array<'EQUALS' | 'NOT_EQUALS' | 'IN' | 'GREATER_THAN' | 'LESS_THAN'> {
  if (field && ['NUMBER', 'CURRENCY', 'DATE', 'DATETIME'].includes(field.type)) return ['EQUALS', 'NOT_EQUALS', 'IN', 'GREATER_THAN', 'LESS_THAN']
  return ['EQUALS', 'NOT_EQUALS', 'IN']
}

function validateStep(step: WorkflowStep, index: number, keys: ReadonlySet<string>, formFields: readonly FormField[], issues: WorkflowBuilderIssue[]): void {
  const path = `steps.${index}`
  if (step.type === 'APPROVAL') {
    if (!step.approvalMode) add(issues, 'APPROVAL_MODE_REQUIRED', `${path}.approvalMode`, step.stepKey, 'Chưa chọn chế độ phê duyệt.')
    if (!step.assigneeRule) add(issues, 'ASSIGNEE_RULE_REQUIRED', `${path}.assigneeRule`, step.stepKey, 'Chưa chọn quy tắc người duyệt.')
    if ((step.assigneeRule?.type === 'ROLE' || step.assigneeRule?.type === 'ROLE_IN_REQUESTER_DEPARTMENT') && !step.assigneeRule.roleIds?.length) add(issues, 'ROLE_REQUIRED', `${path}.assigneeRule.roleIds`, step.stepKey, 'Cần chọn ít nhất một vai trò.')
    if (step.assigneeRule?.type === 'POSITION_IN_REQUESTER_DEPARTMENT' && !step.assigneeRule.positionIds?.length) add(issues, 'POSITION_REQUIRED', `${path}.assigneeRule.positionIds`, step.stepKey, 'Cần chọn ít nhất một chức danh.')
    if (step.assigneeRule?.type === 'SPECIFIC_USER' && !step.assigneeRule.userIds?.length) add(issues, 'USER_REQUIRED', `${path}.assigneeRule.userIds`, step.stepKey, 'Cần chọn ít nhất một người dùng.')
    if (!step.onApproveStepKey) add(issues, 'APPROVE_TRANSITION_REQUIRED', `${path}.onApproveStepKey`, step.stepKey, 'Thiếu transition Duyệt.')
    if (!step.onRejectStepKey) add(issues, 'REJECT_TRANSITION_REQUIRED', `${path}.onRejectStepKey`, step.stepKey, 'Thiếu transition Từ chối.')
  }
  if (step.type === 'CONDITION') {
    if (!step.condition?.fieldKey) add(issues, 'CONDITION_FIELD_REQUIRED', `${path}.condition.fieldKey`, step.stepKey, 'Chưa chọn dữ liệu điều kiện.')
    if (step.condition?.source === 'FORM_FIELD' && step.condition.fieldKey && !formFields.some((field) => field.key === step.condition?.fieldKey)) add(issues, 'FORM_FIELD_NOT_FOUND', `${path}.condition.fieldKey`, step.stepKey, 'Trường Form dùng trong điều kiện không tồn tại.')
    if (!step.onTrueStepKey) add(issues, 'TRUE_TRANSITION_REQUIRED', `${path}.onTrueStepKey`, step.stepKey, 'Thiếu transition Đúng.')
    if (!step.onFalseStepKey) add(issues, 'FALSE_TRANSITION_REQUIRED', `${path}.onFalseStepKey`, step.stepKey, 'Thiếu transition Sai.')
  }
  if (step.type === 'END') {
    if (!step.endResult) add(issues, 'END_RESULT_REQUIRED', `${path}.endResult`, step.stepKey, 'END phải chọn kết quả.')
    if (transitionKeys.some((key) => Boolean(step[key]))) add(issues, 'END_HAS_OUTGOING', path, step.stepKey, 'END không được có transition đi ra.')
  }
  transitionKeys.forEach((key) => { const target = step[key]; if (target && !keys.has(target)) add(issues, 'TRANSITION_TARGET_NOT_FOUND', `${path}.${key}`, step.stepKey, `Không tìm thấy node đích ${target}.`) })
}

function add(issues: WorkflowBuilderIssue[], code: string, path: string, stepKey: string | undefined, message: string) {
  issues.push({ code, path, ...(stepKey ? { stepKey } : {}), message })
}

function nextStepNumber(type: WorkflowStepType, steps: readonly WorkflowStep[]): number {
  let number = 1
  const keys = new Set(steps.map((step) => step.stepKey))
  while (keys.has(`${type}_${number}`)) number += 1
  return number
}
