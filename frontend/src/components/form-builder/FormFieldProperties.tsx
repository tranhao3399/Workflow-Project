import { conditionOperators, formFieldTypes, type ConditionOperator, type FormField, type FormFieldOption, type FormFieldType } from '../../types/workflow'
import type { FormBuilderIssue } from '../../utils/form-builder'
import { issueForPath, normalizeFieldForType } from '../../utils/form-builder'
import { FilterSelect } from '../ui/FilterSelect'

interface FormFieldPropertiesProps {
  field: FormField
  fieldIndex: number
  allFields: readonly FormField[]
  issues: readonly FormBuilderIssue[]
  disabled: boolean
  onChange: (field: FormField) => void
}

const typeLabels: Record<FormFieldType, string> = {
  TEXT: 'Văn bản ngắn', TEXTAREA: 'Văn bản dài', NUMBER: 'Số', CURRENCY: 'Tiền tệ', EMAIL: 'Email', PHONE: 'Điện thoại', DATE: 'Ngày', DATETIME: 'Ngày và giờ', SELECT: 'Danh sách chọn', MULTI_SELECT: 'Chọn nhiều', RADIO: 'Lựa chọn đơn', CHECKBOX: 'Nhóm checkbox', BOOLEAN: 'Có / Không', FILE: 'Tệp đính kèm',
}
const operatorLabels: Record<ConditionOperator, string> = {
  EQUALS: 'Bằng', NOT_EQUALS: 'Khác', IN: 'Nằm trong', GREATER_THAN: 'Lớn hơn', LESS_THAN: 'Nhỏ hơn',
}
const optionTypes = new Set<FormFieldType>(['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX'])
const textTypes = new Set<FormFieldType>(['TEXT', 'TEXTAREA', 'EMAIL', 'PHONE'])
const numberTypes = new Set<FormFieldType>(['NUMBER', 'CURRENCY'])

