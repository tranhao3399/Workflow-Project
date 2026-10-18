import { useEffect, useMemo, useState } from 'react'
import { DynamicFormRenderer } from '../dynamic-form'
import { ApiError } from '../../services/api-client'
import { cloneFormDefinition, createFormDefinition, deleteFormDefinition, getFormDefinition, updateFormDefinition } from '../../services/form-definitions.service'
import { formFieldTypes, type FormDefinition, type FormField, type FormFieldType, type FormSettings } from '../../types/workflow'
import { cloneField, createField, reindexFields, validateFormBuilderDefinition, type FormBuilderIssue } from '../../utils/form-builder'
import { DefinitionStatusBadge } from '../StatusBadge'
import { ErrorState, LoadingState } from '../DataStates'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'
import { FormFieldProperties } from './FormFieldProperties'

interface FormBuilderEditorPageProps {
  formDefinitionId?: string
  canCreate: boolean
  canUpdate: boolean
  canDeleteDraft: boolean
  onBack: () => void
  onOpen: (id: string) => void
  onConfigureWorkflow: (formDefinitionId: string) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

interface FormDraft {
  code: string
  name: string
  description: string
  fields: FormField[]
  settings: FormSettings
}

type EditorTab = 'DESIGN' | 'PREVIEW'
type Confirmation = 'DELETE' | 'CLONE' | null

const fieldLabels: Record<FormFieldType, string> = {
  TEXT: 'Văn bản ngắn', TEXTAREA: 'Văn bản dài', NUMBER: 'Số', CURRENCY: 'Tiền tệ', EMAIL: 'Email', PHONE: 'Điện thoại', DATE: 'Ngày', DATETIME: 'Ngày và giờ', SELECT: 'Danh sách chọn', MULTI_SELECT: 'Chọn nhiều', RADIO: 'Lựa chọn đơn', CHECKBOX: 'Nhóm checkbox', BOOLEAN: 'Có / Không', FILE: 'Tệp đính kèm',
}

export function FormBuilderEditorPage({ formDefinitionId, canCreate, canUpdate, canDeleteDraft, onBack, onOpen, onConfigureWorkflow, onNotify }: FormBuilderEditorPageProps) {
  const [definition, setDefinition] = useState<FormDefinition | null>(null)
  const [draft, setDraft] = useState<FormDraft>(() => emptyDraft())
  const [originalFingerprint, setOriginalFingerprint] = useState(() => fingerprint(emptyDraft()))
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0)
  const [tab, setTab] = useState<EditorTab>('DESIGN')
  const [isLoading, setIsLoading] = useState(Boolean(formDefinitionId))
  const [loadError, setLoadError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [showValidation, setShowValidation] = useState(false)
  const [serverIssues, setServerIssues] = useState<FormBuilderIssue[]>([])
  const [generalError, setGeneralError] = useState('')

  useEffect(() => {
    if (!formDefinitionId) return
    let current = true
    void getFormDefinition(formDefinitionId).then((item) => {
      if (!current) return
      const next = toDraft(item)
      setDefinition(item)
      setDraft(next)
      setOriginalFingerprint(fingerprint(next))
      setSelectedIndex(item.fields.length ? 0 : null)
      setLoadError(false)
    }).catch(() => {
      if (current) setLoadError(true)
    }).finally(() => {
      if (current) setIsLoading(false)
    })
    return () => { current = false }
  }, [formDefinitionId, reloadVersion])

  const isNew = !formDefinitionId
  const isDraft = isNew || definition?.status === 'DRAFT'
  const isEditable = isDraft && (isNew ? canCreate : canUpdate)
  const isDirty = fingerprint(draft) !== originalFingerprint
  const clientIssues = useMemo(() => validateFormBuilderDefinition(draft.code, draft.name, draft.fields), [draft])
  const displayedIssues = showValidation ? [...clientIssues, ...serverIssues] : serverIssues
  const selectedField = selectedIndex === null ? null : draft.fields[selectedIndex] ?? null
  const previewDefinition = useMemo<FormDefinition>(() => ({
    id: definition?.id ?? 'preview',
    code: draft.code || 'FORM_PREVIEW',
    version: definition?.version ?? 1,
    name: draft.name || 'Biểu mẫu chưa đặt tên',
    description: draft.description || undefined,
    status: definition?.status ?? 'DRAFT',
    fields: reindexFields(draft.fields),
    settings: draft.settings,
    createdAt: definition?.createdAt ?? new Date().toISOString(),
    updatedAt: definition?.updatedAt ?? new Date().toISOString(),
  }), [definition, draft])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: isDirty }))
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false }))
    }
  }, [isDirty])

  function changeDraft(patch: Partial<FormDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setServerIssues([])
    setGeneralError('')
  }

  function updateField(index: number, field: FormField) {
    changeDraft({ fields: draft.fields.map((item, itemIndex) => itemIndex === index ? field : item) })
  }

  function addField(type: FormFieldType) {
    const next = [...draft.fields, createField(type, draft.fields)]
    changeDraft({ fields: reindexFields(next) })
    setSelectedIndex(next.length - 1)
    setTab('DESIGN')
  }

  function duplicateField(index: number) {
    const copy = cloneField(draft.fields[index], draft.fields)
    const next = [...draft.fields.slice(0, index + 1), copy, ...draft.fields.slice(index + 1)]
    changeDraft({ fields: reindexFields(next) })
    setSelectedIndex(index + 1)
  }

  function deleteField(index: number) {
    const next = draft.fields.filter((_, itemIndex) => itemIndex !== index)
    changeDraft({ fields: reindexFields(next) })
    if (!next.length) setSelectedIndex(null)
    else setSelectedIndex(Math.min(index, next.length - 1))
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= draft.fields.length) return
    const next = [...draft.fields]
    const [field] = next.splice(index, 1)
    next.splice(target, 0, field)
    changeDraft({ fields: reindexFields(next) })
    setSelectedIndex(target)
  }

  async function saveAndContinue() {
    if (!isEditable || isSaving) return
    if (clientIssues.length) {
      setShowValidation(true)
      focusIssue(clientIssues[0], setSelectedIndex)
      return
    }
    if (!isDirty && definition) {
      onConfigureWorkflow(definition.id)
      return
    }
    setIsSaving(true)
    setGeneralError('')
    setServerIssues([])
    try {
      const fields = reindexFields(draft.fields)
      const saved = definition
        ? await updateFormDefinition(definition.id, { name: draft.name.trim(), description: draft.description.trim(), fields, settings: draft.settings })
        : await createFormDefinition({ code: draft.code.trim().toUpperCase(), name: draft.name.trim(), description: draft.description.trim(), fields, settings: draft.settings })
      const next = toDraft(saved)
      setDefinition(saved)
      setDraft(next)
      setOriginalFingerprint(fingerprint(next))
      setShowValidation(false)
      window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false }))
      onNotify(definition ? 'Lưu thay đổi biểu mẫu thành công.' : 'Tạo biểu mẫu nháp thành công.')
      onConfigureWorkflow(saved.id)
    } catch (error) {
      handleSaveError(error)
    } finally {
      setIsSaving(false)
    }
  }

  function handleSaveError(error: unknown) {
    if (error instanceof ApiError && error.field) {
      const issue = { path: normalizeServerPath(error.field), message: error.message }
      setServerIssues([issue])
      setShowValidation(true)
      focusIssue(issue, setSelectedIndex)
      return
    }
    const message = error instanceof Error ? error.message : 'Không thể lưu biểu mẫu.'
    setGeneralError(message)
    onNotify(message, 'error')
  }

  async function cloneVersion() {
    if (!definition || isCloning) return
    setIsCloning(true)
    try {
      const cloned = await cloneFormDefinition(definition.id)
      onNotify(`Đã tạo phiên bản ${cloned.version} để chỉnh sửa.`)
      setConfirmation(null)
      onOpen(cloned.id)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể tạo phiên bản nháp.', 'error')
    } finally {
      setIsCloning(false)
    }
  }

  async function removeDraft() {
    if (!definition || isDeleting) return
    setIsDeleting(true)
    try {
      await deleteFormDefinition(definition.id)
      window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false }))
      onNotify('Xóa biểu mẫu nháp thành công.')
      onBack()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể xóa biểu mẫu nháp.', 'error')
    } finally {
      setIsDeleting(false)
      setConfirmation(null)
    }
  }

  function back() {
    if (!isDirty) { onBack(); return }
    window.dispatchEvent(new CustomEvent('workflow:navigate-request', { detail: { onConfirm: onBack } }))
  }

  if (isLoading) return <LoadingState />
  if (loadError) return <ErrorState onRetry={() => { setIsLoading(true); setLoadError(false); setReloadVersion((value) => value + 1) }} />

  return <>
    <PageHeader
      title={isNew ? 'Tạo biểu mẫu' : definition?.name ?? 'Chi tiết biểu mẫu'}
      description={isNew ? 'Tạo cấu trúc dữ liệu trước khi thiết lập quy trình xử lý.' : `${definition?.code} · Phiên bản ${definition?.version}`}
      actions={<>
        <button className="secondary-button" type="button" onClick={back}>← Quay lại</button>
        {!isDraft && canCreate && <button className="primary-button" type="button" onClick={() => setConfirmation('CLONE')}>Tạo phiên bản chỉnh sửa</button>}
        {definition?.status === 'DRAFT' && canDeleteDraft && <button className="danger-button" type="button" onClick={() => setConfirmation('DELETE')}>Xóa bản nháp</button>}
      </>}
    >{definition && <div className="form-builder-header-status"><DefinitionStatusBadge status={definition.status} /></div>}</PageHeader>

    {!isEditable && isDraft && <div className="form-builder-readonly-notice" role="status">Bạn có thể xem cấu hình nhưng chưa được cấp quyền chỉnh sửa biểu mẫu.</div>}
    {!isDraft && <div className="form-builder-readonly-notice" role="status">Phiên bản đã xuất bản hoặc ngưng hoạt động chỉ được xem. Hãy clone để tạo phiên bản nháp mới.</div>}
    {generalError && <p className="form-builder-server-error" role="alert">{generalError}</p>}

    <SurfaceCard className="form-builder-editor-card">
      <div className="form-builder-editor-toolbar">
        <div className="form-builder-view-switch" role="tablist" aria-label="Chế độ Form Builder">
          <button type="button" role="tab" aria-selected={tab === 'DESIGN'} className={tab === 'DESIGN' ? 'is-active' : ''} onClick={() => setTab('DESIGN')}>Thiết kế</button>
          <button type="button" role="tab" aria-selected={tab === 'PREVIEW'} className={tab === 'PREVIEW' ? 'is-active' : ''} onClick={() => setTab('PREVIEW')}>Xem trước</button>
        </div>
        <span>{draft.fields.length} trường</span>
      </div>
      {tab === 'PREVIEW' ? <div className="form-builder-preview"><DynamicFormRenderer formDefinition={previewDefinition} mode="preview" /></div> : <div className="form-builder-editor-layout">
        <aside className="form-builder-palette" aria-label="Loại trường">
          <div className="form-builder-pane-heading"><h2>Loại trường</h2><p>Chọn để thêm vào cuối biểu mẫu.</p></div>
          <div className="form-builder-field-types">{formFieldTypes.map((type) => <button type="button" key={type} disabled={!isEditable} onClick={() => addField(type)}><span>{fieldTypeMark(type)}</span><strong>{fieldLabels[type]}</strong></button>)}</div>
        </aside>
        <main className="form-builder-canvas">
          <div className="form-builder-pane-heading"><h2>Canvas</h2><p>Chọn một trường để cấu hình thuộc tính.</p></div>
          {!draft.fields.length ? <button className="form-builder-empty-canvas" type="button" disabled={!isEditable} onClick={() => addField('TEXT')}>Biểu mẫu chưa có trường. Thêm trường đầu tiên.</button> : <div className="form-builder-canvas-list">{draft.fields.map((field, index) => {
            const fieldHasIssue = displayedIssues.some((issue) => issue.path.startsWith(`fields.${index}.`))
            return <article className={`form-builder-canvas-field${selectedIndex === index ? ' is-selected' : ''}${fieldHasIssue ? ' has-error' : ''}`} key={`${index}-${field.key}`} data-field-index={index} onClick={() => setSelectedIndex(index)}>
              <button className="form-builder-field-main" type="button" onClick={() => setSelectedIndex(index)}>
                <span className="form-builder-field-position">{index + 1}</span>
                <span><strong>{field.label || 'Chưa đặt nhãn'}{field.required && <b aria-label="Bắt buộc"> *</b>}</strong><small>{field.key || 'Chưa có field key'} · {fieldLabels[field.type]}</small></span>
              </button>
              <div className="form-builder-field-actions">
                <button className="icon-action" type="button" title="Di chuyển lên" aria-label="Di chuyển trường lên" disabled={!isEditable || index === 0} onClick={(event) => { event.stopPropagation(); moveField(index, -1) }}>↑</button>
                <button className="icon-action" type="button" title="Di chuyển xuống" aria-label="Di chuyển trường xuống" disabled={!isEditable || index === draft.fields.length - 1} onClick={(event) => { event.stopPropagation(); moveField(index, 1) }}>↓</button>
                <button className="icon-action" type="button" title="Sao chép trường" aria-label="Sao chép trường" disabled={!isEditable} onClick={(event) => { event.stopPropagation(); duplicateField(index) }}>⧉</button>
                <button className="icon-action danger-icon-action" type="button" title="Xóa trường" aria-label="Xóa trường" disabled={!isEditable} onClick={(event) => { event.stopPropagation(); deleteField(index) }}>×</button>
              </div>
              {fieldHasIssue && <p className="field-error">{displayedIssues.find((issue) => issue.path.startsWith(`fields.${index}.`))?.message}</p>}
            </article>
          })}</div>}
          {displayedIssues.find((issue) => issue.path === 'fields') && <p className="field-error form-builder-fields-error">{displayedIssues.find((issue) => issue.path === 'fields')?.message}</p>}
        </main>
        <aside className="form-builder-properties" aria-label="Thuộc tính">
          <div className="form-builder-pane-heading"><h2>{selectedField ? 'Thuộc tính trường' : 'Thông tin biểu mẫu'}</h2><button className="text-action-button" type="button" onClick={() => setSelectedIndex(selectedField ? null : 0)}>{selectedField ? 'Cấu hình Form' : draft.fields.length ? 'Chọn trường đầu' : ''}</button></div>
          {selectedField && selectedIndex !== null ? <FormFieldProperties field={selectedField} fieldIndex={selectedIndex} allFields={draft.fields} issues={displayedIssues} disabled={!isEditable} onChange={(field) => updateField(selectedIndex, field)} /> : <FormProperties draft={draft} issues={displayedIssues} disabled={!isEditable} isNew={isNew} onChange={changeDraft} />}
        </aside>
      </div>}
    </SurfaceCard>

    {isEditable && <div className="form-builder-action-bar"><div><strong>{isDirty ? 'Có thay đổi chưa lưu' : 'Biểu mẫu đã được lưu'}</strong><span>Quy trình sẽ được cấu hình ở bước tiếp theo.</span></div><button className="primary-button" type="button" disabled={isSaving} onClick={() => void saveAndContinue()}>{isSaving ? 'Đang lưu...' : 'Lưu và cấu hình quy trình'}</button></div>}

    {confirmation === 'DELETE' && <ConfirmDialog title="Xóa biểu mẫu nháp?" description="Bản nháp sẽ bị xóa vĩnh viễn nếu chưa được Workflow hoặc phiếu tham chiếu." confirmLabel="Xóa bản nháp" tone="danger" onCancel={() => setConfirmation(null)} onConfirm={() => void removeDraft()} isConfirming={isDeleting} confirmingLabel="Đang xóa..." />}
    {confirmation === 'CLONE' && <ConfirmDialog title="Tạo phiên bản chỉnh sửa?" description={`Hệ thống sẽ giữ nguyên phiên bản ${definition?.version} và tạo một bản DRAFT mới.`} confirmLabel="Tạo phiên bản mới" onCancel={() => setConfirmation(null)} onConfirm={() => void cloneVersion()} isConfirming={isCloning} confirmingLabel="Đang tạo..." />}
  </>
}

