import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../services/api-client'
import { createDepartmentFromApi, getActivePositionCatalogFromApi } from '../services/master-data.service'
import type { CreateDepartmentInput, JobTitlePreview } from '../types/master-data'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { FilterSelect } from './ui/FilterSelect'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { DataTable } from './ui/DataTable'

interface DepartmentCreatePageProps {
  onBack: () => void
  onCreated: () => void
}

type DepartmentField = 'name' | 'code'
type DepartmentFieldErrors = Partial<Record<DepartmentField, string>>

const initialForm: CreateDepartmentInput = { name: '', code: '', isActive: true, positionIds: [] }

function validate(form: CreateDepartmentInput): DepartmentFieldErrors {
  const errors: DepartmentFieldErrors = {}
  const name = form.name.trim()
  const code = form.code.trim()

  if (!name) errors.name = 'Tên phòng ban là bắt buộc.'
  else if (name.length > 120) errors.name = 'Tên phòng ban không được vượt quá 120 ký tự.'

  if (!code) errors.code = 'Mã phòng ban là bắt buộc.'
  else if (code.length > 40) errors.code = 'Mã phòng ban không được vượt quá 40 ký tự.'
  else if (!/^[A-Z0-9_]+$/.test(code)) errors.code = 'Mã chỉ gồm A-Z, 0-9 và dấu gạch dưới.'

  return errors
}

