import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
const emptyTouched: Record<string, boolean> = {}

export const DynamicFormRenderer = forwardRef<DynamicFormRendererHandle, DynamicFormRendererProps>(function DynamicFormRenderer({
  formDefinition,
  formSnapshot,
  initialValues = emptyValues,
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
  const touched = touchedState.sourceKey === sourceKey ? touchedState.fields : emptyTouched
  const visibility = useMemo(() => dynamicFieldVisibility(fields, values), [fields, values])
  const validation = useMemo(() => validateDynamicFormData(fields, values), [fields, values])
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
    const firstVisibleError = result.errors.find((error) => visibility.get(error.fieldKey) !== false)
    if (!firstVisibleError) return
    window.requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(`[data-dynamic-field="${firstVisibleError.fieldKey}"]`)
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      field?.querySelector<HTMLElement>('input, textarea, button, select, [tabindex]:not([tabindex="-1"])')?.focus()
    })
  }, [visibility])

  useImperativeHandle(ref, () => ({
    getValues: () => ({ ...values }),
    validate: () => {
      const nextTouched = Object.fromEntries(
        validation.errors
          .filter((error) => visibility.get(error.fieldKey) !== false)
          .map((error) => [error.fieldKey, true]),
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
          const style = { gridColumn: `span ${layoutSpan(field)}` } satisfies CSSProperties
          return (
            <div
              className={`dynamic-form-field dynamic-form-field-${field.type.toLowerCase()}${error ? ' has-error' : ''}`}
              data-dynamic-field={field.key}
              key={field.key}
              style={style}
            >
              <div className="dynamic-form-label-row">
                <span className={field.required ? 'required-field-label' : undefined}>{field.label}</span>
              </div>
              {mode === 'readonly'
                ? <ReadonlyField field={field} value={values[field.key]} requestId={requestId} />
                : <EditableField
                    field={field}
                    value={values[field.key]}
                    mode={mode}
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
  requestId?: string
  allowFileDelete: boolean
  errorId?: string
  onChange: (value: unknown) => void
  onBlur: () => void
}

function EditableField({ field, value, mode, requestId, allowFileDelete, errorId, onChange, onBlur }: EditableFieldProps) {
  const common = {
    'aria-label': field.label,
    'aria-required': field.required,
    'aria-invalid': Boolean(errorId),
    'aria-describedby': errorId,
    placeholder: field.placeholder,
    onBlur,
  }
  if (field.type === 'TEXTAREA') {
    return <textarea {...common} rows={4} value={stringValue(value)} onChange={(event) => onChange(event.target.value)} />
  }
  if (field.type === 'TEXT' || field.type === 'EMAIL' || field.type === 'PHONE') {
    const type = field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : 'text'
    return <input {...common} type={type} value={stringValue(value)} onChange={(event) => onChange(event.target.value)} />
  }
  if (field.type === 'NUMBER' || field.type === 'CURRENCY') {
    return <input {...common} type="number" inputMode="decimal" min={field.validation?.min} max={field.validation?.max} value={numberInputValue(value)} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />
  }
  if (field.type === 'DATE' || field.type === 'DATETIME') {
    return <input {...common} type={field.type === 'DATE' ? 'date' : 'datetime-local'} value={stringValue(value)} onChange={(event) => onChange(event.target.value)} />
  }
  if (field.type === 'SELECT') {
    return <FilterSelect ariaLabel={field.label} value={stringValue(value)} options={[{ value: '', label: field.placeholder || 'Chọn giá trị' }, ...activeFieldOptions(field)]} onChange={(nextValue) => { onChange(nextValue || undefined); onBlur() }} />
  }
  if (field.type === 'RADIO') {
    return <OptionGroup field={field} value={value} kind="radio" errorId={errorId} onChange={onChange} onBlur={onBlur} />
  }
  if (field.type === 'MULTI_SELECT' || field.type === 'CHECKBOX') {
    return <OptionGroup field={field} value={value} kind="checkbox" errorId={errorId} onChange={onChange} onBlur={onBlur} />
  }
  if (field.type === 'BOOLEAN') {
    return <label className="dynamic-boolean-control"><input type="checkbox" checked={value === true} aria-label={field.label} aria-required={field.required} aria-invalid={Boolean(errorId)} aria-describedby={errorId} onChange={(event) => onChange(event.target.checked)} onBlur={onBlur} /><span>{value === true ? 'Có' : 'Không'}</span></label>
  }
  return <DynamicFileField field={field} value={value} mode={mode} requestId={requestId} allowDelete={allowFileDelete} errorId={errorId} onChange={onChange} onBlur={onBlur} />
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

function ReadonlyField({ field, value, requestId }: { field: FormField; value: unknown; requestId?: string }) {
  if (field.type === 'FILE') return <DynamicFileField field={field} value={value} mode="readonly" requestId={requestId} allowDelete={false} onChange={() => undefined} onBlur={() => undefined} />
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return <p className="dynamic-readonly-value is-empty">Chưa cập nhật</p>
  if (field.type === 'SELECT' || field.type === 'RADIO') return <p className="dynamic-readonly-value">{optionLabel(field, value)}</p>
  if (field.type === 'MULTI_SELECT' || field.type === 'CHECKBOX') {
    return <div className="dynamic-readonly-options">{(Array.isArray(value) ? value : []).map((item) => <span key={String(item)}>{optionLabel(field, item)}</span>)}</div>
  }
  if (field.type === 'BOOLEAN') return <p className="dynamic-readonly-value">{value === true ? 'Có' : 'Không'}</p>
  if (field.type === 'NUMBER' || field.type === 'CURRENCY') return <p className="dynamic-readonly-value">{typeof value === 'number' ? new Intl.NumberFormat('vi-VN').format(value) : String(value)}</p>
  if (field.type === 'DATE' || field.type === 'DATETIME') return <p className="dynamic-readonly-value">{formatFormDateValue(value, field.type === 'DATETIME')}</p>
  return <p className="dynamic-readonly-value preserve-lines">{String(value)}</p>
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
            <span>Chọn tệp</span>
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
  const layout = field.layout ?? {}
  if (layout.fullWidth === true || layout.width === 'full') return 12
  if (layout.width === 'half') return 6
  if (layout.width === 'third') return 4
  if (layout.width === 'quarter') return 3
  const requested = typeof layout.columnSpan === 'number' ? layout.columnSpan : layout.colSpan
  if (typeof requested === 'number' && Number.isFinite(requested)) return Math.min(12, Math.max(1, Math.round(requested)))
  return ['TEXTAREA', 'FILE', 'MULTI_SELECT', 'CHECKBOX', 'RADIO'].includes(field.type) ? 12 : 6
}

function optionLabel(field: FormField, value: unknown): string {
  return field.options?.find((option) => option.value === value)?.label ?? String(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberInputValue(value: unknown): string | number {
  return typeof value === 'number' && Number.isFinite(value) ? value : ''
}

function normalizeMimeType(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'application/x-pdf') return 'application/pdf'
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') return 'image/jpeg'
  return normalized
}
