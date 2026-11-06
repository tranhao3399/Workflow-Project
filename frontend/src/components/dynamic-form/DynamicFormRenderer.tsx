import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from 'react'
import {
  createFilePreviewUrl,
  deleteFile,
  downloadFile,
  getFileMetadata,
  revokeFilePreviewUrl,
  uploadRequestFile,
} from '../../services/files.service'
import type {
  DynamicFormValidationResult,
  FileMetadata,
  FormDefinition,
  FormDefinitionSnapshot,
  FormAutoFillSource,
  FormField,
} from '../../types/workflow'
import { formatFormDateValue } from '../../utils/formatters'
import {
  activeFieldOptions,
  dynamicFieldError,
  dynamicFieldVisibility,
  dynamicFileIds,
  humanFileSize,
  initialDynamicFormValues,
  supportedFormFields,
  validateDynamicFormData,
} from '../../utils/dynamic-form'
import { autoFillFieldPlaceholder, defaultFieldPlaceholder } from '../../utils/form-builder'
import { DatePicker } from '../ui/DatePicker'
import { FilterSelect } from '../ui/FilterSelect'

export type DynamicFormMode = 'edit' | 'readonly' | 'preview'

export interface DynamicFormRendererHandle {
  getValues: () => Record<string, unknown>
  validate: () => DynamicFormValidationResult
  focusFirstError: () => void
}

export interface DynamicFormRendererProps {
  formDefinition?: FormDefinition | null
  formSnapshot?: FormDefinitionSnapshot | null
  initialValues?: Record<string, unknown>
  systemAutoFillValues?: Partial<Record<FormAutoFillSource, unknown>>
  mode: DynamicFormMode
  requestId?: string
  allowFileDelete?: boolean
  isLoading?: boolean
  loadError?: string
  onRetry?: () => void
  onChange?: (values: Record<string, unknown>) => void
  onValidationChange?: (validation: DynamicFormValidationResult) => void
}

interface TouchedState {
  sourceKey: string
  fields: Record<string, boolean>
}

interface ValueState {
  sourceKey: string
  values: Record<string, unknown>
}

const emptyValues: Record<string, unknown> = {}
const emptySystemAutoFillValues: Partial<Record<FormAutoFillSource, unknown>> = {}
const emptyTouched: Record<string, boolean> = {}

