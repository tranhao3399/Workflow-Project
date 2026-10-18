import type {
  AssigneeRuleType,
  FormDefinition,
  FormField,
  WorkflowBuilderReferenceData,
  WorkflowDefinition,
  WorkflowGraphValidationError,
} from '../../types/workflow'
import { approvalModes, assigneeRuleTypes, workflowConditionSources, workflowEndResults } from '../../types/workflow'
import { operatorOptionsForField } from '../../utils/workflow-builder'
import { FilterSelect } from '../ui/FilterSelect'
import { assigneeRuleLabels, type BpmnNodePatch, type BpmnNodeSelection } from './bpmn-workflow'

interface WorkflowDraftProperties {
  code: string
  name: string
  description: string
  formDefinitionId: string
}

interface WorkflowPropertiesPanelProps {
  workflow: WorkflowDraftProperties
  definition: WorkflowDefinition | null
  forms: readonly FormDefinition[]
  selection: BpmnNodeSelection | null
  issues: readonly WorkflowGraphValidationError[]
  referenceData: WorkflowBuilderReferenceData
  disabled: boolean
  onWorkflowChange: (patch: Partial<WorkflowDraftProperties>) => void
  onNodeChange: (patch: BpmnNodePatch) => void
  onDeleteNode: () => void
  onClearSelection: () => void
}

const requesterAttributes = [
  { value: 'employeeCode', label: 'Mã nhân viên' },
  { value: 'departmentId', label: 'Phòng ban' },
  { value: 'positionId', label: 'Chức danh' },
  { value: 'managerEmployeeId', label: 'Quản lý trực tiếp' },
]

export function WorkflowPropertiesPanel({ workflow, definition, forms, selection, issues, referenceData, disabled, onWorkflowChange, onNodeChange, onDeleteNode, onClearSelection }: WorkflowPropertiesPanelProps) {
  if (!selection) {
    const issue = (path: string) => issues.find((item) => item.path === path)?.message
    return <div className="workflow-properties-body">
      <PropertyField label="Mã Workflow" required error={issue('code')}><input value={workflow.code} disabled={disabled || Boolean(definition)} maxLength={80} onChange={(event) => onWorkflowChange({ code: event.target.value.toUpperCase() })} /></PropertyField>
      <PropertyField label="Tên Workflow" required error={issue('name')}><input value={workflow.name} disabled={disabled} maxLength={160} onChange={(event) => onWorkflowChange({ name: event.target.value })} /></PropertyField>
      <PropertyField label="Mô tả"><textarea value={workflow.description} disabled={disabled} rows={4} maxLength={2000} onChange={(event) => onWorkflowChange({ description: event.target.value })} /></PropertyField>
      <PropertyField label="Form Definition" required error={issue('formDefinitionId')}><FilterSelect disabled={disabled || Boolean(definition)} ariaLabel="Chọn Form Definition" value={workflow.formDefinitionId} options={[{ value: '', label: 'Chọn Form DRAFT hoặc PUBLISHED' }, ...forms.map((form) => ({ value: form.id, label: `${form.code} · v${form.version} · ${form.name} · ${form.status}` }))]} onChange={(value) => onWorkflowChange({ formDefinitionId: value })} /></PropertyField>
      <div className="workflow-start-help"><strong>BPMN XML là dữ liệu thiết kế</strong><p>Backend sẽ biên dịch sơ đồ thành các bước thực thi khi lưu. Palette chỉ chứa phần tử Workflow Engine hỗ trợ.</p></div>
    </div>
  }

  const elementError = (suffix?: string) => issues.find((item) => item.elementId === selection.elementId && (!suffix || item.path.endsWith(suffix)))?.message
  const flowOptions = [{ value: '', label: 'Chọn đường nối' }, ...selection.outgoingFlows.map((flow) => ({ value: flow.id, label: flow.label }))]
  const badgeClass = selection.kind === 'APPROVAL' ? 'type-approval' : selection.kind === 'CONDITION' ? 'type-condition' : selection.kind === 'END' ? 'type-end' : ''

  return <div className="workflow-properties-body">
    <div className="workflow-node-property-heading"><span className={`workflow-node-chip ${badgeClass}`}>{selectionKindLabel(selection.kind)}</span><button className="text-action-button" type="button" onClick={onClearSelection}>Workflow</button></div>
    <PropertyField label="BPMN element ID"><input value={selection.elementId} disabled /></PropertyField>
    {selection.kind === 'SEQUENCE_FLOW' && <div className="workflow-start-help"><strong>Sequence Flow</strong><p>Chọn node nguồn để gán đường nối này cho nhánh nghiệp vụ tương ứng.</p></div>}
    {selection.kind !== 'SEQUENCE_FLOW' && <PropertyField label="Tên hiển thị" required={selection.kind !== 'START'} error={elementError()}><input value={selection.name} disabled={disabled} maxLength={160} onChange={(event) => onNodeChange({ name: event.target.value })} /></PropertyField>}
    {!['START', 'SEQUENCE_FLOW'].includes(selection.kind) && <PropertyField label="Step key" required error={elementError('stepKey')}><input value={selection.stepKey} disabled={disabled} maxLength={80} onChange={(event) => onNodeChange({ stepKey: event.target.value.toUpperCase() })} /></PropertyField>}

    {selection.kind === 'START' && <div className="workflow-start-help"><strong>Start Event</strong><p>Workflow phải có đúng một Start Event và đúng một đường nối đi ra.</p></div>}
    {selection.kind === 'APPROVAL' && <ApprovalProperties selection={selection} error={elementError} disabled={disabled} options={flowOptions} referenceData={referenceData} update={onNodeChange} />}
    {selection.kind === 'CONDITION' && <ConditionProperties selection={selection} form={forms.find((form) => form.id === workflow.formDefinitionId)} error={elementError} disabled={disabled} options={flowOptions} update={onNodeChange} />}
    {selection.kind === 'END' && <PropertyField label="Kết quả cuối" required error={elementError('endResult')}><FilterSelect disabled={disabled} ariaLabel="Kết quả kết thúc" value={selection.endResult} options={workflowEndResults.map((value) => ({ value, label: value === 'APPROVED' ? 'Phê duyệt' : 'Từ chối' }))} onChange={(value) => onNodeChange({ endResult: value as 'APPROVED' | 'REJECTED' })} /></PropertyField>}
    {!disabled && selection.kind !== 'SEQUENCE_FLOW' && <button className="secondary-button workflow-delete-element" type="button" onClick={onDeleteNode}>Xóa phần tử</button>}
  </div>
}

