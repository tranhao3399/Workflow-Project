import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../services/api-client'
import { createJobTitleFromApi, deleteJobTitleFromApi, getJobTitleAuditLogs, getJobTitleByIdFromApi, updateJobTitleFromApi, type JobTitleAuditLog } from '../services/master-data.service'
import type { JobTitleInput } from '../types/master-data'
import { ErrorState, LoadingState } from './DataStates'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { FilterSelect } from './ui/FilterSelect'
import { ActiveStatusBadge } from './ui/MasterDataStatusBadge'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'

interface JobTitleFormProps {
  jobTitleId?: string
  onBack: () => void
  onSaved: () => void
  onDeleted?: () => void
}

type JobTitleField = 'name' | 'code'
type FieldErrors = Partial<Record<JobTitleField, string>>

const initialForm: JobTitleInput = { name: '', code: '', isActive: true }

function validate(form: JobTitleInput): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Tên chức danh là bắt buộc.'
  else if (form.name.trim().length > 120) errors.name = 'Tên chức danh không được vượt quá 120 ký tự.'

  if (!form.code.trim()) errors.code = 'Mã chức danh là bắt buộc.'
  else if (!/^[A-Z0-9_]+$/.test(form.code.trim())) errors.code = 'Mã chỉ gồm A-Z, 0-9 và dấu gạch dưới.'
  else if (form.code.trim().length > 40) errors.code = 'Mã chức danh không được vượt quá 40 ký tự.'
  return errors
}

function auditActorName(log: JobTitleAuditLog): string {
  return log.actor.fullName ?? (log.actor.rolesAtTime?.includes('ADMIN') ? 'Quản trị viên' : 'Người dùng hệ thống')
}

function auditDescription(log: JobTitleAuditLog, jobTitleName: string): string {
  const actor = auditActorName(log)
  if (log.action === 'POSITION.CREATED') return `${actor} đã tạo chức danh ${jobTitleName}.`
  if (log.action === 'POSITION.DEACTIVATED') return `${actor} đã ngưng hoạt động chức danh ${jobTitleName}.`
  return `${actor} đã cập nhật thông tin chức danh ${jobTitleName}.`
}

