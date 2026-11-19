import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ApiError } from '../../services/api-client'
import { publishDefinitionPackage } from '../../services/definition-packages.service'
import { cloneFormDefinition, listAllFormDefinitions } from '../../services/form-definitions.service'
import {
  cloneWorkflowDefinition,
  createWorkflowDefinition,
  deleteWorkflowDefinition,
  getWorkflowBuilderReferenceData,
  getWorkflowDefinition,
  updateWorkflowDefinition,
  validateWorkflowDefinition,
} from '../../services/workflow-definitions.service'
import type { DefinitionPackagePublishMode, FormDefinition, WorkflowBuilderReferenceData, WorkflowDefinition, WorkflowGraphValidationError } from '../../types/workflow'
import { isApiErrorCode } from '../../utils/api-errors'
import { DefinitionStatusBadge } from '../StatusBadge'
import { ErrorState, LoadingState } from '../DataStates'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FilterSelect } from '../ui/FilterSelect'
import { SurfaceCard } from '../ui/SurfaceCard'
import { defaultWorkflowBpmnXml, type BpmnNodePatch, type BpmnNodeSelection } from './bpmn-workflow'
import { WorkflowGraphCanvas, type WorkflowGraphCanvasHandle } from './WorkflowGraphCanvas'
import { WorkflowPropertiesPanel } from './WorkflowPropertiesPanel'