function FormProperties({ draft, issues, disabled, isNew, onChange }: { draft: FormDraft; issues: readonly FormBuilderIssue[]; disabled: boolean; isNew: boolean; onChange: (patch: Partial<FormDraft>) => void }) {
  const error = (path: string) => issues.find((issue) => issue.path === path)?.message
  return <div className="form-builder-properties-body">
    <label className="form-builder-property-field"><span className="required-field-label">Mã biểu mẫu</span><input data-form-property="code" value={draft.code} disabled={disabled || !isNew} maxLength={80} aria-invalid={Boolean(error('code'))} onChange={(event) => onChange({ code: event.target.value.toUpperCase() })} />{error('code') && <small className="field-error">{error('code')}</small>}</label>
    <label className="form-builder-property-field"><span className="required-field-label">Tên biểu mẫu</span><input data-form-property="name" value={draft.name} disabled={disabled} maxLength={160} aria-invalid={Boolean(error('name'))} onChange={(event) => onChange({ name: event.target.value })} />{error('name') && <small className="field-error">{error('name')}</small>}</label>
    <label className="form-builder-property-field"><span>Mô tả</span><textarea value={draft.description} disabled={disabled} rows={4} maxLength={2000} onChange={(event) => onChange({ description: event.target.value })} /></label>
    <section className="form-builder-property-section"><div className="form-builder-property-title"><strong>Thiết lập phiếu</strong></div>
      <label className="form-builder-toggle"><input type="checkbox" checked={draft.settings.allowSaveDraft !== false} disabled={disabled} onChange={(event) => onChange({ settings: { ...draft.settings, allowSaveDraft: event.target.checked } })} /><span>Cho phép lưu nháp</span></label>
      <label className="form-builder-toggle"><input type="checkbox" checked={draft.settings.allowCancelAfterSubmit === true} disabled={disabled} onChange={(event) => onChange({ settings: { ...draft.settings, allowCancelAfterSubmit: event.target.checked } })} /><span>Cho phép hủy sau khi gửi</span></label>
      <label className="form-builder-property-field"><span>Mẫu tiêu đề phiếu</span><input value={draft.settings.titleTemplate ?? ''} disabled={disabled} maxLength={300} onChange={(event) => onChange({ settings: { ...draft.settings, titleTemplate: event.target.value || undefined } })} /></label>
      <label className="form-builder-property-field"><span>Hướng dẫn nhập</span><textarea value={draft.settings.instructions ?? ''} disabled={disabled} rows={4} maxLength={2000} onChange={(event) => onChange({ settings: { ...draft.settings, instructions: event.target.value || undefined } })} /></label>
    </section>
  </div>
}