export const DynamicFormRenderer = forwardRef<DynamicFormRendererHandle, DynamicFormRendererProps>(function DynamicFormRenderer({
  formDefinition,
  formSnapshot,
  initialValues = emptyValues,
  systemAutoFillValues = emptySystemAutoFillValues,
  mode,
  requestId,
  allowFileDelete = false,
  isLoading = false,
  loadError,
  onRetry,
  onChange,
  onValidationChange,
}, ref) {
  const source = formDefinition ?? formSnapshot
  const fields = useMemo(() => supportedFormFields(source?.fields ?? []), [source])
  const initialFingerprint = JSON.stringify(initialValues)
  const sourceKey = `${source?.id ?? 'empty'}:${source?.version ?? 0}:${initialFingerprint}`
  const seededValues = useMemo(
    () => initialDynamicFormValues(fields, initialValues),
    [fields, initialValues],
  )
  const [valueState, setValueState] = useState<ValueState>(() => ({ sourceKey, values: seededValues }))
  const [touchedState, setTouchedState] = useState<TouchedState>(() => ({ sourceKey, fields: {} }))
  const values = valueState.sourceKey === sourceKey ? valueState.values : seededValues
  const displayValues = useMemo(() => {
    const next = { ...values }
    for (const field of fields) {
      const source = field.autoFill?.source
      if (!source || systemAutoFillValues[source] === undefined) continue
      next[field.key] = systemAutoFillValues[source]
    }
    return next
  }, [fields, systemAutoFillValues, values])
  const touched = touchedState.sourceKey === sourceKey ? touchedState.fields : emptyTouched
  const visibility = useMemo(() => dynamicFieldVisibility(fields, displayValues), [displayValues, fields])
  const validation = useMemo(() => validateDynamicFormData(fields, displayValues), [displayValues, fields])
  const interactive = mode !== 'readonly'

  useEffect(() => {
    onValidationChange?.(validation)
  }, [onValidationChange, validation])

  function updateValue(fieldKey: string, value: unknown) {
    const nextValues = { ...values }
    if (value === undefined || value === '') delete nextValues[fieldKey]
    else nextValues[fieldKey] = value
    setValueState({ sourceKey, values: nextValues })
    onChange?.(nextValues)
  }

  function touch(fieldKey: string) {
    setTouchedState({ sourceKey, fields: { ...touched, [fieldKey]: true } })
  }

  const focusError = useCallback((result: DynamicFormValidationResult) => {
    const firstVisibleError = result.errors.find((error) => visibility.get(rootFieldKey(error.fieldKey)) !== false)
    if (!firstVisibleError) return
    window.requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(`[data-dynamic-field="${rootFieldKey(firstVisibleError.fieldKey)}"]`)
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      field?.querySelector<HTMLElement>('input, textarea, button, select, [tabindex]:not([tabindex="-1"])')?.focus()
    })
  }, [visibility])

  useImperativeHandle(ref, () => ({
    getValues: () => ({ ...values }),
    validate: () => {
      const nextTouched = Object.fromEntries(
        validation.errors
          .filter((error) => visibility.get(rootFieldKey(error.fieldKey)) !== false)
          .map((error) => [rootFieldKey(error.fieldKey), true]),
      )
      setTouchedState({ sourceKey, fields: { ...touched, ...nextTouched } })
      focusError(validation)
      return validation
    },
    focusFirstError: () => focusError(validation),
  }), [focusError, sourceKey, touched, validation, values, visibility])

  if (isLoading) return <DynamicFormLoading />
  if (loadError) return <DynamicFormError message={loadError} onRetry={onRetry} />
  if (!source || fields.length === 0) return <DynamicFormEmpty />

  return (
    <section className={`dynamic-form-renderer dynamic-form-${mode}`} aria-label={source.name}>
      {(formDefinition?.description || source.settings.instructions) && (
        <header className="dynamic-form-introduction">
          {formDefinition?.description && <p>{formDefinition.description}</p>}
          {source.settings.instructions && <p>{source.settings.instructions}</p>}
        </header>
      )}
      <div className="dynamic-form-grid">
        {fields.map((field) => {
          if (visibility.get(field.key) === false) return null
          const error = interactive && touched[field.key] ? dynamicFieldError(validation, field.key) : undefined
          const span = layoutSpan(field)
          const startsNewRow = field.layout?.newRow === true && span < 12
          const style = { gridColumn: startsNewRow ? `1 / span ${span}` : `span ${span}` } satisfies CSSProperties
          if (field.type === 'SECTION') {
            return (
              <section
                className="dynamic-form-section"
                data-dynamic-field={field.key}
                key={field.key}
                style={style}
              >
                <h3>{field.label}</h3>
                {field.helpText && <p>{field.helpText}</p>}
              </section>
            )
          }
          const fieldValue = displayValues[field.key]
          const isAutoFillLocked = Boolean(
            field.autoFill?.readOnly && (mode === 'preview' || stringValue(fieldValue) !== ''),
          )
          return (
            <div
              className={`dynamic-form-field dynamic-form-field-${field.type.toLowerCase()}${error ? ' has-error' : ''}`}
              data-dynamic-field={field.key}
              key={field.key}
              style={style}
            >
              <div className="dynamic-form-label-row">
                <span className={field.required ? 'required-field-label' : undefined}>{field.label}</span>
                {field.autoFill && (
                  <small className="dynamic-autofill-badge">
                    {field.autoFill.readOnly ? 'Tự động điền · Khóa sửa' : 'Tự động điền'}
                  </small>
                )}
              </div>
              {mode === 'readonly'
                ? <ReadonlyField field={field} value={fieldValue} requestId={requestId} />
                : <EditableField
                    field={field}
                    value={fieldValue}
                    mode={mode}
                    locked={isAutoFillLocked}
                    requestId={requestId}
                    allowFileDelete={allowFileDelete}
                    errorId={error ? `${field.key}-error` : undefined}
                    onChange={(value) => updateValue(field.key, value)}
                    onBlur={() => touch(field.key)}
                  />}
              {field.helpText && <small className="dynamic-form-help">{field.helpText}</small>}
              {error && <small className="dynamic-form-error" id={`${field.key}-error`} role="alert">{error.message}</small>}
            </div>
          )
        })}
      </div>
    </section>
  )
})

interface EditableFieldProps {
  field: FormField
  value: unknown
  mode: DynamicFormMode
  locked?: boolean
  requestId?: string
  allowFileDelete: boolean
  errorId?: string
  onChange: (value: unknown) => void
  onBlur: () => void
}