function ApprovalProperties({ selection, error, disabled, options, referenceData, update }: {
  selection: BpmnNodeSelection
  error: (suffix?: string) => string | undefined
  disabled: boolean
  options: Array<{ value: string; label: string }>
  referenceData: WorkflowBuilderReferenceData
  update: (patch: BpmnNodePatch) => void
}) {
  const rule = selection.assigneeRule
  const setRule = (patch: Partial<typeof rule>) => update({ assigneeRule: { ...rule, ...patch, includeInactive: false } })
  return <>
    <section className="workflow-property-section"><h3>Phê duyệt</h3>
      <PropertyField label="Chế độ" required error={error('approvalMode')}><FilterSelect disabled={disabled} ariaLabel="Chế độ phê duyệt" value={selection.approvalMode} options={approvalModes.map((mode) => ({ value: mode, label: mode === 'ANY' ? 'Một người duyệt' : mode === 'ALL' ? 'Tất cả cùng duyệt' : 'Đa số duyệt' }))} onChange={(value) => update({ approvalMode: value as BpmnNodeSelection['approvalMode'] })} /></PropertyField>
      <label className="form-builder-toggle"><input type="checkbox" checked={selection.allowSelfApproval} disabled={disabled} onChange={(event) => update({ allowSelfApproval: event.target.checked })} /><span>Cho phép tự phê duyệt</span></label>
      <PropertyField label="Thời hạn xử lý (giờ)"><input type="number" min="1" value={selection.dueInHours ?? ''} disabled={disabled} onChange={(event) => update({ dueInHours: event.target.value ? Number(event.target.value) : undefined })} /></PropertyField>
    </section>
    <section className="workflow-property-section"><h3>Người phê duyệt</h3>
      <PropertyField label="Quy tắc" required error={error('assigneeRule')}><FilterSelect disabled={disabled} ariaLabel="Quy tắc người phê duyệt" value={rule.type} options={assigneeRuleTypes.map((type) => ({ value: type, label: assigneeRuleLabels[type] }))} onChange={(value) => update({ assigneeRule: { type: value as AssigneeRuleType, includeInactive: false } })} /></PropertyField>
      {(rule.type === 'ROLE' || rule.type === 'ROLE_IN_REQUESTER_DEPARTMENT') && <CheckboxCollection label="Vai trò" error={error('roleIds')} items={referenceData.roles.map((item) => ({ id: item.id, label: `${item.name} (${item.key})` }))} selected={rule.roleIds ?? []} disabled={disabled} onChange={(roleIds) => setRule({ roleIds })} />}
      {rule.type === 'POSITION_IN_REQUESTER_DEPARTMENT' && <CheckboxCollection label="Chức danh" error={error('positionIds')} items={referenceData.positions.map((item) => ({ id: item.id, label: `${item.name} (${item.code})` }))} selected={rule.positionIds ?? []} disabled={disabled} onChange={(positionIds) => setRule({ positionIds })} />}
      {rule.type === 'SPECIFIC_USER' && <CheckboxCollection label="Người dùng" error={error('userIds')} items={referenceData.users.map((item) => ({ id: item.id, label: `${item.name} · ${item.email}` }))} selected={rule.userIds ?? []} disabled={disabled} onChange={(userIds) => setRule({ userIds })} />}
    </section>
    <section className="workflow-property-section"><h3>Nhánh xử lý</h3>
      <PropertyField label="Khi duyệt" required error={error('approveFlow')}><FilterSelect disabled={disabled} ariaLabel="Đường nối khi duyệt" value={selection.approveFlow} options={options} onChange={(value) => update({ approveFlow: value })} /></PropertyField>
      <PropertyField label="Khi từ chối" required error={error('rejectFlow')}><FilterSelect disabled={disabled} ariaLabel="Đường nối khi từ chối" value={selection.rejectFlow} options={options} onChange={(value) => update({ rejectFlow: value })} /></PropertyField>
      <PropertyField label="Khi yêu cầu bổ sung"><FilterSelect disabled={disabled} ariaLabel="Đường nối khi yêu cầu bổ sung" value={selection.revisionFlow} options={[{ value: '', label: 'Quay lại bước hiện tại' }, ...options.filter((option) => option.value)]} onChange={(value) => update({ revisionFlow: value })} /></PropertyField>
    </section>
  </>
}