function emptyDraft(): FormDraft {
  const firstField = createField('TEXT', [])
  return { code: '', name: '', description: '', fields: [firstField], settings: { allowSaveDraft: true, allowCancelAfterSubmit: false } }
}

function toDraft(definition: FormDefinition): FormDraft {
  return { code: definition.code, name: definition.name, description: definition.description ?? '', fields: structuredClone(definition.fields), settings: structuredClone(definition.settings) }
}

function fingerprint(value: FormDraft): string { return JSON.stringify(value) }

function normalizeServerPath(path: string): string {
  return path.replace(/^definition\./, '').replace(/^body\./, '')
}

function focusIssue(issue: FormBuilderIssue, selectField: (index: number | null) => void) {
  const match = /^fields\.(\d+)/.exec(issue.path)
  if (match) {
    const index = Number(match[1])
    selectField(index)
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-field-index="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return
  }
  selectField(null)
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-form-property="${issue.path}"]`)?.focus())
}

function fieldTypeMark(type: FormFieldType): string {
  if (type === 'TEXT' || type === 'TEXTAREA') return 'T'
  if (type === 'NUMBER' || type === 'CURRENCY') return '#'
  if (type === 'EMAIL') return '@'
  if (type === 'PHONE') return '☎'
  if (type === 'DATE' || type === 'DATETIME') return '◫'
  if (type === 'FILE') return '↥'
  if (type === 'BOOLEAN') return '✓'
  return '☷'
}