interface WorkflowBuilderEditorPageProps {
  workflowDefinitionId?: string
  initialFormDefinitionId?: string
  canCreate: boolean
  canUpdate: boolean
  canDeleteDraft: boolean
  canPublishWorkflow: boolean
  canPublishPackage: boolean
  canCloneWorkflow: boolean
  canClonePackage: boolean
  onBack: () => void
  onOpen: (id: string, replace?: boolean) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

interface WorkflowDraft {
  code: string
  name: string
  description: string
  formDefinitionId: string
}

const emptyReferenceData: WorkflowBuilderReferenceData = { roles: [], positions: [], departments: [], employees: [], users: [] }

export function WorkflowBuilderEditorPage({ workflowDefinitionId, initialFormDefinitionId, canCreate, canUpdate, canDeleteDraft, canPublishWorkflow, canPublishPackage, canCloneWorkflow, canClonePackage, onBack, onOpen, onNotify }: WorkflowBuilderEditorPageProps) {
  const canvasRef = useRef<WorkflowGraphCanvasHandle>(null)
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null)
  const [draft, setDraft] = useState<WorkflowDraft>(() => initialDraft(initialFormDefinitionId))
  const [originalFingerprint, setOriginalFingerprint] = useState(() => fingerprint(initialDraft(initialFormDefinitionId)))
  const [canvasXml, setCanvasXml] = useState(defaultWorkflowBpmnXml)
  const [diagramDirty, setDiagramDirty] = useState(false)
  const [forms, setForms] = useState<FormDefinition[]>([])
  const [referenceData, setReferenceData] = useState<WorkflowBuilderReferenceData>(emptyReferenceData)
  const [selection, setSelection] = useState<BpmnNodeSelection | null>(null)
  const [isInfoCollapsed, setIsInfoCollapsed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'DELETE' | 'CLONE_WORKFLOW' | 'CLONE_PACKAGE' | 'PUBLISH' | null>(null)
  const [serverIssues, setServerIssues] = useState<WorkflowGraphValidationError[]>([])
  const [generalError, setGeneralError] = useState('')

  useEffect(() => {
    let current = true
    const load = async () => {
      try {
        const [availableForms, references, workflow] = await Promise.all([
          listAllFormDefinitions({ sortBy: 'updatedAt', sortOrder: 'desc' }),
          getWorkflowBuilderReferenceData(),
          workflowDefinitionId ? getWorkflowDefinition(workflowDefinitionId) : Promise.resolve(null),
        ])
        if (!current) return
        setForms(availableForms)
        setReferenceData(references)
        if (workflow) {
          if (!workflow.bpmnXml) throw new Error('Workflow này chưa có BPMN XML hợp lệ.')
          const next = toDraft(workflow)
          setDefinition(workflow)
          setDraft(next)
          setOriginalFingerprint(fingerprint(next))
          setCanvasXml(workflow.bpmnXml)
        } else {
          const form = availableForms.find((item) => item.id === initialFormDefinitionId)
          const next = form ? initialDraft(form.id, form.code, form.name) : initialDraft(initialFormDefinitionId)
          setDefinition(null)
          setDraft(next)
          setOriginalFingerprint(fingerprint(next))
          setCanvasXml(defaultWorkflowBpmnXml)
        }
        setSelection(null)
        setDiagramDirty(false)
        setServerIssues([])
        setGeneralError('')
        setLoadError(false)
      } catch {
        if (current) setLoadError(true)
      } finally {
        if (current) setIsLoading(false)
      }
    }
    void load()
    return () => { current = false }
  }, [initialFormDefinitionId, reloadVersion, workflowDefinitionId])

  const isNew = !definition
  const isDraft = isNew || definition.status === 'DRAFT'
  const isEditable = isDraft && (isNew ? canCreate : canUpdate)
  const isDirty = diagramDirty || fingerprint(draft) !== originalFingerprint
  const availableForms = forms.filter((form) => form.status === 'DRAFT' || form.status === 'PUBLISHED' || form.id === draft.formDefinitionId)
  const linkedFormStatus = forms.find((form) => form.id === draft.formDefinitionId)?.status ?? definition?.formDefinition?.status
  const publishMode: DefinitionPackagePublishMode = linkedFormStatus === 'PUBLISHED' ? 'WORKFLOW_ONLY' : 'FULL_PACKAGE'
  const canPublish = publishMode === 'WORKFLOW_ONLY' ? canPublishWorkflow : canPublishPackage

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: isDirty }))
    const beforeUnload = (event: BeforeUnloadEvent) => { if (isDirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false }))
    }
  }, [isDirty])

  function changeDraft(patch: Partial<WorkflowDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    clearValidation()
  }

  function changeNode(patch: BpmnNodePatch) {
    canvasRef.current?.updateSelected(patch)
    clearValidation()
  }

  function diagramChanged() {
    setDiagramDirty(true)
    clearValidation()
  }

  function clearValidation() {
    setServerIssues([])
    setGeneralError('')
  }

  async function persist(): Promise<WorkflowDefinition | null> {
    if (!isEditable || isSaving) return definition
    const metadataError = validateMetadata(draft)
    if (metadataError) {
      setGeneralError(metadataError)
      return null
    }
    if (!isDirty && definition) return definition
    setIsSaving(true)
    setGeneralError('')
    try {
      const bpmnXml = await canvasRef.current?.exportXml()
      if (!bpmnXml) throw new Error('Không thể lấy BPMN XML từ trình thiết kế.')
      const saved = definition
        ? await updateWorkflowDefinition(definition.id, {
            expectedRevision: definition.revision,
            name: draft.name.trim(),
            description: draft.description.trim(),
            bpmnXml,
          })
        : await createWorkflowDefinition({
            code: draft.code.trim().toUpperCase(),
            name: draft.name.trim(),
            description: draft.description.trim(),
            formDefinitionId: draft.formDefinitionId,
            bpmnXml,
          })
      const next = toDraft(saved)
      setDefinition(saved)
      setDraft(next)
      setOriginalFingerprint(fingerprint(next))
      setCanvasXml(saved.bpmnXml ?? bpmnXml)
      setDiagramDirty(false)
      setServerIssues([])
      window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false }))
      return saved
    } catch (error) {
      handleApiError(error)
      return null
    } finally {
      setIsSaving(false)
    }
  }

  async function save() {
    const wasNew = !definition
    const saved = await persist()
    if (!saved) return
    onNotify(wasNew ? 'Tạo Workflow BPMN nháp thành công.' : 'Lưu Workflow BPMN thành công.')
    if (wasNew) onOpen(saved.id, true)
  }

  async function publish() {
    if (isPublishing) return
    setIsPublishing(true)
    try {
      const saved = await persist()
      if (!saved) return
      const validation = await validateWorkflowDefinition(saved.id)
      setServerIssues(validation.errors)
      if (!validation.valid) {
        focusIssue(validation.errors[0])
        onNotify('Quy trình còn lỗi cần xử lý.', 'error')
        return
      }
      await publishDefinitionPackage({
        formDefinitionId: saved.formDefinitionId,
        workflowDefinitionId: saved.id,
        publishMode,
      })
      const refreshed = await getWorkflowDefinition(saved.id)
      const next = toDraft(refreshed)
      setDefinition(refreshed)
      setDraft(next)
      setOriginalFingerprint(fingerprint(next))
      setCanvasXml(refreshed.bpmnXml ?? canvasXml)
      setDiagramDirty(false)
      setSelection(null)
      setConfirmAction(null)
      onNotify(publishMode === 'WORKFLOW_ONLY'
        ? 'Công bố Workflow mới thành công. Phiên bản Form được giữ nguyên.'
        : 'Công bố gói Form–Workflow thành công.')
      onOpen(refreshed.id, true)
    } catch (error) {
      handleApiError(error)
    } finally {
      setIsPublishing(false)
    }
  }

  async function cloneVersion(mode: DefinitionPackagePublishMode) {
    if (!definition || !definition.formDefinition || isCloning) return
    setIsCloning(true)
    try {
      if (mode === 'WORKFLOW_ONLY') {
        if (definition.formDefinition.status !== 'PUBLISHED') {
          throw new Error('Chỉ có thể giữ nguyên Form khi Form hiện tại đang PUBLISHED.')
        }
        const cloned = await cloneWorkflowDefinition(definition.id, { formDefinitionId: definition.formDefinitionId })
        setConfirmAction(null)
        onNotify(`Đã tạo Workflow phiên bản ${cloned.version}, giữ nguyên Form v${definition.formDefinition.version}.`)
        onOpen(cloned.id)
        return
      }
      let targetForm: FormDefinition
      try {
        targetForm = await cloneFormDefinition(definition.formDefinitionId)
      } catch (error) {
        const candidates = await listAllFormDefinitions({ search: definition.formDefinition.code, status: 'DRAFT' })
        const existing = candidates.find((form) => form.code === definition.formDefinition?.code)
        if (!existing) throw error
        targetForm = existing
      }
      const cloned = await cloneWorkflowDefinition(definition.id, { formDefinitionId: targetForm.id })
      setConfirmAction(null)
      onNotify(`Đã tạo Workflow phiên bản ${cloned.version} và Form DRAFT tương ứng.`)
      onOpen(cloned.id)
    } catch (error) {
      handleApiError(error)
    } finally {
      setIsCloning(false)
    }
  }

  async function remove() {
    if (!definition || isDeleting) return
    setIsDeleting(true)
    try {
      await deleteWorkflowDefinition(definition.id)
      window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false }))
      onNotify('Xóa Workflow nháp thành công.')
      onBack()
    } catch (error) {
      handleApiError(error)
    } finally {
      setIsDeleting(false)
      setConfirmAction(null)
    }
  }

  function handleApiError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Không thể thực hiện thao tác Workflow.'
    if (isApiErrorCode(error, 'CONCURRENT_MODIFICATION')) {
      setGeneralError('Workflow vừa được cập nhật ở nơi khác. Sơ đồ bạn đang chỉnh vẫn được giữ; hãy tải lại trước khi lưu tiếp.')
    } else if (error instanceof ApiError && error.errors) {
      const issues = error.errors.flatMap(toWorkflowIssue)
      setServerIssues(issues)
      setGeneralError(message)
      focusIssue(issues[0])
    } else if (error instanceof ApiError && error.field) {
      setServerIssues([{ code: error.code ?? 'API_VALIDATION', path: error.field, message }])
      setGeneralError(message)
    } else {
      setGeneralError(message)
    }
    onNotify(message, 'error')
  }

  function focusIssue(issue?: WorkflowGraphValidationError) {
    if (issue?.elementId) canvasRef.current?.focusElement(issue.elementId)
    else setSelection(null)
  }

  function back() {
    if (!isDirty) { onBack(); return }
    window.dispatchEvent(new CustomEvent('workflow:navigate-request', { detail: { onConfirm: onBack } }))
  }

  if (isLoading) return <LoadingState />
  if (loadError) return <ErrorState onRetry={() => { setIsLoading(true); setLoadError(false); setReloadVersion((value) => value + 1) }} />

  const pageTitle = definition?.name ?? 'Tạo Workflow'
  const metadataIssue = (path: string) => serverIssues.find((issue) => !issue.elementId && issue.path === path)?.message

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng Workflow">
      <button className="breadcrumb-link" type="button" onClick={back}>Workflow Builder</button>
      <span aria-hidden="true">/</span>
      <strong>{pageTitle}</strong>
    </nav>

    <section className="department-detail-summary form-builder-detail-summary">
      <div className="department-detail-summary-main form-builder-summary-main">
        <h1>{pageTitle}</h1>
        {definition && <span className="form-builder-version-pill">Phiên bản {definition.version}</span>}
      </div>
      <div className="department-detail-actions">
        <button className="secondary-button compact-button" type="button" onClick={back} disabled={isSaving || isPublishing}>← Quay lại</button>
        {!isDraft && canCloneWorkflow && definition?.formDefinition?.status === 'PUBLISHED' && <button className="primary-button compact-button" type="button" disabled={isCloning} onClick={() => setConfirmAction('CLONE_WORKFLOW')}>Chỉ cập nhật quy trình</button>}
        {!isDraft && canClonePackage && <button className="secondary-button compact-button" type="button" disabled={isCloning} onClick={() => setConfirmAction('CLONE_PACKAGE')}>Tạo phiên bản Form + Workflow</button>}
        {definition?.status === 'DRAFT' && canDeleteDraft && <button className="danger-outline-button compact-button form-builder-delete-draft-button" type="button" disabled={isSaving} onClick={() => setConfirmAction('DELETE')}>Xóa bản nháp</button>}
        {isEditable && <button className="secondary-button compact-button" type="button" disabled={isSaving || isPublishing || (!isDirty && Boolean(definition))} onClick={() => void save()}>{isSaving ? 'Đang lưu...' : 'Lưu nháp'}</button>}
        {isEditable && canPublish && <button className="primary-button compact-button" type="button" disabled={isSaving || isPublishing} onClick={() => setConfirmAction('PUBLISH')}>{isPublishing ? 'Đang công bố...' : 'Công bố'}</button>}
      </div>
    </section>

    {!isDraft && <div className="form-builder-readonly-notice">Workflow đã công bố được mở bằng BPMN Viewer. Hãy tạo phiên bản mới để chỉnh sửa.</div>}
    {!isEditable && isDraft && <div className="form-builder-readonly-notice">Bạn chưa được cấp quyền chỉnh sửa Workflow này.</div>}
    {generalError && <div className="form-builder-server-error" role="alert">{generalError}</div>}

    <SurfaceCard className="form-builder-info-card workflow-builder-info-card">
      <div className={`form-builder-info-heading${isInfoCollapsed ? ' is-collapsed' : ''}`}>
        <div className="form-builder-info-title"><h2>Thông tin Workflow</h2></div>
        <button className="form-builder-info-toggle" type="button" aria-expanded={!isInfoCollapsed} aria-controls="workflow-builder-general-information" onClick={() => setIsInfoCollapsed((current) => !current)}>
          {isInfoCollapsed ? 'Mở rộng' : 'Thu gọn'}
          {isInfoCollapsed ? <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" /> : <ChevronUp size={15} strokeWidth={1.8} aria-hidden="true" />}
        </button>
      </div>
      {!isInfoCollapsed && <div id="workflow-builder-general-information" className="form-builder-info-grid">
        <label className="form-builder-top-field">
          <span className="required-field-label">Mã Workflow</span>
          <input placeholder="VD: QUY_TRINH_NGHI_PHEP" value={draft.code} disabled={!isEditable || Boolean(definition)} maxLength={80} aria-invalid={Boolean(metadataIssue('code'))} onChange={(event) => changeDraft({ code: event.target.value.toUpperCase() })} />
          {metadataIssue('code') && <small className="field-error">{metadataIssue('code')}</small>}
        </label>
        <label className="form-builder-top-field">
          <span className="required-field-label">Tên Workflow</span>
          <input placeholder="VD: Quy trình duyệt nghỉ phép" value={draft.name} disabled={!isEditable} maxLength={160} aria-invalid={Boolean(metadataIssue('name'))} onChange={(event) => changeDraft({ name: event.target.value })} />
          {metadataIssue('name') && <small className="field-error">{metadataIssue('name')}</small>}
        </label>
        <div className="form-builder-top-field">
          <span className="required-field-label">Biểu mẫu liên kết</span>
          <FilterSelect disabled={!isEditable || Boolean(definition)} ariaLabel="Chọn biểu mẫu liên kết" value={draft.formDefinitionId} options={[{ value: '', label: 'Chọn biểu mẫu nháp hoặc đã phát hành' }, ...availableForms.map((form) => ({ value: form.id, label: `${form.code} · v${form.version} · ${form.name}` }))]} onChange={(value) => changeDraft({ formDefinitionId: value })} />
          {metadataIssue('formDefinitionId') && <small className="field-error">{metadataIssue('formDefinitionId')}</small>}
        </div>
        <label className="form-builder-top-field form-builder-top-field-description">
          <span>Mô tả</span>
          <textarea placeholder="Mục đích hoặc phạm vi áp dụng của quy trình" value={draft.description} disabled={!isEditable} rows={1} maxLength={2000} onChange={(event) => changeDraft({ description: event.target.value })} />
        </label>
        <div className="form-builder-top-field">
          <span>Trạng thái</span>
          <div className="form-builder-status-field" aria-label="Trạng thái Workflow"><DefinitionStatusBadge status={definition?.status ?? 'DRAFT'} /></div>
        </div>
      </div>}
    </SurfaceCard>

    <SurfaceCard className="workflow-builder-editor-card">
      <div className="form-builder-editor-toolbar"><strong>Sơ đồ BPMN</strong><span>{serverIssues.length ? `${serverIssues.length} lỗi cần xử lý` : 'Start Event · User Task · Exclusive Gateway · End Event'}</span></div>
      {serverIssues.length > 0 && <div className="workflow-validation-list" role="alert">{serverIssues.map((issue, index) => <button key={`${issue.code}-${issue.elementId ?? issue.path}-${index}`} type="button" onClick={() => focusIssue(issue)}><strong>{issue.elementId ?? issue.stepKey ?? issue.path}</strong><span>{issue.message}</span></button>)}</div>}
      <div className="workflow-builder-editor-layout is-bpmn">
        <main className="workflow-builder-canvas-pane"><WorkflowGraphCanvas
          ref={canvasRef}
          xml={canvasXml}
          editable={isEditable}
          errorElementIds={serverIssues.flatMap((issue) => issue.elementId ? [issue.elementId] : [])}
          onSelectionChange={setSelection}
          onChanged={diagramChanged}
          onError={(message) => { setGeneralError(message); onNotify(message, 'error') }}
        /></main>
        <aside className="workflow-builder-properties"><div className="form-builder-pane-heading"><div><h2>Thuộc tính phần tử</h2><p>{selection ? 'Cấu hình nghiệp vụ cho phần tử đang chọn.' : 'Chọn một phần tử trên sơ đồ để cấu hình.'}</p></div>{selection && <button className="text-action-button" type="button" onClick={() => setSelection(null)}>Bỏ chọn</button>}</div>{selection ? <WorkflowPropertiesPanel
          workflow={draft}
          definition={definition}
          forms={availableForms}
          selection={selection}
          issues={serverIssues}
          referenceData={referenceData}
          disabled={!isEditable}
          onWorkflowChange={changeDraft}
          onNodeChange={changeNode}
          onDeleteNode={() => canvasRef.current?.deleteSelected()}
          onClearSelection={() => setSelection(null)}
        /> : <div className="workflow-properties-empty"><strong>Chưa chọn phần tử</strong><p>Chọn bước phê duyệt, điều kiện hoặc điểm kết thúc trên sơ đồ để chỉnh sửa thuộc tính.</p></div>}</aside>
      </div>
    </SurfaceCard>
    {confirmAction === 'DELETE' && <ConfirmDialog title="Xóa Workflow nháp" description="Bạn có chắc chắn muốn xóa Workflow nháp này?" confirmLabel="Xóa" tone="danger" onCancel={() => setConfirmAction(null)} onConfirm={() => void remove()} isConfirming={isDeleting} confirmingLabel="Đang xóa..." compact />}
    {confirmAction === 'CLONE_WORKFLOW' && <ConfirmDialog title="Chỉ cập nhật quy trình?" description={`Hệ thống sẽ tạo Workflow DRAFT mới và giữ nguyên Form v${definition?.formDefinition?.version ?? ''}.`} confirmLabel="Tạo Workflow mới" onCancel={() => setConfirmAction(null)} onConfirm={() => void cloneVersion('WORKFLOW_ONLY')} isConfirming={isCloning} confirmingLabel="Đang tạo..." />}
    {confirmAction === 'CLONE_PACKAGE' && <ConfirmDialog title="Tạo phiên bản Form + Workflow?" description="Hệ thống sẽ clone Form và toàn bộ BPMN XML thành một cặp DRAFT mới." confirmLabel="Tạo full package" onCancel={() => setConfirmAction(null)} onConfirm={() => void cloneVersion('FULL_PACKAGE')} isConfirming={isCloning} confirmingLabel="Đang tạo..." />}
    {confirmAction === 'PUBLISH' && <ConfirmDialog title={publishMode === 'WORKFLOW_ONLY' ? 'Công bố Workflow mới?' : 'Công bố Form–Workflow?'} description={publishMode === 'WORKFLOW_ONLY' ? 'Workflow BPMN sẽ được kiểm tra lại và thay thế Workflow PUBLISHED hiện tại. Form và version Form được giữ nguyên.' : 'Form và Workflow BPMN sẽ được kiểm tra lại và công bố đồng thời trong một giao dịch.'} confirmLabel="Công bố" onCancel={() => setConfirmAction(null)} onConfirm={() => void publish()} isConfirming={isPublishing} confirmingLabel="Đang công bố..." />}
  </>
}

