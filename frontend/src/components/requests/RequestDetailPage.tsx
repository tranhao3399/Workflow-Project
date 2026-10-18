import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelRequest,
  deleteRequest,
  getRequest,
  getRequestHistory,
  recreateRequestFromDraft,
  resubmitRequest,
  submitRequest,
  updateRequest,
  voidRequest,
} from '../../services/requests.service'
import { approveTask, getApprovalTask, rejectTask, requestTaskRevision } from '../../services/approvals.service'
import { ApiError } from '../../services/api-client'
import {
  approvalTaskStatus,
  requestStatus,
  type ApprovalHistory,
  type ApprovalTask,
  type DraftMigrationReviewItem,
  type Request as RequestRecord,
} from '../../types/workflow'
import { isApiErrorCode } from '../../utils/api-errors'
import { notifyRequestMutation } from '../../utils/request-events'
import { DynamicFormRenderer, type DynamicFormRendererHandle } from '../dynamic-form'
import { ErrorState, LoadingState, PermissionDeniedState } from '../DataStates'
import { ApprovalTaskStatusBadge, RequestStatusBadge } from '../StatusBadge'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'

interface RequestDetailPageProps {
  requestId: string
  currentUserId: string
  taskId?: string
  onBack: () => void
  onDeleted: () => void
  onOpenRequest: (requestId: string) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

type ConfirmAction = 'cancel' | 'void' | 'delete'
type DecisionAction = 'approve' | 'reject' | 'revision'
type AccessError = 'forbidden' | 'not-found' | 'general' | null

const historyLabels: Record<ApprovalHistory['action'], string> = {
  CREATED: 'Tạo phiếu nháp',
  SUBMITTED: 'Gửi phiếu',
  ASSIGNED: 'Giao phê duyệt',
  CONDITION_EVALUATED: 'Đánh giá điều kiện',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
  REVISION_REQUESTED: 'Yêu cầu bổ sung',
  REASSIGNED: 'Chuyển người phê duyệt',
  RESUBMITTED: 'Gửi lại phiếu',
  CANCELLED: 'Đã hủy',
  VOIDED: 'Đã vô hiệu hóa',
  AUTO_SKIPPED: 'Tự động bỏ qua',
  COMPLETED: 'Hoàn tất quy trình',
}

export function RequestDetailPage({ requestId, currentUserId, taskId, onBack, onDeleted, onOpenRequest, onNotify }: RequestDetailPageProps) {
  const rendererRef = useRef<DynamicFormRendererHandle>(null)
  const [request, setRequest] = useState<RequestRecord | null>(null)
  const [history, setHistory] = useState<ApprovalHistory[]>([])
  const [approvalTask, setApprovalTask] = useState<ApprovalTask | null>(null)
  const [title, setTitle] = useState('')
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [savedFingerprint, setSavedFingerprint] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [accessError, setAccessError] = useState<AccessError>(null)
  const [mutation, setMutation] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [reason, setReason] = useState('')
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null)
  const [decisionComment, setDecisionComment] = useState('')
  const [migrationReview] = useState<DraftMigrationReviewItem[]>(() => readMigrationReview(requestId))

  const fingerprint = useMemo(() => JSON.stringify({ title: title.trim(), formData }), [formData, title])
  const isDirty = Boolean(request?.availableActions.canEdit && savedFingerprint && fingerprint !== savedFingerprint)

  const applyRequest = useCallback((nextRequest: RequestRecord) => {
    const nextTitle = nextRequest.title ?? ''
    const nextData = nextRequest.formData ?? {}
    setRequest(nextRequest)
    setTitle(nextTitle)
    setFormData(nextData)
    setSavedFingerprint(JSON.stringify({ title: nextTitle.trim(), formData: nextData }))
  }, [])

  const fetchBundle = useCallback(async () => {
    const [nextRequest, nextHistory] = await Promise.all([
      getRequest(requestId),
      getRequestHistory(requestId),
    ])
    let nextTask: ApprovalTask | null = null
    const contextualTaskId = taskId ?? nextRequest.currentApprovalTaskId
    if (contextualTaskId) {
      try {
        nextTask = await getApprovalTask(contextualTaskId)
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error
      }
    }
    return { nextRequest, nextHistory, nextTask }
  }, [requestId, taskId])