function ConditionProperties({ selection, form, error, disabled, options, update }: {
  selection: BpmnNodeSelection
  form?: FormDefinition
  error: (suffix?: string) => string | undefined
  disabled: boolean
  options: Array<{ value: string; label: string }>
  update: (patch: BpmnNodePatch) => void
}) {
  const field = selection.conditionSource === 'FORM_FIELD' ? form?.fields.find((item) => item.key === selection.conditionFieldKey) : undefined
  const operators = selection.conditionSource === 'FORM_FIELD' ? operatorOptionsForField(field) : ['EQUALS', 'NOT_EQUALS', 'IN'] as const
  return <>
    <section className="workflow-property-section"><h3>Điều kiện</h3>
      <PropertyField label="Nguồn dữ liệu"><FilterSelect disabled={disabled} ariaLabel="Nguồn điều kiện" value={selection.conditionSource} options={workflowConditionSources.map((source) => ({ value: source, label: source === 'FORM_FIELD' ? 'Trường trên Form' : 'Thuộc tính người gửi' }))} onChange={(value) => update({ conditionSource: value as BpmnNodeSelection['conditionSource'], conditionFieldKey: '', conditionOperator: 'EQUALS', conditionValue: '' })} /></PropertyField>
      <PropertyField label={selection.conditionSource === 'FORM_FIELD' ? 'Trường Form' : 'Thuộc tính người gửi'} required error={error('fieldKey')}><FilterSelect disabled={disabled} ariaLabel="Dữ liệu điều kiện" value={selection.conditionFieldKey} options={[{ value: '', label: 'Chọn dữ liệu' }, ...(selection.conditionSource === 'FORM_FIELD' ? (form?.fields ?? []).filter((item) => item.type !== 'FILE').map((item) => ({ value: item.key, label: `${item.label} (${item.key})` })) : requesterAttributes)]} onChange={(value) => update({ conditionFieldKey: value, conditionOperator: 'EQUALS', conditionValue: '' })} /></PropertyField>
      <PropertyField label="Toán tử" required error={error('operator')}><FilterSelect disabled={disabled} ariaLabel="Toán tử điều kiện" value={selection.conditionOperator} options={operators.map((operator) => ({ value: operator, label: ({ EQUALS: 'Bằng', NOT_EQUALS: 'Khác', IN: 'Nằm trong', GREATER_THAN: 'Lớn hơn', LESS_THAN: 'Nhỏ hơn' })[operator] }))} onChange={(value) => update({ conditionOperator: value as BpmnNodeSelection['conditionOperator'], conditionValue: value === 'IN' ? [] : '' })} /></PropertyField>
      <ConditionValue field={field} operator={selection.conditionOperator} value={selection.conditionValue} disabled={disabled} onChange={(conditionValue) => update({ conditionValue })} />
    </section>
    <section className="workflow-property-section"><h3>Nhánh xử lý</h3>
      <PropertyField label="Nhánh Đúng" required error={error('trueFlow')}><FilterSelect disabled={disabled} ariaLabel="Đường nối nhánh đúng" value={selection.trueFlow} options={options} onChange={(value) => update({ trueFlow: value })} /></PropertyField>
      <PropertyField label="Nhánh Sai" required error={error('falseFlow')}><FilterSelect disabled={disabled} ariaLabel="Đường nối nhánh sai" value={selection.falseFlow} options={options} onChange={(value) => update({ falseFlow: value })} /></PropertyField>
    </section>
  </>
}