export function DepartmentCreatePage({ onBack, onCreated }: DepartmentCreatePageProps) {
  const [form, setForm] = useState<CreateDepartmentInput>(initialForm)
  const [errors, setErrors] = useState<DepartmentFieldErrors>({})
  const [touched, setTouched] = useState<Partial<Record<DepartmentField, boolean>>>({})
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [jobTitles, setJobTitles] = useState<JobTitlePreview[]>([])
  const [isJobTitleDialogOpen, setIsJobTitleDialogOpen] = useState(false)
  const [selectedJobTitleIds, setSelectedJobTitleIds] = useState<string[]>([])
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([])
  const [pendingRemoval, setPendingRemoval] = useState<JobTitlePreview[] | null>(null)
  const [isLoadingJobTitles, setIsLoadingJobTitles] = useState(true)
  const [jobTitlesError, setJobTitlesError] = useState('')
  const dialogCloseRef = useRef<HTMLButtonElement>(null)

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form])
  const validation = useMemo(() => validate(form), [form])
  const isValid = Object.keys(validation).length === 0

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: isDirty }))
    return () => { window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false })) }
  }, [isDirty])

  async function loadJobTitles() {
    setIsLoadingJobTitles(true)
    setJobTitlesError('')
    try {
      setJobTitles(await getActivePositionCatalogFromApi())
    } catch {
      setJobTitlesError('Không thể tải danh sách chức danh đang hoạt động.')
    } finally {
      setIsLoadingJobTitles(false)
    }
  }

  // Initial server synchronization for selectable job titles.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadJobTitles() }, [])
  useEffect(() => {
    if (!isJobTitleDialogOpen) return
    dialogCloseRef.current?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) setIsJobTitleDialogOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isJobTitleDialogOpen, isSaving])

  function updateField(field: DepartmentField, value: string) {
    const nextValue = field === 'code' ? value.toUpperCase() : value
    setForm((current) => ({ ...current, [field]: nextValue }))
    setFormError('')
    if (touched[field]) setErrors((current) => ({ ...current, [field]: validate({ ...form, [field]: nextValue })[field] }))
  }

  function validateOnBlur(field: DepartmentField) {
    setTouched((current) => ({ ...current, [field]: true }))
    setErrors((current) => ({ ...current, [field]: validation[field] }))
  }

  function requestBack() {
    if (isDirty) setShowLeaveConfirm(true)
    else onBack()
  }

  const positions = useMemo(() => jobTitles.filter((item) => form.positionIds?.includes(item.id)), [form.positionIds, jobTitles])
  const availablePositions = useMemo(() => jobTitles.filter((item) => item.isActive && !form.positionIds?.includes(item.id)), [form.positionIds, jobTitles])
  const allAvailableSelected = availablePositions.length > 0 && availablePositions.every((item) => selectedJobTitleIds.includes(item.id))
  const selectedPositions = useMemo(() => positions.filter((position) => selectedPositionIds.includes(position.id)), [positions, selectedPositionIds])
  const allPositionsSelected = positions.length > 0 && positions.every((position) => selectedPositionIds.includes(position.id))

  function openJobTitleDialog() {
    setSelectedJobTitleIds([])
    setIsJobTitleDialogOpen(true)
  }

  function toggleJobTitle(jobTitleId: string) {
    setSelectedJobTitleIds((selected) => selected.includes(jobTitleId) ? selected.filter((id) => id !== jobTitleId) : [...selected, jobTitleId])
  }

  function toggleAllJobTitles() {
    setSelectedJobTitleIds(allAvailableSelected ? [] : availablePositions.map((item) => item.id))
  }

  function togglePosition(positionId: string) {
    setSelectedPositionIds((selected) => selected.includes(positionId) ? selected.filter((id) => id !== positionId) : [...selected, positionId])
  }

  function toggleAllPositions() {
    setSelectedPositionIds(allPositionsSelected ? [] : positions.map((position) => position.id))
  }

  function applyJobTitles() {
    if (selectedJobTitleIds.length === 0) return
    setForm((current) => ({ ...current, positionIds: [...new Set([...(current.positionIds ?? []), ...selectedJobTitleIds])]}))
    setSelectedJobTitleIds([])
    setIsJobTitleDialogOpen(false)
  }

  function removePositions() {
    if (!pendingRemoval?.length) return
    const positionIds = new Set(pendingRemoval.map((position) => position.id))
    setForm((current) => ({ ...current, positionIds: (current.positionIds ?? []).filter((id) => !positionIds.has(id)) }))
    setSelectedPositionIds([])
    setPendingRemoval(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate(form)
    setTouched({ name: true, code: true })
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length > 0) return

    setIsSaving(true)
    try {
      await createDepartmentFromApi({ ...form, name: form.name.trim(), code: form.code.trim().toUpperCase() })
      setSuccessMessage('Đã tạo phòng ban.')
      window.setTimeout(onCreated, 650)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && (error.field === 'name' || error.field === 'code')) {
        const field: DepartmentField = error.field
        setTouched((current) => ({ ...current, [field]: true }))
        setErrors((current) => ({ ...current, [field]: error.message }))
      } else {
        setFormError(error instanceof Error ? error.message : 'Không thể tạo phòng ban. Vui lòng thử lại.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return <>
    <nav className="detail-breadcrumb"><button className="breadcrumb-link" type="button" onClick={requestBack}>Phòng ban</button><span>/</span><strong>Thêm phòng ban</strong></nav>
    <PageHeader title="Tạo phòng ban" description="Tạo danh mục phòng ban mới cho cơ cấu tổ chức." actions={<><button className="secondary-button" type="button" onClick={requestBack} disabled={isSaving}>← Quay lại danh sách</button><button className="primary-button compact-button" type="submit" form="department-create-form" disabled={!isValid || isSaving || Boolean(successMessage)}>{isSaving ? 'Đang tạo...' : 'Tạo phòng ban'}</button></>} />
    <SurfaceCard className="department-create-card">
      <div className="department-create-heading"><h2>Thông tin phòng ban</h2></div>
      <form className="department-create-form" id="department-create-form" onSubmit={(event) => void submit(event)} noValidate>
        <label className="department-create-field"><span className="required-field-label">Mã phòng ban</span><input value={form.code} onChange={(event) => updateField('code', event.target.value)} onBlur={() => validateOnBlur('code')} autoCapitalize="characters" aria-invalid={Boolean(touched.code && errors.code)} aria-describedby={errors.code ? 'department-code-error' : undefined} />{touched.code && errors.code && <small id="department-code-error" className="department-create-error">{errors.code}</small>}</label>
        <label className="department-create-field"><span className="required-field-label">Tên phòng ban</span><input value={form.name} onChange={(event) => updateField('name', event.target.value)} onBlur={() => validateOnBlur('name')} aria-invalid={Boolean(touched.name && errors.name)} aria-describedby={errors.name ? 'department-name-error' : undefined} />{touched.name && errors.name && <small id="department-name-error" className="department-create-error">{errors.name}</small>}</label>
        <label className="department-create-field"><span>Trạng thái</span><FilterSelect ariaLabel="Trạng thái phòng ban" value={String(form.isActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]} onChange={(value) => { setForm((current) => ({ ...current, isActive: value === 'true' })); setFormError('') }} disabled={isSaving} /></label>
        {formError && <p className="department-create-form-error" role="alert">{formError}</p>}
        {successMessage && <p className="department-create-success" role="status">{successMessage}</p>}
      </form>
    </SurfaceCard>
    <SurfaceCard className="department-position-card">
      <div className="detail-tabs" role="tablist"><button className="active" type="button" role="tab" aria-selected="true">Vị trí</button></div>
      <div className="department-position-toolbar"><button className="primary-button compact-button" type="button" onClick={openJobTitleDialog} disabled={isSaving}>+ Thêm vị trí</button>{selectedPositions.length > 0 && <button className="secondary-button compact-button department-position-delete-button" type="button" onClick={() => setPendingRemoval(selectedPositions)} disabled={isSaving}>Xóa ({selectedPositions.length})</button>}</div>
      {positions.length === 0 ? <p className="department-position-empty">Chưa có vị trí nào.</p> : <DataTable className="admin-table department-position-table"><thead><tr><th className="department-position-select"><input type="checkbox" aria-label="Chọn tất cả vị trí" checked={allPositionsSelected} onChange={toggleAllPositions} disabled={isSaving} /></th><th className="department-position-number">#</th><th>Mã vị trí</th><th>Tên vị trí</th></tr></thead><tbody>{positions.map((position, index) => <tr key={position.id} className={selectedPositionIds.includes(position.id) ? 'is-selected' : ''}><td className="department-position-select"><input type="checkbox" aria-label={`Chọn ${position.name}`} checked={selectedPositionIds.includes(position.id)} onChange={() => togglePosition(position.id)} disabled={isSaving} /></td><td className="department-position-number">{index + 1}</td><td><span className="master-secondary-text">{position.code}</span></td><td><strong className="master-primary-text">{position.name}</strong></td></tr>)}</tbody></DataTable>}
    </SurfaceCard>
    {isJobTitleDialogOpen && <div className="modal-backdrop department-job-title-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsJobTitleDialogOpen(false) }}><section className="modal-panel department-job-title-modal" role="dialog" aria-modal="true" aria-labelledby="department-job-title-dialog-title"><header className="modal-header"><div><h2 id="department-job-title-dialog-title">Thêm vị trí</h2></div><button className="icon-button" ref={dialogCloseRef} type="button" aria-label="Đóng hộp thoại" onClick={() => setIsJobTitleDialogOpen(false)} disabled={isSaving}>×</button></header><div className="department-job-title-modal-content">{isLoadingJobTitles ? <p className="department-job-title-modal-empty">Đang tải vị trí...</p> : jobTitlesError ? <p className="department-job-title-modal-empty">{jobTitlesError} <button className="text-button" type="button" onClick={() => void loadJobTitles()}>Thử lại</button></p> : availablePositions.length === 0 ? <p className="department-job-title-modal-empty">Tất cả vị trí đang hoạt động đã có trong phòng ban này.</p> : <DataTable className="department-job-title-selection-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả vị trí" checked={allAvailableSelected} onChange={toggleAllJobTitles} disabled={isSaving} /></th><th>Mã vị trí</th><th>Tên vị trí</th></tr></thead><tbody>{availablePositions.map((jobTitle) => <tr key={jobTitle.id} className={selectedJobTitleIds.includes(jobTitle.id) ? 'is-selected' : ''}><td><input type="checkbox" aria-label={`Chọn ${jobTitle.name}`} checked={selectedJobTitleIds.includes(jobTitle.id)} onChange={() => toggleJobTitle(jobTitle.id)} disabled={isSaving} /></td><td><span>{jobTitle.code}</span></td><td><strong>{jobTitle.name}</strong></td></tr>)}</tbody></DataTable>}</div><footer className="modal-actions"><button className="secondary-button" type="button" onClick={() => setIsJobTitleDialogOpen(false)} disabled={isSaving}>Hủy</button><button className="primary-button" type="button" onClick={applyJobTitles} disabled={selectedJobTitleIds.length === 0 || isSaving}>Áp dụng{selectedJobTitleIds.length ? ` (${selectedJobTitleIds.length})` : ''}</button></footer></section></div>}
    {showLeaveConfirm && <ConfirmDialog title="Chưa lưu thay đổi" description="Thông tin phòng ban đang nhập sẽ bị hủy nếu bạn rời khỏi trang." confirmLabel="Rời khỏi trang" tone="danger" onCancel={() => setShowLeaveConfirm(false)} onConfirm={onBack} />}
    {pendingRemoval && <ConfirmDialog title={`Xóa ${pendingRemoval.length} vị trí?`} description="Các vị trí được chọn sẽ không được thêm vào phòng ban này. Danh mục chức danh không bị thay đổi." confirmLabel={`Xóa (${pendingRemoval.length})`} tone="danger" onCancel={() => setPendingRemoval(null)} onConfirm={removePositions} />}
  </>
}