  const applyBundle = useCallback((bundle: { nextRequest: RequestRecord; nextHistory: ApprovalHistory[]; nextTask: ApprovalTask | null }) => {
    applyRequest(bundle.nextRequest)
    setHistory(bundle.nextHistory)
    setApprovalTask(bundle.nextTask)
  }, [applyRequest])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      applyBundle(await fetchBundle())
      setAccessError(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setAccessError('forbidden')
      else if (error instanceof ApiError && error.status === 404) setAccessError('not-found')
      else setAccessError('general')
    } finally {
      setIsLoading(false)
    }
  }, [applyBundle, fetchBundle])

  // Route changes intentionally synchronize the detail state with the API.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: isDirty }))
    return () => { window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false })) }
  }, [isDirty])

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [isDirty])

  function navigateBack() {
    if (!isDirty) return onBack()
    window.dispatchEvent(new CustomEvent('workflow:navigate-request', { detail: { onConfirm: onBack } }))
  }

  async function refreshAfterMutation(message: string) {
    applyBundle(await fetchBundle())
    notifyRequestMutation(requestId)
    onNotify(message)
  }

  async function refreshAfterDecisionConflict(message: string) {
    setDecisionAction(null)
    setDecisionComment('')
    try {
      applyBundle(await fetchBundle())
      notifyRequestMutation(requestId)
    } catch {
      // Preserve the conflict message even if the follow-up refresh also fails.
    } finally {
      onNotify(message, 'error')
    }
  }

  function showMutationError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 409) {
      onNotify(error.message || 'Dữ liệu vừa được thay đổi ở nơi khác. Hãy tải lại và thử lại.', 'error')
      return
    }
    if (error instanceof ApiError && error.status === 403) {
      onNotify('Bạn không còn quyền thực hiện thao tác này.', 'error')
      return
    }
    if (error instanceof ApiError && error.status === 404) {
      onNotify('Phiếu không còn tồn tại hoặc bạn không có quyền truy cập.', 'error')
      return
    }
    onNotify(error instanceof Error ? error.message : fallback, 'error')
  }

  async function saveDraft(showSuccess = true): Promise<boolean> {
    if (!request || mutation) return false
    if (!title.trim()) {
      onNotify('Tiêu đề phiếu là bắt buộc.', 'error')
      return false
    }
    setMutation('save')
    try {
      const updated = await updateRequest(request.id, { title: title.trim(), formData })
      applyRequest(updated)
      notifyRequestMutation(request.id)
      if (showSuccess) onNotify('Lưu phiếu nháp thành công.')
      return true
    } catch (error) {
      showMutationError(error, 'Không thể lưu phiếu nháp.')
      return false
    } finally {
      setMutation(null)
    }
  }

  async function send(action: 'submit' | 'resubmit') {
    if (!request || mutation) return
    const validation = rendererRef.current?.validate()
    if (validation && !validation.valid) {
      onNotify('Vui lòng kiểm tra các trường thông tin chưa hợp lệ.', 'error')
      return
    }
    if (!title.trim()) {
      onNotify('Tiêu đề phiếu là bắt buộc.', 'error')
      return
    }
    setMutation(action)
    try {
      if (isDirty) {
        const updated = await updateRequest(request.id, { title: title.trim(), formData })
        applyRequest(updated)
        notifyRequestMutation(request.id)
      }
      if (action === 'submit') await submitRequest(request.id)
      else await resubmitRequest(request.id)
      await refreshAfterMutation(action === 'submit' ? 'Gửi phiếu thành công.' : 'Gửi lại phiếu thành công.')
    } catch (error) {
      showMutationError(error, action === 'submit' ? 'Không thể gửi phiếu.' : 'Không thể gửi lại phiếu.')
    } finally {
      setMutation(null)
    }
  }

  async function recreateDraft() {
    if (!request || mutation || !request.availableActions.canRecreate) return
    setMutation('recreate')
    try {
      const result = await recreateRequestFromDraft(request.id)
      try {
        sessionStorage.setItem(migrationReviewKey(result.request.id), JSON.stringify(result.migration.reviewItems))
      } catch {
        // Navigation must still succeed when browser storage is unavailable.
      }
      notifyRequestMutation(request.id)
      notifyRequestMutation(result.request.id)
      onNotify('Đã tạo phiếu mới từ phiên bản hiện hành. Vui lòng kiểm tra dữ liệu trước khi gửi.')
      onOpenRequest(result.request.id)
    } catch (error) {
      showMutationError(error, 'Không thể tạo phiếu mới từ bản nháp này.')
      try {
        applyBundle(await fetchBundle())
      } catch {
        // Keep the actionable API error when refreshing also fails.
      }
    } finally {
      setMutation(null)
    }
  }

  async function confirmCloseAction() {
    if (!request || !confirmAction || mutation) return
    if (confirmAction !== 'delete' && !reason.trim()) return
    const action = confirmAction
    setMutation(action)
    try {
      if (action === 'delete') {
        await deleteRequest(request.id)
        notifyRequestMutation(request.id)
        setConfirmAction(null)
        onNotify('Xóa phiếu nháp thành công.')
        onDeleted()
        return
      }
      if (action === 'cancel') await cancelRequest(request.id, reason.trim())
      else await voidRequest(request.id, reason.trim())
      setConfirmAction(null)
      setReason('')
      await refreshAfterMutation(action === 'cancel' ? 'Hủy phiếu thành công.' : 'Vô hiệu hóa phiếu thành công.')
    } catch (error) {
      showMutationError(error, 'Không thể cập nhật phiếu.')
    } finally {
      setMutation(null)
    }
  }

  async function confirmDecision() {
    if (!request || !approvalTask || !decisionAction || mutation) return
    if (decisionAction !== 'approve' && !decisionComment.trim()) return
    const action = decisionAction
    setMutation(`decision-${action}`)
    try {
      if (action === 'approve') await approveTask(approvalTask.id, decisionComment.trim() || undefined)
      else if (action === 'reject') await rejectTask(approvalTask.id, decisionComment.trim())
      else await requestTaskRevision(approvalTask.id, decisionComment.trim())
      setDecisionAction(null)
      setDecisionComment('')
      const message = action === 'approve'
        ? 'Phê duyệt phiếu thành công.'
        : action === 'reject'
          ? 'Từ chối phiếu thành công.'
          : 'Đã gửi yêu cầu bổ sung thông tin.'
      await refreshAfterMutation(message)
    } catch (error) {
      if (isApiErrorCode(error, 'TASK_ALREADY_PROCESSED') || (error instanceof ApiError && error.status === 409)) {
        await refreshAfterDecisionConflict('Task đã được xử lý hoặc vừa thay đổi. Dữ liệu đã được tải lại.')
      } else {
        showMutationError(error, 'Không thể xử lý task phê duyệt.')
      }
    } finally {
      setMutation(null)
    }
  }

  if (isLoading) return <LoadingState />
  if (accessError === 'forbidden') return <PermissionDeniedState />
  if (accessError === 'not-found') return <RequestNotFound onBack={onBack} />
  if (accessError || !request) return <ErrorState onRetry={() => void load()} />

  const editable = request.availableActions.canEdit
  const latestRevision = [...history].reverse().find((item) => item.action === 'REVISION_REQUESTED')
  const formName = request.formSnapshot?.name ?? request.form?.name ?? `Form v${request.formVersion}`
  const ownsPendingTask = approvalTask?.status === approvalTaskStatus.pending
    && approvalTask.assigneeUserId === currentUserId
    && approvalTask.id === request.currentApprovalTaskId
  const canApprove = Boolean(ownsPendingTask && request.availableActions.canApprove && approvalTask.availableActions?.canApprove)
  const canReject = Boolean(ownsPendingTask && request.availableActions.canReject && approvalTask.availableActions?.canReject)
  const canRequestRevision = Boolean(ownsPendingTask && request.availableActions.canRequestRevision && approvalTask.availableActions?.canRequestRevision)

  return <>
    <PageHeader
      title={request.requestNo}
      description={`${formName} · ${request.requesterSnapshot.fullName}`}
      actions={<button className="secondary-button" type="button" onClick={navigateBack}>← Quay lại</button>}
    />

    <SurfaceCard className="request-detail-summary">
      <div><span>Trạng thái</span><RequestStatusBadge status={request.status} /></div>
      <div><span>Bước hiện tại</span><strong>{request.currentStepName || request.currentStepKey || '—'}</strong></div>
      <div><span>Ngày tạo</span><strong>{formatDateTime(request.createdAt)}</strong></div>
      <div><span>Cập nhật</span><strong>{formatDateTime(request.updatedAt)}</strong></div>
    </SurfaceCard>

    {request.definitionVersion.status === 'OUTDATED' && (
      <section className="request-version-callout" role="alert">
        <div>
          <strong>Phiếu nháp đang dùng phiên bản cũ</strong>
          <p>Form hoặc Workflow của phiếu này không còn được phát hành. Bạn vẫn có thể xem hoặc xóa nháp, nhưng không thể sửa hay gửi nháp này.</p>
          {request.definitionVersion.currentForm && request.definitionVersion.currentWorkflow
            ? <span>Hiện hành: {request.definitionVersion.currentForm.name} v{request.definitionVersion.currentForm.version} · Workflow v{request.definitionVersion.currentWorkflow.version}</span>
            : <span>Hiện chưa có cặp Form–Workflow PUBLISHED thay thế.</span>}
        </div>
        {request.availableActions.canRecreate && <button className="primary-button" type="button" disabled={Boolean(mutation)} onClick={() => void recreateDraft()}>{mutation === 'recreate' ? 'Đang tạo...' : 'Tạo phiếu mới từ nháp cũ'}</button>}
      </section>
    )}

    {migrationReview.length > 0 && (
      <section className="request-migration-callout" role="status">
        <strong>Dữ liệu cần kiểm tra lại</strong>
        <p>Một số trường không thể sao chép tự động từ nháp cũ. Hãy bổ sung trước khi gửi phiếu.</p>
        <ul>{migrationReview.map((item) => <li key={`${item.fieldKey}:${item.reason}`}><b>{item.label}</b><span>{item.message}</span></li>)}</ul>
      </section>
    )}

    {approvalTask && <section className="approval-task-context" aria-label="Task phê duyệt đang xem"><div><span>Task phê duyệt</span><strong>{approvalTask.stepName}</strong></div><div><span>Vòng xử lý</span><strong>Vòng bổ sung {approvalTask.revisionRound} · Lần chạy {approvalTask.stepRunNo}</strong></div><div><span>Hạn xử lý</span><strong>{approvalTask.dueAt ? formatDateTime(approvalTask.dueAt) : 'Không có hạn'}</strong></div><div><ApprovalTaskStatusBadge status={approvalTask.status} />{approvalTask.isOverdue && <span className="approval-overdue-badge">Quá hạn</span>}</div></section>}

    {request.status === requestStatus.revisionRequested && latestRevision && (
      <section className="request-revision-callout" role="status">
        <strong>Phiếu cần được bổ sung</strong>
        <p>{latestRevision.comment || 'Người phê duyệt yêu cầu cập nhật lại thông tin trên phiếu.'}</p>
        <span>{actorName(latestRevision)} · {formatDateTime(latestRevision.occurredAt)}</span>
      </section>
    )}

    <div className="request-detail-layout">
      <SurfaceCard className="request-detail-form-card">
        <header className="request-section-heading"><div><h2>Thông tin yêu cầu</h2><p>Dữ liệu được hiển thị theo phiên bản biểu mẫu đã lưu cùng phiếu.</p></div></header>
        <label className="request-title-field"><span>Tiêu đề <b aria-hidden="true">*</b></span>{editable ? <input value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} /> : <strong>{request.title}</strong>}</label>
        <DynamicFormRenderer
          ref={rendererRef}
          formSnapshot={request.formSnapshot}
          initialValues={request.formData}
          mode={editable ? 'edit' : 'readonly'}
          requestId={request.id}
          allowFileDelete={editable}
          onChange={setFormData}
        />
      </SurfaceCard>

      <SurfaceCard className="request-history-card">
        <header className="request-section-heading"><div><h2>Lịch sử xử lý</h2><p>{history.length} hoạt động</p></div></header>
        {history.length === 0 ? <p className="request-history-empty">Chưa có lịch sử xử lý.</p> : <ol className="request-timeline">{history.map((item) => <li key={item._id} className={item.action === 'REVISION_REQUESTED' ? 'is-revision' : ''}>
          <span className="request-timeline-marker" aria-hidden="true" />
          <div><strong>{historyLabels[item.action]}</strong><time>{formatDateTime(item.occurredAt)}</time>{(historyRevisionRound(item) !== undefined || item.stepRunNo !== undefined) && <span className="request-history-cycle">Vòng bổ sung {historyRevisionRound(item) ?? 0} · Lần chạy bước {item.stepRunNo ?? '—'}</span>}{item.actorSnapshot && <span>{actorName(item)}</span>}{item.comment && <p>{item.comment}</p>}</div>
        </li>)}</ol>}
      </SurfaceCard>
    </div>

    <div className="request-action-bar" aria-label="Thao tác phiếu">
      <div><strong>{request.requestNo}</strong><span>{isDirty ? 'Có thay đổi chưa lưu' : 'Dữ liệu đã được đồng bộ'}</span></div>
      <div className="request-action-buttons">
        {canRequestRevision && <button className="secondary-button" type="button" disabled={Boolean(mutation)} onClick={() => { setDecisionComment(''); setDecisionAction('revision') }}>Yêu cầu bổ sung</button>}
        {canReject && <button className="danger-button" type="button" disabled={Boolean(mutation)} onClick={() => { setDecisionComment(''); setDecisionAction('reject') }}>Từ chối</button>}
        {canApprove && <button className="primary-button" type="button" disabled={Boolean(mutation)} onClick={() => { setDecisionComment(''); setDecisionAction('approve') }}>Phê duyệt</button>}
        {request.availableActions.canDelete && <button className="danger-button" type="button" disabled={Boolean(mutation)} onClick={() => { setReason(''); setConfirmAction('delete') }}>Xóa phiếu nháp</button>}
        {request.availableActions.canCancel && <button className="secondary-button" type="button" disabled={Boolean(mutation)} onClick={() => { setReason(''); setConfirmAction('cancel') }}>Hủy phiếu</button>}
        {request.availableActions.canVoid && <button className="danger-button" type="button" disabled={Boolean(mutation)} onClick={() => { setReason(''); setConfirmAction('void') }}>Vô hiệu hóa</button>}
        {editable && <button className="secondary-button" type="button" disabled={Boolean(mutation) || !isDirty} onClick={() => void saveDraft()}>{mutation === 'save' ? 'Đang lưu...' : 'Lưu nháp'}</button>}
        {request.availableActions.canSubmit && <button className="primary-button" type="button" disabled={Boolean(mutation)} onClick={() => void send('submit')}>{mutation === 'submit' ? 'Đang gửi...' : 'Gửi phiếu'}</button>}
        {request.availableActions.canResubmit && <button className="primary-button" type="button" disabled={Boolean(mutation)} onClick={() => void send('resubmit')}>{mutation === 'resubmit' ? 'Đang gửi...' : 'Gửi lại phiếu'}</button>}
      </div>
    </div>

    {confirmAction && <ConfirmDialog
      title={confirmTitle(confirmAction)}
      description={confirmDescription(confirmAction)}
      confirmLabel={confirmLabel(confirmAction)}
      tone="danger"
      isConfirming={mutation === confirmAction}
      confirmDisabled={confirmAction !== 'delete' && !reason.trim()}
      onCancel={() => { if (!mutation) { setConfirmAction(null); setReason('') } }}
      onConfirm={() => void confirmCloseAction()}
    >{confirmAction !== 'delete' && <label className="request-reason-field"><span>Lý do <b aria-hidden="true">*</b></span><textarea rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus /></label>}</ConfirmDialog>}

    {decisionAction && <ConfirmDialog
      title={decisionTitle(decisionAction)}
      description={decisionDescription(decisionAction)}
      confirmLabel={decisionLabel(decisionAction)}
      tone={decisionAction === 'reject' ? 'danger' : 'primary'}
      isConfirming={mutation === `decision-${decisionAction}`}
      confirmDisabled={decisionAction !== 'approve' && !decisionComment.trim()}
      onCancel={() => { if (!mutation) { setDecisionAction(null); setDecisionComment('') } }}
      onConfirm={() => void confirmDecision()}
    ><label className="request-reason-field"><span>{decisionAction === 'approve' ? 'Ghi chú (không bắt buộc)' : decisionAction === 'reject' ? 'Lý do từ chối' : 'Nội dung cần bổ sung'} {decisionAction !== 'approve' && <b aria-hidden="true">*</b>}</span><textarea rows={4} maxLength={2000} value={decisionComment} onChange={(event) => setDecisionComment(event.target.value)} autoFocus /></label></ConfirmDialog>}
  </>
}

