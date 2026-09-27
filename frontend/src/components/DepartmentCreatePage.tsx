import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../services/api-client'
import { createDepartmentFromApi, getActivePositionCatalogFromApi } from '../services/master-data.service'
import type { CreateDepartmentInput, JobTitlePreview } from '../types/master-data'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { FilterSelect } from './ui/FilterSelect'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'

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
  const [selectedPositionId, setSelectedPositionId] = useState('')
  const [isLoadingJobTitles, setIsLoadingJobTitles] = useState(true)
  const [jobTitlesError, setJobTitlesError] = useState('')

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

  useEffect(() => { void loadJobTitles() }, [])

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

  const assignedPositions = useMemo(() => jobTitles.filter((item) => form.positionIds?.includes(item.id)), [form.positionIds, jobTitles])
  const availablePositions = useMemo(() => jobTitles.filter((item) => !form.positionIds?.includes(item.id)), [form.positionIds, jobTitles])

  function assignPosition() {
    if (!selectedPositionId) return
    setForm((current) => ({ ...current, positionIds: [...(current.positionIds ?? []), selectedPositionId] }))
    setSelectedPositionId('')
    setFormError('')
  }

  function removePosition(positionId: string) {
    setForm((current) => ({ ...current, positionIds: (current.positionIds ?? []).filter((id) => id !== positionId) }))
    setFormError('')
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
        <label className="department-create-field"><span>Mã phòng ban</span><input value={form.code} onChange={(event) => updateField('code', event.target.value)} onBlur={() => validateOnBlur('code')} autoCapitalize="characters" aria-invalid={Boolean(touched.code && errors.code)} aria-describedby={errors.code ? 'department-code-error' : undefined} />{touched.code && errors.code && <small id="department-code-error" className="department-create-error">{errors.code}</small>}</label>
        <label className="department-create-field"><span>Tên phòng ban</span><input value={form.name} onChange={(event) => updateField('name', event.target.value)} onBlur={() => validateOnBlur('name')} aria-invalid={Boolean(touched.name && errors.name)} aria-describedby={errors.name ? 'department-name-error' : undefined} />{touched.name && errors.name && <small id="department-name-error" className="department-create-error">{errors.name}</small>}</label>
        <label className="department-create-field"><span>Trạng thái</span><FilterSelect ariaLabel="Trạng thái phòng ban" value={String(form.isActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]} onChange={(value) => { setForm((current) => ({ ...current, isActive: value === 'true' })); setFormError('') }} disabled={isSaving} /></label>
        {formError && <p className="department-create-form-error" role="alert">{formError}</p>}
        {successMessage && <p className="department-create-success" role="status">{successMessage}</p>}
      </form>
    </SurfaceCard>
    <SurfaceCard className="department-create-card department-create-positions-card">
      <div className="department-create-heading"><div><h2>Gán vị trí</h2><p>Chọn các chức danh được phép tồn tại trong phòng ban này.</p></div></div>
      <div className="department-create-position-picker">
        <div className="department-create-position-select"><span>Chức danh</span>{isLoadingJobTitles ? <p>Đang tải chức danh...</p> : jobTitlesError ? <div className="department-create-position-load-error"><span>{jobTitlesError}</span><button className="text-button" type="button" onClick={() => void loadJobTitles()}>Thử lại</button></div> : <FilterSelect ariaLabel="Chọn chức danh để gán" value={selectedPositionId} options={[{ value: '', label: availablePositions.length ? 'Chọn chức danh' : 'Không còn chức danh khả dụng' }, ...availablePositions.map((item) => ({ value: item.id, label: `${item.name} · ${item.code}` }))]} onChange={setSelectedPositionId} disabled={availablePositions.length === 0 || isSaving} />}</div>
        <button className="secondary-button compact-button" type="button" onClick={assignPosition} disabled={!selectedPositionId || isSaving}>+ Gán vị trí</button>
      </div>
      {assignedPositions.length === 0 ? <p className="department-create-position-empty">Chưa có chức danh nào được gán. Bạn có thể tiếp tục tạo phòng ban mà không gán vị trí.</p> : <ul className="department-create-position-list" aria-label="Các chức danh đã gán">{assignedPositions.map((position) => <li key={position.id}><span><strong>{position.name}</strong><small>{position.code}</small></span><button type="button" className="icon-button" aria-label={`Gỡ ${position.name}`} onClick={() => removePosition(position.id)} disabled={isSaving}>×</button></li>)}</ul>}
    </SurfaceCard>
    {showLeaveConfirm && <ConfirmDialog title="Chưa lưu thay đổi" description="Thông tin phòng ban đang nhập sẽ bị hủy nếu bạn rời khỏi trang." confirmLabel="Rời khỏi trang" tone="danger" onCancel={() => setShowLeaveConfirm(false)} onConfirm={onBack} />}
  </>
}