function EditableField({ field, value, mode, locked = false, requestId, allowFileDelete, errorId, onChange, onBlur }: EditableFieldProps) {
  const effectivePlaceholder = field.autoFill
    ? autoFillFieldPlaceholder
    : defaultFieldPlaceholder(field.type)
  const common = {
    'aria-label': field.label,
    'aria-required': field.required,
    'aria-invalid': Boolean(errorId),
    'aria-describedby': errorId,
    placeholder: effectivePlaceholder,
    readOnly: locked,
    className: locked ? 'is-autofill-locked' : undefined,
    onBlur,
  }
  if (field.type === 'TEXTAREA') {
    return <textarea {...common} rows={4} value={stringValue(value)} onChange={(event) => { if (!locked) onChange(event.target.value) }} />
  }
  if (field.type === 'PHONE') {
    return <input {...common} type="tel" inputMode="tel" maxLength={16} value={stringValue(value)} onChange={(event) => { if (!locked) onChange(sanitizePhoneInput(event.target.value)) }} />
  }
  if (field.type === 'TEXT' || field.type === 'EMAIL') {
    const type = field.type === 'EMAIL' ? 'email' : 'text'
    return <input {...common} type={type} value={stringValue(value)} onChange={(event) => { if (!locked) onChange(event.target.value) }} />
  }
  if (field.type === 'CURRENCY') {
    return <CurrencyInput ariaLabel={field.label} ariaDescribedBy={errorId} ariaInvalid={Boolean(errorId)} placeholder={effectivePlaceholder} value={value} locked={locked} onChange={onChange} onBlur={onBlur} />
  }
  if (field.type === 'NUMBER') {
    return <LocalizedNumberInput ariaLabel={field.label} ariaDescribedBy={errorId} ariaInvalid={Boolean(errorId)} placeholder={effectivePlaceholder} value={value} locked={locked} onChange={onChange} onBlur={onBlur} />
  }
  if (field.type === 'DATE') {
    return <DatePicker value={stringValue(value) || undefined} ariaLabel={field.label} ariaDescribedBy={errorId} ariaInvalid={Boolean(errorId)} placeholder={effectivePlaceholder} disabled={locked} onChange={(nextValue) => { if (!locked) onChange(nextValue); onBlur() }} />
  }
  if (field.type === 'DATETIME') {
    return <DateTimeInput value={value} placeholder={effectivePlaceholder} ariaLabel={field.label} ariaDescribedBy={errorId} ariaInvalid={Boolean(errorId)} locked={locked} onChange={onChange} onBlur={onBlur} />
  }
  if (field.type === 'SELECT') {
    return <FilterSelect ariaLabel={field.label} value={stringValue(value)} options={[{ value: '', label: effectivePlaceholder || 'Chọn một giá trị' }, ...activeFieldOptions(field)]} onChange={(nextValue) => { onChange(nextValue || undefined); onBlur() }} />
  }
  if (field.type === 'RADIO') {
    return <OptionGroup field={field} value={value} kind="radio" errorId={errorId} onChange={onChange} onBlur={onBlur} />
  }
  if (field.type === 'MULTI_SELECT') {
    return <MultiSelectControl field={field} value={value} errorId={errorId} onChange={onChange} onBlur={onBlur} />
  }
  if (field.type === 'CHECKBOX') {
    return <OptionGroup field={field} value={value} kind="checkbox" errorId={errorId} onChange={onChange} onBlur={onBlur} />
  }
  if (field.type === 'BOOLEAN') {
    return <label className="dynamic-boolean-control"><input type="checkbox" checked={value === true} aria-label={field.label} aria-required={field.required} aria-invalid={Boolean(errorId)} aria-describedby={errorId} onChange={(event) => onChange(event.target.checked)} onBlur={onBlur} /><i aria-hidden="true"><span /></i><b>{value === true ? 'Có' : 'Không'}</b></label>
  }
  if (field.type === 'TABLE') {
    return <EditableTableField field={field} value={value} errorId={errorId} onChange={onChange} onBlur={onBlur} />
  }
  return <DynamicFileField field={field} value={value} mode={mode} requestId={requestId} allowDelete={allowFileDelete} errorId={errorId} onChange={onChange} onBlur={onBlur} />
}