export function FormFieldProperties({ field, fieldIndex, allFields, issues, disabled, onChange }: FormFieldPropertiesProps) {
  const path = (suffix: string) => `fields.${fieldIndex}.${suffix}`
  const update = <Key extends keyof FormField>(key: Key, value: FormField[Key]) => onChange({ ...field, [key]: value })
  const availableDependencies = allFields.filter((item) => item.key !== field.key)

  function updateValidation(key: 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'errorMessage', value: number | string | undefined) {
    const next = { ...(field.validation ?? {}), [key]: value }
    if (value === undefined || value === '') delete next[key]
    update('validation', Object.keys(next).length ? next : undefined)
  }

  function updateVisibility(next: Partial<NonNullable<FormField['visibilityCondition']>>) {
    const current = field.visibilityCondition ?? { fieldKey: availableDependencies[0]?.key ?? '', operator: 'EQUALS' as const, value: '' }
    update('visibilityCondition', { ...current, ...next })
  }

  return <div className="form-builder-properties-body">
    <PropertyField label="Field key" required error={issueForPath(issues, path('key'))}>
      <input value={field.key} disabled={disabled} maxLength={80} aria-invalid={Boolean(issueForPath(issues, path('key')))} onChange={(event) => update('key', event.target.value)} />
    </PropertyField>
    <PropertyField label="Nhãn hiển thị" required error={issueForPath(issues, path('label'))}>
      <input value={field.label} disabled={disabled} maxLength={160} onChange={(event) => update('label', event.target.value)} />
    </PropertyField>
    <PropertyField label="Loại trường">
      <FilterSelect disabled={disabled} ariaLabel="Loại trường" value={field.type} options={formFieldTypes.map((type) => ({ value: type, label: typeLabels[type] }))} onChange={(value) => onChange(normalizeFieldForType(field, value as FormFieldType))} />
    </PropertyField>
    <label className="form-builder-toggle"><input type="checkbox" checked={field.required} disabled={disabled} onChange={(event) => update('required', event.target.checked)} /><span>Bắt buộc nhập</span></label>
    <PropertyField label="Placeholder"><input value={field.placeholder ?? ''} disabled={disabled} maxLength={300} onChange={(event) => update('placeholder', event.target.value || undefined)} /></PropertyField>
    <PropertyField label="Mô tả hỗ trợ"><textarea value={field.helpText ?? ''} disabled={disabled} maxLength={1000} rows={3} onChange={(event) => update('helpText', event.target.value || undefined)} /></PropertyField>
    <PropertyField label="Độ rộng trên hàng">
      <FilterSelect disabled={disabled} ariaLabel="Độ rộng trường" value={String(readColumnSpan(field))} options={[{ value: '12', label: 'Toàn hàng' }, { value: '6', label: 'Một nửa' }, { value: '4', label: 'Một phần ba' }, { value: '3', label: 'Một phần tư' }]} onChange={(value) => update('layout', { ...(field.layout ?? {}), columnSpan: Number(value) })} />
    </PropertyField>
    <DefaultValueControl field={field} disabled={disabled} onChange={(value) => update('defaultValue', value)} />

    {optionTypes.has(field.type) && <section className="form-builder-property-section">
      <div className="form-builder-property-title"><strong>Lựa chọn</strong><button className="text-action-button" type="button" disabled={disabled} onClick={() => update('options', [...(field.options ?? []), newOption(field.options ?? [])])}>+ Thêm</button></div>
      {issueForPath(issues, path('options')) && <p className="field-error">{issueForPath(issues, path('options'))}</p>}
      <div className="form-builder-option-list">{(field.options ?? []).map((option, optionIndex) => <div className="form-builder-option-row" key={optionIndex}>
        <input aria-label={`Nhãn lựa chọn ${optionIndex + 1}`} placeholder="Nhãn" value={option.label} disabled={disabled} onChange={(event) => updateOption(field, optionIndex, { label: event.target.value }, onChange)} />
        <input aria-label={`Giá trị lựa chọn ${optionIndex + 1}`} placeholder="Giá trị" value={option.value} disabled={disabled} onChange={(event) => updateOption(field, optionIndex, { value: event.target.value }, onChange)} />
        <button className="icon-action danger-icon-action" title="Xóa lựa chọn" aria-label={`Xóa lựa chọn ${optionIndex + 1}`} type="button" disabled={disabled || (field.options?.length ?? 0) <= 1} onClick={() => update('options', (field.options ?? []).filter((_, index) => index !== optionIndex).map((item, index) => ({ ...item, order: (index + 1) * 10 })))}>×</button>
        {(issueForPath(issues, path(`options.${optionIndex}.label`)) || issueForPath(issues, path(`options.${optionIndex}.value`))) && <p className="field-error">{issueForPath(issues, path(`options.${optionIndex}.label`)) ?? issueForPath(issues, path(`options.${optionIndex}.value`))}</p>}
      </div>)}</div>
    </section>}

    {(textTypes.has(field.type) || numberTypes.has(field.type)) && <section className="form-builder-property-section">
      <div className="form-builder-property-title"><strong>Quy tắc kiểm tra</strong></div>
      <div className="form-builder-rule-grid">
        {numberTypes.has(field.type) && <><PropertyField label="Tối thiểu"><input type="number" value={field.validation?.min ?? ''} disabled={disabled} onChange={(event) => updateValidation('min', optionalNumber(event.target.value))} /></PropertyField><PropertyField label="Tối đa" error={issueForPath(issues, path('validation.max'))}><input type="number" value={field.validation?.max ?? ''} disabled={disabled} onChange={(event) => updateValidation('max', optionalNumber(event.target.value))} /></PropertyField></>}
        {textTypes.has(field.type) && <><PropertyField label="Độ dài tối thiểu"><input type="number" min="0" value={field.validation?.minLength ?? ''} disabled={disabled} onChange={(event) => updateValidation('minLength', optionalNumber(event.target.value))} /></PropertyField><PropertyField label="Độ dài tối đa" error={issueForPath(issues, path('validation.maxLength'))}><input type="number" min="0" value={field.validation?.maxLength ?? ''} disabled={disabled} onChange={(event) => updateValidation('maxLength', optionalNumber(event.target.value))} /></PropertyField><PropertyField label="Regex" error={issueForPath(issues, path('validation.pattern'))}><input value={field.validation?.pattern ?? ''} disabled={disabled} maxLength={200} onChange={(event) => updateValidation('pattern', event.target.value || undefined)} /></PropertyField><PropertyField label="Thông báo lỗi"><input value={field.validation?.errorMessage ?? ''} disabled={disabled} maxLength={500} onChange={(event) => updateValidation('errorMessage', event.target.value || undefined)} /></PropertyField></>}
      </div>
    </section>}

    <section className="form-builder-property-section">
      <div className="form-builder-property-title"><strong>Điều kiện hiển thị</strong></div>
      <label className="form-builder-toggle"><input type="checkbox" checked={Boolean(field.visibilityCondition)} disabled={disabled || !availableDependencies.length} onChange={(event) => update('visibilityCondition', event.target.checked ? { fieldKey: availableDependencies[0]?.key ?? '', operator: 'EQUALS', value: '' } : undefined)} /><span>Chỉ hiển thị khi thỏa điều kiện</span></label>
      {field.visibilityCondition && <div className="form-builder-visibility-grid">
        <PropertyField label="Trường tham chiếu" error={issueForPath(issues, path('visibilityCondition.fieldKey'))}><FilterSelect disabled={disabled} ariaLabel="Trường tham chiếu" value={field.visibilityCondition.fieldKey} options={availableDependencies.map((item) => ({ value: item.key, label: item.label || item.key }))} onChange={(value) => updateVisibility({ fieldKey: value })} /></PropertyField>
        <PropertyField label="Điều kiện"><FilterSelect disabled={disabled} ariaLabel="Điều kiện hiển thị" value={field.visibilityCondition.operator} options={conditionOperators.map((operator) => ({ value: operator, label: operatorLabels[operator] }))} onChange={(value) => updateVisibility({ operator: value as ConditionOperator, value: value === 'IN' ? [] : '' })} /></PropertyField>
        <PropertyField label={field.visibilityCondition.operator === 'IN' ? 'Giá trị (phân cách bằng dấu phẩy)' : 'Giá trị'} error={issueForPath(issues, path('visibilityCondition.value'))}><input value={conditionInputValue(field.visibilityCondition.value)} disabled={disabled} onChange={(event) => updateVisibility({ value: field.visibilityCondition?.operator === 'IN' ? event.target.value.split(',').map((item) => item.trim()).filter(Boolean) : event.target.value })} /></PropertyField>
      </div>}
    </section>

    {field.type === 'FILE' && field.fileConfig && <section className="form-builder-property-section">
      <div className="form-builder-property-title"><strong>Tệp đính kèm</strong></div>
      <label className="form-builder-toggle"><input type="checkbox" checked={field.fileConfig.multiple} disabled={disabled} onChange={(event) => update('fileConfig', { ...field.fileConfig!, multiple: event.target.checked, maxFiles: event.target.checked ? Math.max(2, field.fileConfig!.maxFiles) : 1 })} /><span>Cho phép nhiều tệp</span></label>
      <PropertyField label="MIME types" error={issueForPath(issues, path('fileConfig.allowedMimeTypes'))}><input value={field.fileConfig.allowedMimeTypes.join(', ')} disabled={disabled} onChange={(event) => update('fileConfig', { ...field.fileConfig!, allowedMimeTypes: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></PropertyField>
      <div className="form-builder-rule-grid">
        <PropertyField label="Dung lượng tối đa (MB)" error={issueForPath(issues, path('fileConfig.maxFileSizeBytes'))}><input type="number" min="1" value={Math.max(1, Math.round(field.fileConfig.maxFileSizeBytes / 1024 / 1024))} disabled={disabled} onChange={(event) => update('fileConfig', { ...field.fileConfig!, maxFileSizeBytes: Math.max(1, Number(event.target.value)) * 1024 * 1024 })} /></PropertyField>
        <PropertyField label="Số tệp tối đa" error={issueForPath(issues, path('fileConfig.maxFiles'))}><input type="number" min="1" max="100" value={field.fileConfig.maxFiles} disabled={disabled || !field.fileConfig.multiple} onChange={(event) => update('fileConfig', { ...field.fileConfig!, maxFiles: Number(event.target.value) })} /></PropertyField>
      </div>
    </section>}
  </div>
}

function PropertyField({ label, required = false, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return <label className="form-builder-property-field"><span className={required ? 'required-field-label' : ''}>{label}</span>{children}{error && <small className="field-error">{error}</small>}</label>
}

function DefaultValueControl({ field, disabled, onChange }: { field: FormField; disabled: boolean; onChange: (value: unknown) => void }) {
  if (field.type === 'FILE') return null
  if (field.type === 'BOOLEAN') return <PropertyField label="Giá trị mặc định"><FilterSelect disabled={disabled} ariaLabel="Giá trị mặc định" value={field.defaultValue === true ? 'true' : field.defaultValue === false ? 'false' : ''} options={[{ value: '', label: 'Không đặt' }, { value: 'true', label: 'Có' }, { value: 'false', label: 'Không' }]} onChange={(value) => onChange(value === '' ? undefined : value === 'true')} /></PropertyField>
  if (field.type === 'SELECT' || field.type === 'RADIO') return <PropertyField label="Giá trị mặc định"><FilterSelect disabled={disabled} ariaLabel="Giá trị mặc định" value={typeof field.defaultValue === 'string' ? field.defaultValue : ''} options={[{ value: '', label: 'Không đặt' }, ...(field.options ?? []).map((option) => ({ value: option.value, label: option.label || option.value }))]} onChange={(value) => onChange(value || undefined)} /></PropertyField>
  if (field.type === 'MULTI_SELECT' || field.type === 'CHECKBOX') return <fieldset className="form-builder-default-options"><legend>Giá trị mặc định</legend>{(field.options ?? []).map((option) => { const selected = Array.isArray(field.defaultValue) && field.defaultValue.includes(option.value); return <label key={option.value}><input type="checkbox" disabled={disabled} checked={selected} onChange={() => { const values = Array.isArray(field.defaultValue) ? field.defaultValue.filter((value): value is string => typeof value === 'string') : []; onChange(selected ? values.filter((value) => value !== option.value) : [...values, option.value]) }} /><span>{option.label || option.value}</span></label> })}</fieldset>
  const inputType = field.type === 'NUMBER' || field.type === 'CURRENCY' ? 'number' : field.type === 'DATE' ? 'date' : field.type === 'DATETIME' ? 'datetime-local' : field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : 'text'
  return <PropertyField label="Giá trị mặc định"><input type={inputType} value={typeof field.defaultValue === 'string' || typeof field.defaultValue === 'number' ? String(field.defaultValue) : ''} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? undefined : inputType === 'number' ? Number(event.target.value) : event.target.value)} /></PropertyField>
}

function newOption(options: readonly FormFieldOption[]): FormFieldOption {
  const existing = new Set(options.map((option) => option.value))
  let index = options.length + 1
  while (existing.has(`OPTION_${index}`)) index += 1
  return { value: `OPTION_${index}`, label: `Lựa chọn ${index}`, order: (options.length + 1) * 10, isActive: true }
}

function updateOption(field: FormField, index: number, patch: Partial<FormFieldOption>, onChange: (field: FormField) => void) {
  onChange({ ...field, options: (field.options ?? []).map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) })
}

function optionalNumber(value: string): number | undefined { return value === '' ? undefined : Number(value) }
function readColumnSpan(field: FormField): number { const value = field.layout?.columnSpan; return typeof value === 'number' && [3, 4, 6, 12].includes(value) ? value : 12 }
function conditionInputValue(value: unknown): string { return Array.isArray(value) ? value.join(', ') : typeof value === 'string' || typeof value === 'number' ? String(value) : '' }