function RequestNotFound({ onBack }: { onBack: () => void }) {
  return <section className="data-state error-state" role="alert"><p className="state-kicker">KHÔNG TÌM THẤY PHIẾU</p><h2>Phiếu không tồn tại hoặc bạn không có quyền xem.</h2><p>Kiểm tra lại đường dẫn hoặc quay về danh sách phiếu của bạn.</p><button className="secondary-button" type="button" onClick={onBack}>Quay lại danh sách</button></section>
}

function actorName(item: ApprovalHistory): string {
  return item.actorSnapshot?.fullName || 'Hệ thống'
}

function historyRevisionRound(item: ApprovalHistory): number | undefined {
  if (item.revisionRound !== undefined) return item.revisionRound
  const value = item.metadata?.revisionRound
  return typeof value === 'number' ? value : undefined
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function confirmTitle(action: ConfirmAction): string {
  if (action === 'delete') return 'Xóa phiếu nháp?'
  if (action === 'void') return 'Vô hiệu hóa phiếu?'
  return 'Hủy phiếu?'
}

function confirmDescription(action: ConfirmAction): string {
  if (action === 'delete') return 'Phiếu nháp sẽ bị xóa vĩnh viễn và không thể khôi phục.'
  if (action === 'void') return 'Phiếu sẽ dừng xử lý và được ghi nhận là đã vô hiệu hóa.'
  return 'Phiếu sẽ dừng quy trình xử lý hiện tại.'
}

function confirmLabel(action: ConfirmAction): string {
  if (action === 'delete') return 'Xóa phiếu'
  if (action === 'void') return 'Vô hiệu hóa'
  return 'Hủy phiếu'
}

function decisionTitle(action: DecisionAction): string {
  if (action === 'approve') return 'Phê duyệt phiếu?'
  if (action === 'reject') return 'Từ chối phiếu?'
  return 'Yêu cầu bổ sung thông tin?'
}

function decisionDescription(action: DecisionAction): string {
  if (action === 'approve') return 'Xác nhận hoàn tất phần xử lý của bạn tại bước hiện tại.'
  if (action === 'reject') return 'Phiếu sẽ đi theo nhánh từ chối của quy trình.'
  return 'Phiếu sẽ được trả về cho người gửi để cập nhật nội dung.'
}

function decisionLabel(action: DecisionAction): string {
  if (action === 'approve') return 'Xác nhận phê duyệt'
  if (action === 'reject') return 'Xác nhận từ chối'
  return 'Gửi yêu cầu bổ sung'
}

function migrationReviewKey(requestId: string): string {
  return `workflow:request-migration-review:${requestId}`
}

function readMigrationReview(requestId: string): DraftMigrationReviewItem[] {
  const key = migrationReviewKey(requestId)
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return []
    sessionStorage.removeItem(key)
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter((item): item is DraftMigrationReviewItem => (
      typeof item === 'object'
      && item !== null
      && 'fieldKey' in item
      && typeof item.fieldKey === 'string'
      && 'label' in item
      && typeof item.label === 'string'
      && 'reason' in item
      && typeof item.reason === 'string'
      && 'message' in item
      && typeof item.message === 'string'
    ))
  } catch {
    return []
  }
}