function EditableTableField({ field, value, errorId, onChange, onBlur }: Pick<EditableFieldProps, 'field' | 'value' | 'errorId' | 'onChange' | 'onBlur'>) {
  const config = field.tableConfig
  if (!config) return <p className="dynamic-form-error">Cấu hình bảng không hợp lệ.</p>
  const rows = tableRows(value)
  const columns = config.columns.toSorted((left, right) => left.order - right.order)
  const updateCell = (rowIndex: number, columnKey: string, cellValue: unknown) => {
    onChange(rows.map((row, index) => index === rowIndex ? { ...row, [columnKey]: cellValue } : row))
  }
  const addRow = () => {
    if (rows.length >= config.maxRows) return
    onChange([...rows, Object.fromEntries(columns.map((column) => [column.key, column.type === 'BOOLEAN' ? false : undefined]))])
    onBlur()
  }
  const removeRow = (rowIndex: number) => {
    if (rows.length <= config.minRows) return
    onChange(rows.filter((_, index) => index !== rowIndex))
    onBlur()
  }
  return <div className="dynamic-table-field" aria-describedby={errorId}>
    <div className="dynamic-table-scroll"><table><thead><tr><th className="dynamic-table-index">#</th>{columns.map((column) => <th key={column.key} className={column.required ? 'required-field-label' : undefined}>{column.label}</th>)}{config.allowRemoveRows && <th className="dynamic-table-action">Thao tác</th>}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><td className="dynamic-table-index">{rowIndex + 1}</td>{columns.map((column) => <td key={column.key}><TableCell column={column} value={row[column.key]} onChange={(cellValue) => updateCell(rowIndex, column.key, cellValue)} onBlur={onBlur} /></td>)}{config.allowRemoveRows && <td className="dynamic-table-action"><button type="button" className="text-action-button is-danger" disabled={rows.length <= config.minRows} onClick={() => removeRow(rowIndex)}>Xóa</button></td>}</tr>)}</tbody></table></div>
    {rows.length === 0 && <p className="dynamic-table-empty">Chưa có dòng dữ liệu.</p>}
    {config.allowAddRows && <button type="button" className="secondary-button dynamic-table-add" disabled={rows.length >= config.maxRows} onClick={addRow}>+ Thêm dòng</button>}
    <small className="dynamic-table-limit">{rows.length}/{config.maxRows} dòng</small>
  </div>
}

function TableCell({ column, value, onChange, onBlur }: { column: NonNullable<FormField['tableConfig']>['columns'][number]; value: unknown; onChange: (value: unknown) => void; onBlur: () => void }) {
  const label = column.label
  const placeholder = defaultFieldPlaceholder(column.type)
  if (column.type === 'CURRENCY') return <CurrencyInput ariaLabel={label} placeholder={placeholder} value={value} onChange={onChange} onBlur={onBlur} />
  if (column.type === 'NUMBER') return <LocalizedNumberInput ariaLabel={label} placeholder={placeholder} value={value} onChange={onChange} onBlur={onBlur} />
  if (column.type === 'DATE') return <DatePicker ariaLabel={label} placeholder={placeholder} value={stringValue(value) || undefined} onChange={(nextValue) => { onChange(nextValue); onBlur() }} />
  if (column.type === 'SELECT') return <FilterSelect ariaLabel={label} value={stringValue(value)} options={[{ value: '', label: placeholder || 'Chọn một giá trị' }, ...(column.options ?? []).filter((option) => option.isActive !== false).toSorted((left, right) => left.order - right.order).map((option) => ({ value: option.value, label: option.label }))]} onChange={(nextValue) => { onChange(nextValue || undefined); onBlur() }} />
  if (column.type === 'BOOLEAN') return <label className="dynamic-table-boolean"><input aria-label={label} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} onBlur={onBlur} /><span>{value === true ? 'Có' : 'Không'}</span></label>
  return <input aria-label={label} type="text" value={stringValue(value)} placeholder={placeholder} minLength={column.validation?.minLength} maxLength={column.validation?.maxLength} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
}

interface OptionGroupProps {
  field: FormField
  value: unknown
  kind: 'radio' | 'checkbox'
  errorId?: string
  onChange: (value: unknown) => void
  onBlur: () => void
}

function OptionGroup({ field, value, kind, errorId, onChange, onBlur }: OptionGroupProps) {
  const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  return (
    <div className="dynamic-option-group" role={kind === 'radio' ? 'radiogroup' : 'group'} aria-label={field.label} aria-required={field.required} aria-invalid={Boolean(errorId)} aria-describedby={errorId}>
      {activeFieldOptions(field).map((option) => {
        const checked = kind === 'radio' ? value === option.value : selected.includes(option.value)
        return <label className="dynamic-option" key={option.value}><input type={kind} name={kind === 'radio' ? field.key : undefined} checked={checked} value={option.value} onChange={() => {
          if (kind === 'radio') onChange(option.value)
          else onChange(checked ? selected.filter((item) => item !== option.value) : [...selected, option.value])
        }} onBlur={onBlur} /><span>{option.label}</span></label>
      })}
    </div>
  )
}