function auditChangeDetails(log: JobTitleAuditLog): string[] {
  const before = log.changes?.before
  const after = log.changes?.after
  if (!before || !after) return []
  return ([['code', 'Mã chức danh'], ['name', 'Tên chức danh'], ['isActive', 'Trạng thái']] as const).flatMap(([key, label]) => {
    if (before[key] === after[key]) return []
    const displayValue = (value: unknown): string => {
      if (key === 'isActive') return value === true ? 'Hoạt động' : 'Ngưng hoạt động'
      return typeof value === 'string' ? `“${value}”` : 'Chưa cập nhật'
    }
    return [`${label}: ${displayValue(before[key])} → ${displayValue(after[key])}`]
  })
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function JobTitleForm({ jobTitleId, onBack, onSaved, onDeleted }: JobTitleFormProps) {
  const isEdit = Boolean(jobTitleId)
  const [form, setForm] = useState<JobTitleInput>(initialForm)
  const [original, setOriginal] = useState<JobTitleInput>(initialForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<Partial<Record<JobTitleField, boolean>>>({})
  const [isEditing, setIsEditing] = useState(!isEdit)
  const [isLoading, setIsLoading] = useState(isEdit)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [auditLogs, setAuditLogs] = useState<JobTitleAuditLog[]>([])

  const validation = useMemo(() => validate(form), [form])
  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original])
  const isValid = Object.keys(validation).length === 0

  async function load() {
    if (!jobTitleId) return
    setIsLoading(true)
    try {
      const record = await getJobTitleByIdFromApi(jobTitleId)
      const next = { name: record.name, code: record.code, isActive: record.isActive }
      setForm(next)
      setOriginal(next)
      setAuditLogs(await getJobTitleAuditLogs(jobTitleId).catch(() => []))
      setHasLoadError(false)
    } catch {
      setHasLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { if (isEdit) void load() }, [isEdit, jobTitleId])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: isEditing && isDirty }))
    return () => { window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false })) }
  }, [isDirty, isEditing])

  function updateText(field: JobTitleField, value: string) {
    const next = { ...form, [field]: field === 'code' ? value.toUpperCase() : value }
    setForm(next)
    setFormError('')
    if (touched[field]) setErrors((current) => ({ ...current, [field]: validate(next)[field] }))
  }

  function blurField(field: JobTitleField) {
    setTouched((current) => ({ ...current, [field]: true }))
    setErrors((current) => ({ ...current, [field]: validation[field] }))
  }

  function cancelEditing() {
    if (!isEdit) {
      requestBack()
      return
    }
    setForm(original)
    setErrors({})
    setTouched({})
    setFormError('')
    setIsEditing(false)
  }

  function requestBack() {
    if (isEditing && isDirty) setShowLeaveConfirm(true)
    else onBack()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate(form)
    setTouched({ name: true, code: true })
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length > 0 || isSaving) return

    setIsSaving(true)
    try {
      if (isEdit && jobTitleId) {
        await updateJobTitleFromApi(jobTitleId, { code: form.code, name: form.name, isActive: form.isActive })
        const next = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim() }
        setForm(next)
        setOriginal(next)
        setIsEditing(false)
        setAuditLogs(await getJobTitleAuditLogs(jobTitleId).catch(() => auditLogs))
      } else {
        await createJobTitleFromApi(form)
        onSaved()
      }
    } catch (error) {
      if (error instanceof ApiError && (error.field === 'name' || error.field === 'code')) {
        const field = error.field as JobTitleField
        setTouched((current) => ({ ...current, [field]: true }))
        setErrors((current) => ({ ...current, [field]: error.message }))
      } else {
        setFormError(error instanceof Error ? error.message : 'Không thể lưu chức danh. Vui lòng thử lại.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteJobTitle() {
    if (!jobTitleId) return
    setIsSaving(true)
    try {
      await deleteJobTitleFromApi(jobTitleId)
      if (onDeleted) onDeleted()
      else onSaved()
    } catch (error) {
      setShowDeleteConfirm(false)
      setFormError(error instanceof Error ? error.message : 'Không thể xóa chức danh. Vui lòng thử lại.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (hasLoadError) return <ErrorState onRetry={() => void load()} />

  const statusOptions = [{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]
  const title = isEdit ? original.name : 'Tạo chức danh'
  const description = isEdit ? undefined : 'Tạo danh mục chức danh dùng chung cho hệ thống.'
  const breadcrumbLabel = isEdit ? original.name : 'Thêm chức danh'

  const actions = isEdit
    ? isEditing
      ? <><button className="secondary-button compact-button" type="button" disabled={isSaving} onClick={cancelEditing}>Hủy</button><button className="primary-button compact-button" type="submit" form="job-title-form" disabled={!isValid || !isDirty || isSaving}>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></>
      : <><button className="secondary-button compact-button" type="button" onClick={requestBack} disabled={isSaving}>← Quay lại</button><button className="secondary-button compact-button" type="button" onClick={() => setIsEditing(true)} disabled={isSaving}>Chỉnh sửa</button><button className="danger-button compact-button" type="button" onClick={() => setShowDeleteConfirm(true)} disabled={isSaving}>Xóa</button></>
    : <><button className="secondary-button compact-button" type="button" onClick={requestBack} disabled={isSaving}>← Quay lại danh sách</button><button className="primary-button compact-button" type="submit" form="job-title-form" disabled={!isValid || !isDirty || isSaving}>{isSaving ? 'Đang tạo...' : 'Tạo chức danh'}</button></>

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng chức danh"><button className="breadcrumb-link" type="button" onClick={requestBack}>Chức danh</button><span aria-hidden="true">/</span><strong>{breadcrumbLabel}</strong></nav>
    {isEdit ? <section className="department-detail-summary job-title-detail-summary"><div className="department-detail-summary-main"><h1>{title}</h1></div><div className="department-detail-actions">{actions}</div></section> : <PageHeader title={title} description={description} actions={actions} />}
    <SurfaceCard className={isEdit ? 'department-info-card job-title-form-card' : 'job-title-form-card'}>
      <div className={isEdit ? 'department-info-heading' : 'job-title-form-heading'}><h2>Thông tin chức danh</h2></div>
      <form id="job-title-form" className={isEdit ? 'job-title-form job-title-detail-form' : 'job-title-form'} onSubmit={(event) => void submit(event)} noValidate>
        {isEdit && !isEditing ? <div className="job-title-detail-grid"><div><span>Mã chức danh</span><strong>{original.code}</strong></div><div><span>Tên chức danh</span><strong>{original.name}</strong></div><div className="job-title-status-field"><span>Trạng thái</span><ActiveStatusBadge isActive={original.isActive} /></div></div> : <><label className="job-title-form-field"><span>Mã chức danh</span><input value={form.code} onChange={(event) => updateText('code', event.target.value)} onBlur={() => blurField('code')} aria-invalid={Boolean(touched.code && errors.code)} />{touched.code && errors.code && <small className="job-title-form-error">{errors.code}</small>}</label><label className="job-title-form-field"><span>Tên chức danh</span><input value={form.name} onChange={(event) => updateText('name', event.target.value)} onBlur={() => blurField('name')} aria-invalid={Boolean(touched.name && errors.name)} />{touched.name && errors.name && <small className="job-title-form-error">{errors.name}</small>}</label><div className="job-title-form-field job-title-status-field"><span>Trạng thái</span><FilterSelect ariaLabel="Trạng thái chức danh" value={String(form.isActive)} options={statusOptions} onChange={(value) => { setForm((current) => ({ ...current, isActive: value === 'true' })); setFormError('') }} disabled={isSaving} /></div></>}
        {formError && <p className="job-title-form-server-error" role="alert">{formError}</p>}
      </form>
    </SurfaceCard>
    {isEdit && <section className="employee-activity-section job-title-audit-section"><div className="employee-activity-heading"><div><h2>Nhật ký thay đổi</h2></div></div><SurfaceCard className="employee-activity-card">{auditLogs.length === 0 ? <p className="employee-activity-empty">Chưa có nhật ký thay đổi liên quan đến chức danh này.</p> : <div className="employee-activity-list">{auditLogs.map((log) => { const changeDetails = auditChangeDetails(log); return <article className="activity-log-row" key={log._id ?? log.id ?? `${log.occurredAt}-${log.action}`}><div><strong>{auditDescription(log, original.name)}</strong>{changeDetails.length > 0 && <small>{changeDetails.join(' · ')}</small>}</div><time>{dateTime(log.occurredAt)}</time></article> })}</div>}</SurfaceCard></section>}
    {showDeleteConfirm && <ConfirmDialog title="Xóa chức danh?" description="Chức danh sẽ bị xóa vĩnh viễn và không thể khôi phục. Hệ thống chỉ cho phép xóa khi chức danh chưa được gán cho dữ liệu nào." confirmLabel="Xóa chức danh" confirmingLabel="Đang xóa..." tone="danger" onCancel={() => setShowDeleteConfirm(false)} onConfirm={() => void deleteJobTitle()} isConfirming={isSaving} />}
    {showLeaveConfirm && <ConfirmDialog title="Chưa lưu thay đổi" description="Thông tin chức danh đang chỉnh sửa sẽ bị hủy nếu bạn rời khỏi trang." confirmLabel="Rời khỏi trang" tone="danger" onCancel={() => setShowLeaveConfirm(false)} onConfirm={onBack} />}
  </>
}