function ConditionValue({ field, operator, value, disabled, onChange }: { field?: FormField; operator: BpmnNodeSelection['conditionOperator']; value: unknown; disabled: boolean; onChange: (value: unknown) => void }) {
  if (field && ['SELECT', 'RADIO'].includes(field.type) && operator !== 'IN') return <PropertyField label="Giá trị so sánh"><FilterSelect disabled={disabled} ariaLabel="Giá trị điều kiện" value={typeof value === 'string' ? value : ''} options={[{ value: '', label: 'Chọn giá trị' }, ...(field.options ?? []).map((option) => ({ value: option.value, label: option.label }))]} onChange={onChange} /></PropertyField>
  const type = field && ['NUMBER', 'CURRENCY'].includes(field.type) ? 'number' : field?.type === 'DATE' ? 'date' : field?.type === 'DATETIME' ? 'datetime-local' : 'text'
  const inputValue = Array.isArray(value) ? value.join(', ') : typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  return <PropertyField label={operator === 'IN' ? 'Giá trị (phân cách bằng dấu phẩy)' : 'Giá trị so sánh'}><input type={type} value={inputValue} disabled={disabled} onChange={(event) => onChange(operator === 'IN' ? event.target.value.split(',').map((item) => item.trim()).filter(Boolean) : type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} /></PropertyField>
}

function CheckboxCollection({ label, items, selected, disabled, error, onChange }: { label: string; items: Array<{ id: string; label: string }>; selected: readonly string[]; disabled: boolean; error?: string; onChange: (ids: string[]) => void }) {
  return <fieldset className="workflow-checkbox-collection"><legend>{label}</legend><div>{items.length ? items.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={disabled} onChange={() => onChange(selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id])} /><span>{item.label}</span></label>) : <p>Không có dữ liệu phù hợp.</p>}</div>{error && <small className="field-error">{error}</small>}</fieldset>
}

function PropertyField({ label, required = false, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return <label className="form-builder-property-field"><span className={required ? 'required-field-label' : ''}>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}

function selectionKindLabel(kind: BpmnNodeSelection['kind']): string {
  if (kind === 'START') return 'START EVENT'
  if (kind === 'APPROVAL') return 'USER TASK'
  if (kind === 'CONDITION') return 'EXCLUSIVE GATEWAY'
  if (kind === 'END') return 'END EVENT'
  return 'SEQUENCE FLOW'
}