function MultiSelectControl({ field, value, errorId, onChange, onBlur }: Omit<OptionGroupProps, 'kind'>) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
  const options = activeFieldOptions(field)

  useEffect(() => {
    if (!isOpen) return
    const close = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setIsOpen(false)
      onBlur()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [isOpen, onBlur])

  return (
    <div className={isOpen ? 'dynamic-multi-select is-open' : 'dynamic-multi-select'} ref={rootRef}>
      <button type="button" className="dynamic-multi-select-trigger" aria-label={field.label} aria-expanded={isOpen} aria-invalid={Boolean(errorId)} aria-describedby={errorId} onClick={() => setIsOpen((current) => !current)}>
        <span className={selected.length ? 'dynamic-multi-select-values' : 'dynamic-multi-select-placeholder'}>
          {selected.length
            ? selected.map((item) => <em key={item}>{optionLabel(field, item)}</em>)
            : defaultFieldPlaceholder('MULTI_SELECT')}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {isOpen && (
        <div className="dynamic-multi-select-menu" role="group" aria-label={field.label}>
          {options.map((option) => {
            const checked = selected.includes(option.value)
            return (
              <label key={option.value}>
                <input type="checkbox" checked={checked} onChange={() => onChange(checked ? selected.filter((item) => item !== option.value) : [...selected, option.value])} />
                <span>{option.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ReadonlyField({ field, value, requestId }: { field: FormField; value: unknown; requestId?: string }) {
  if (field.type === 'FILE') return <DynamicFileField field={field} value={value} mode="readonly" requestId={requestId} allowDelete={false} onChange={() => undefined} onBlur={() => undefined} />
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return <p className="dynamic-readonly-value is-empty">Chưa cập nhật</p>
  if (field.type === 'TABLE') return <ReadonlyTableField field={field} value={value} />
  if (field.type === 'SELECT' || field.type === 'RADIO') return <p className="dynamic-readonly-value">{optionLabel(field, value)}</p>
  if (field.type === 'MULTI_SELECT' || field.type === 'CHECKBOX') {
    return <div className="dynamic-readonly-options">{(Array.isArray(value) ? value : []).map((item) => <span key={String(item)}>{optionLabel(field, item)}</span>)}</div>
  }
  if (field.type === 'BOOLEAN') return <p className="dynamic-readonly-value">{value === true ? 'Có' : 'Không'}</p>
  if (field.type === 'NUMBER') return <p className="dynamic-readonly-value">{typeof value === 'number' ? formatLocalizedNumber(value) : String(value)}</p>
  if (field.type === 'CURRENCY') return <p className="dynamic-readonly-value">{typeof value === 'number' ? `${formatLocalizedCurrency(value)} VNĐ` : String(value)}</p>
  if (field.type === 'DATE' || field.type === 'DATETIME') return <p className="dynamic-readonly-value">{formatFormDateValue(value, field.type === 'DATETIME')}</p>
  return <p className="dynamic-readonly-value preserve-lines">{String(value)}</p>
}

function ReadonlyTableField({ field, value }: { field: FormField; value: unknown }) {
  const rows = tableRows(value)
  const columns = field.tableConfig?.columns.toSorted((left, right) => left.order - right.order) ?? []
  return <div className="dynamic-table-field is-readonly"><div className="dynamic-table-scroll"><table><thead><tr><th className="dynamic-table-index">#</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><td className="dynamic-table-index">{rowIndex + 1}</td>{columns.map((column) => <td key={column.key}>{formatTableCell(column, row[column.key])}</td>)}</tr>)}</tbody></table></div></div>
}

function formatTableCell(column: NonNullable<FormField['tableConfig']>['columns'][number], value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (column.type === 'BOOLEAN') return value === true ? 'Có' : 'Không'
  if (column.type === 'SELECT') return column.options?.find((option) => option.value === value)?.label ?? String(value)
  if (column.type === 'NUMBER') return typeof value === 'number' ? formatLocalizedNumber(value) : String(value)
  if (column.type === 'CURRENCY') return typeof value === 'number' ? `${formatLocalizedCurrency(value)} VNĐ` : String(value)
  if (column.type === 'DATE') return formatFormDateValue(value, false)
  return String(value)
}

function tableRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && !Array.isArray(row)) : []
}

function CurrencyInput({
  value,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid = false,
  placeholder,
  locked = false,
  onChange,
  onBlur,
}: {
  value: unknown
  ariaLabel: string
  ariaDescribedBy?: string
  ariaInvalid?: boolean
  placeholder?: string
  locked?: boolean
  onChange: (value: unknown) => void
  onBlur: () => void
}) {
  const formattedValue = typeof value === 'number' && Number.isFinite(value)
    ? formatLocalizedCurrency(value)
    : ''
  return (
    <span className={locked ? 'dynamic-currency-control is-locked' : 'dynamic-currency-control'}>
      <input
        className="dynamic-currency-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={formattedValue}
        placeholder={placeholder}
        readOnly={locked}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        onChange={(event) => {
          if (locked) return
          const digits = event.target.value.replace(/\D/g, '').slice(0, 15)
          onChange(digits ? Number(digits) : undefined)
        }}
        onBlur={onBlur}
      />
      <span aria-hidden="true">VNĐ</span>
    </span>
  )
}

function DateTimeInput({
  value,
  placeholder,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid = false,
  locked = false,
  onChange,
  onBlur,
}: {
  value: unknown
  placeholder?: string
  ariaLabel: string
  ariaDescribedBy?: string
  ariaInvalid?: boolean
  locked?: boolean
  onChange: (value: unknown) => void
  onBlur: () => void
}) {
  const currentValue = stringValue(value)
  const parts = dateTimeParts(currentValue)

  return (
    <div className={locked ? 'dynamic-datetime-control is-autofill-locked' : 'dynamic-datetime-control'}>
      <DatePicker
        value={parts.date}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        ariaDescribedBy={ariaDescribedBy}
        ariaInvalid={ariaInvalid}
        disabled={locked}
        onChange={(nextDate) => {
          if (locked) return
          onChange(nextDate ? `${nextDate}T${parts.time || '00:00'}` : undefined)
          onBlur()
        }}
      />
      <input
        className="dynamic-datetime-time"
        type="time"
        value={parts.time}
        disabled={locked || !parts.date}
        aria-label={`${ariaLabel} - giờ`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        onChange={(event) => {
          if (locked || !parts.date) return
          onChange(`${parts.date}T${event.target.value || '00:00'}`)
        }}
        onBlur={onBlur}
      />
    </div>
  )
}

function dateTimeParts(value: string): { date?: string; time: string } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value)
  return match ? { date: match[1], time: `${match[2]}:${match[3]}` } : { time: '' }
}

function sanitizePhoneInput(value: string): string {
  const international = value.trimStart().startsWith('+')
  const digits = value.replace(/\D/g, '').slice(0, 15)
  return `${international ? '+' : ''}${digits}`
}

function LocalizedNumberInput({
  value,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid = false,
  placeholder,
  locked = false,
  onChange,
  onBlur,
}: {
  value: unknown
  ariaLabel: string
  ariaDescribedBy?: string
  ariaInvalid?: boolean
  placeholder?: string
  locked?: boolean
  onChange: (value: unknown) => void
  onBlur: () => void
}) {
  const initialValue = typeof value === 'number' && Number.isFinite(value) ? value : undefined
  const [editState, setEditState] = useState<{
    sourceValue?: number
    draft: string
    focused: boolean
  }>(() => ({ sourceValue: initialValue, draft: initialValue === undefined ? '' : formatLocalizedNumber(initialValue), focused: false }))
  const state = Object.is(editState.sourceValue, initialValue)
    ? editState
    : { sourceValue: initialValue, draft: initialValue === undefined ? '' : formatLocalizedNumber(initialValue), focused: false }

  return (
    <input
      className={locked ? 'dynamic-number-input is-autofill-locked' : 'dynamic-number-input'}
      type="text"
      inputMode="decimal"
      pattern="[0-9]*([.,][0-9]*)?"
      value={state.draft}
      placeholder={placeholder}
      readOnly={locked}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      onFocus={() => {
        if (locked) return
        setEditState({ sourceValue: initialValue, draft: initialValue === undefined ? '' : String(initialValue), focused: true })
      }}
      onChange={(event) => {
        if (locked) return
        const draft = sanitizeDecimalDraft(event.target.value)
        if (!draft) {
          setEditState({ sourceValue: undefined, draft: '', focused: true })
          onChange(undefined)
          return
        }
        const parsed = Number(draft.replace(',', '.'))
        if (!Number.isFinite(parsed) || parsed < 0) return
        setEditState({ sourceValue: parsed, draft, focused: true })
        onChange(parsed)
      }}
      onBlur={() => {
        const parsed = state.draft ? Number(state.draft.replace(',', '.')) : undefined
        const nextValue = parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
        setEditState({ sourceValue: nextValue, draft: nextValue === undefined ? '' : formatLocalizedNumber(nextValue), focused: false })
        onChange(nextValue)
        onBlur()
      }}
    />
  )
}

function sanitizeDecimalDraft(value: string): string {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '')
  const decimalIndex = normalized.indexOf('.')
  if (decimalIndex < 0) return normalized.slice(0, 15)
  const whole = normalized.slice(0, decimalIndex).slice(0, 15) || '0'
  const fraction = normalized.slice(decimalIndex + 1).replace(/\./g, '').slice(0, 6)
  return `${whole}.${fraction}`
}

function formatLocalizedNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(value)
}

function formatLocalizedCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)
}

function rootFieldKey(fieldKey: string): string {
  return fieldKey.split('.')[0] ?? fieldKey
}

interface DynamicFileFieldProps {
  field: FormField
  value: unknown
  mode: DynamicFormMode
  requestId?: string
  allowDelete: boolean
  errorId?: string
  onChange: (value: unknown) => void
  onBlur: () => void
}

function DynamicFileField({ field, value, mode, requestId, allowDelete, errorId, onChange, onBlur }: DynamicFileFieldProps) {
  const fileIds = dynamicFileIds(value)
  const config = field.fileConfig ?? { multiple: true, allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'], maxFileSizeBytes: 10 * 1024 * 1024, maxFiles: 5 }
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, FileMetadata>>({})
  const [uploadState, setUploadState] = useState<{ fileName: string; progress: number } | null>(null)
  const [uploadError, setUploadError] = useState('')
  const canUpload = mode === 'edit' && Boolean(requestId) && fileIds.length < config.maxFiles

  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    onBlur()
    if (!requestId || selected.length === 0) return
    if (fileIds.length + selected.length > config.maxFiles) {
      setUploadError(`Chỉ được tải tối đa ${config.maxFiles} tệp.`)
      return
    }
    const allowedMimeTypes = config.allowedMimeTypes.map(normalizeMimeType)
    const invalidType = selected.find((file) => !allowedMimeTypes.includes(normalizeMimeType(file.type)))
    if (invalidType) {
      setUploadError(`Tệp ${invalidType.name} không đúng định dạng được cho phép.`)
      return
    }
    const oversized = selected.find((file) => file.size > config.maxFileSizeBytes)
    if (oversized) {
      setUploadError(`Tệp ${oversized.name} vượt quá ${humanFileSize(config.maxFileSizeBytes)}.`)
      return
    }

    setUploadError('')
    const nextIds = [...fileIds]
    try {
      for (const [index, file] of selected.entries()) {
        setUploadState({ fileName: file.name, progress: Math.round((index / selected.length) * 100) })
        const metadata = await uploadRequestFile(requestId, file, field.key, (fileProgress) => {
          setUploadState({ fileName: file.name, progress: Math.round(((index + fileProgress / 100) / selected.length) * 100) })
        })
        nextIds.push(metadata.id)
        setUploadedFiles((current) => ({ ...current, [metadata.id]: metadata }))
        onChange(config.multiple ? [...nextIds] : metadata.id)
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Không thể tải tệp lên. Vui lòng thử lại.')
    } finally {
      setUploadState(null)
    }
  }

  function removeValue(fileId: string) {
    const nextIds = fileIds.filter((id) => id !== fileId)
    onChange(config.multiple ? nextIds : undefined)
  }

  return (
    <div className="dynamic-file-field" aria-describedby={errorId}>
      {fileIds.length > 0 && <div className="dynamic-file-list">{fileIds.map((fileId) => (
        <DynamicFileItem
          fileId={fileId}
          initialMetadata={uploadedFiles[fileId]}
          canDelete={mode === 'edit' && allowDelete && Boolean(requestId)}
          key={fileId}
          onDeleted={() => removeValue(fileId)}
        />
      ))}</div>}
      {mode !== 'readonly' && (
        <div className="dynamic-file-upload">
          <label className={`secondary-button dynamic-file-picker${canUpload ? '' : ' is-disabled'}`}>
            <span>{field.placeholder?.trim() || defaultFieldPlaceholder('FILE')}</span>
            <input type="file" aria-label={`Chọn tệp cho ${field.label}`} aria-required={field.required} accept={config.allowedMimeTypes.join(',')} multiple={config.multiple} disabled={!canUpload || Boolean(uploadState)} onChange={(event) => void selectFiles(event)} />
          </label>
          <span className="dynamic-file-policy">Tối đa {config.maxFiles} tệp, {humanFileSize(config.maxFileSizeBytes)}/tệp</span>
        </div>
      )}
      {uploadState && <div className="dynamic-upload-progress" aria-live="polite"><div><span>{uploadState.fileName}</span><strong>{uploadState.progress}%</strong></div><progress max={100} value={uploadState.progress} /></div>}
      {uploadError && <small className="dynamic-form-error" role="alert">{uploadError}</small>}
      {fileIds.length === 0 && mode === 'readonly' && <p className="dynamic-readonly-value is-empty">Chưa có tệp đính kèm</p>}
    </div>
  )
}

function DynamicFileItem({ fileId, initialMetadata, canDelete, onDeleted }: { fileId: string; initialMetadata?: FileMetadata; canDelete: boolean; onDeleted: () => void }) {
  const [state, setState] = useState<{ metadata?: FileMetadata; error?: string }>(() => initialMetadata ? { metadata: initialMetadata } : {})
  const [activeAction, setActiveAction] = useState<'preview' | 'download' | 'delete' | null>(null)

  function load() {
    setState({})
    void getFileMetadata(fileId)
      .then((metadata) => setState({ metadata }))
      .catch((error) => setState({ error: error instanceof Error ? error.message : 'Không thể tải thông tin tệp.' }))
  }

  useEffect(() => {
    if (initialMetadata) return
    let current = true
    void getFileMetadata(fileId)
      .then((metadata) => { if (current) setState({ metadata }) })
      .catch((error) => { if (current) setState({ error: error instanceof Error ? error.message : 'Không thể tải thông tin tệp.' }) })
    return () => { current = false }
  }, [fileId, initialMetadata])

  const metadata = initialMetadata ?? state.metadata
  async function run(action: 'preview' | 'download' | 'delete') {
    if (!metadata) return
    setActiveAction(action)
    setState((current) => ({ ...current, error: undefined }))
    try {
      if (action === 'preview') {
        const url = await createFilePreviewUrl(fileId)
        window.open(url, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => revokeFilePreviewUrl(url), 60_000)
      } else if (action === 'download') {
        await downloadFile(fileId, metadata.originalName)
      } else {
        await deleteFile(fileId)
        onDeleted()
      }
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : 'Không thể xử lý tệp.' }))
    } finally {
      setActiveAction(null)
    }
  }

  if (!metadata && !state.error) return <div className="dynamic-file-item is-loading" aria-live="polite"><span className="dynamic-file-skeleton" /><span>Đang tải thông tin tệp...</span></div>
  if (!metadata) return <div className="dynamic-file-item has-error"><span>{state.error}</span><button type="button" onClick={load}>Thử lại</button></div>
  const previewable = metadata.detectedMimeType === 'application/pdf' || metadata.detectedMimeType.startsWith('image/')
  return (
    <div className="dynamic-file-item">
      <div className="dynamic-file-information"><strong>{metadata.originalName}</strong><span>{humanFileSize(metadata.sizeBytes)}</span></div>
      <div className="dynamic-file-actions">
        {previewable && <button type="button" disabled={activeAction !== null} onClick={() => void run('preview')}>{activeAction === 'preview' ? 'Đang mở...' : 'Xem'}</button>}
        <button type="button" disabled={activeAction !== null} onClick={() => void run('download')}>{activeAction === 'download' ? 'Đang tải...' : 'Tải xuống'}</button>
        {canDelete && <button className="is-danger" type="button" disabled={activeAction !== null} onClick={() => void run('delete')}>{activeAction === 'delete' ? 'Đang xóa...' : 'Xóa'}</button>}
      </div>
      {state.error && <small className="dynamic-form-error" role="alert">{state.error}</small>}
    </div>
  )
}