function initialDraft(formDefinitionId = '', formCode = '', formName = ''): WorkflowDraft {
  return { code: formCode ? `${formCode}_WORKFLOW` : '', name: formName ? `Quy trình ${formName}` : '', description: '', formDefinitionId }
}

function toDraft(definition: WorkflowDefinition): WorkflowDraft {
  return { code: definition.code, name: definition.name, description: definition.description ?? '', formDefinitionId: definition.formDefinitionId }
}

function validateMetadata(draft: WorkflowDraft): string | null {
  if (!/^[A-Z][A-Z0-9_]*$/.test(draft.code.trim().toUpperCase())) return 'Mã Workflow phải bắt đầu bằng chữ in hoa và chỉ gồm A-Z, 0-9 hoặc dấu gạch dưới.'
  if (!draft.name.trim()) return 'Tên Workflow là bắt buộc.'
  if (!draft.formDefinitionId) return 'Hãy chọn Form Definition DRAFT hoặc PUBLISHED cho Workflow.'
  return null
}

function fingerprint(draft: WorkflowDraft): string { return JSON.stringify(draft) }

function toWorkflowIssue(value: unknown): WorkflowGraphValidationError[] {
  if (typeof value !== 'object' || value === null) return []
  const issue = value as Record<string, unknown>
  if (typeof issue.code !== 'string' || typeof issue.path !== 'string' || typeof issue.message !== 'string') return []
  return [{
    code: issue.code,
    path: issue.path,
    message: issue.message,
    ...(typeof issue.stepKey === 'string' ? { stepKey: issue.stepKey } : {}),
    ...(typeof issue.elementId === 'string' ? { elementId: issue.elementId } : {}),
  }]
}