function DynamicFormLoading() {
  return <section className="dynamic-form-state" aria-live="polite"><span className="dynamic-form-state-bar" /><span className="dynamic-form-state-bar is-short" /><span className="dynamic-form-state-bar" /><p>Đang tải biểu mẫu...</p></section>
}

function DynamicFormEmpty() {
  return <section className="dynamic-form-state"><strong>Biểu mẫu chưa có trường dữ liệu.</strong><p>Không có nội dung để hiển thị.</p></section>
}

function DynamicFormError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <section className="dynamic-form-state is-error" role="alert"><strong>Không thể tải biểu mẫu</strong><p>{message}</p>{onRetry && <button className="secondary-button" type="button" onClick={onRetry}>Tải lại</button>}</section>
}

function layoutSpan(field: FormField): number {
  if (field.type === 'TABLE' || field.type === 'SECTION') return 12
  const layout = field.layout ?? {}
  if (layout.fullWidth === true || layout.width === 'full') return 12
  if (layout.width === 'half') return 6
  if (layout.width === 'third') return 4
  if (layout.width === 'quarter') return 3
  const requested = typeof layout.columnSpan === 'number' ? layout.columnSpan : layout.colSpan
  if (typeof requested === 'number' && Number.isFinite(requested)) return Math.min(12, Math.max(1, Math.round(requested)))
  return 12
}

function optionLabel(field: FormField, value: unknown): string {
  return field.options?.find((option) => option.value === value)?.label ?? String(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeMimeType(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'application/x-pdf') return 'application/pdf'
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') return 'image/jpeg'
  return normalized
}
