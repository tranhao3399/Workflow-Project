import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createEmployee, getActiveEmployeeOptions, getNextEmployeeCode, uploadEmployeeAvatar } from '../services/employees.service'
import { ApiError } from '../services/api-client'
import { getDepartmentPositionsFromApi } from '../services/master-data.service'
import { getReferenceData } from '../services/reference-data.service'
import type { Employee, EmployeeFormValues, EmploymentType } from '../types/employees'
import type { JobTitlePreview } from '../types/master-data'
import type { ReferenceData } from '../types/reference-data'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { DatePicker } from './ui/DatePicker'
import { FilterSelect } from './ui/FilterSelect'
import { ProfileField } from './ui/ProfileField'
import { SurfaceCard } from './ui/SurfaceCard'

interface NewEmployeePageProps {
  onBack: () => void
  onCreated: () => void
}

interface EmployeeFieldErrors {
  fullName?: string
  workEmail?: string
  departmentId?: string
  positionId?: string
}

type EmployeeRequiredField = keyof EmployeeFieldErrors

type EmployeeCreateTab = 'OVERVIEW' | 'ORGANIZATION'

const initialForm: EmployeeFormValues = {
  employeeCode: '',
  fullName: '',
  workEmail: '',
  department: '',
  position: '',
  employmentType: 'FULL_TIME',
  isActive: true,
}

function validateEmployee(form: EmployeeFormValues): EmployeeFieldErrors {
  const email = form.workEmail.trim()
  return {
    fullName: form.fullName.trim() ? undefined : 'Họ và tên không được để trống.',
    workEmail: !email
      ? 'Email không được để trống.'
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? undefined
        : 'Email không hợp lệ.',
    departmentId: form.departmentId ? undefined : 'Phòng ban không được để trống.',
    positionId: form.positionId ? undefined : 'Chức danh không được để trống.',
  }
}

export function NewEmployeePage({ onBack, onCreated }: NewEmployeePageProps) {
  const [form, setForm] = useState<EmployeeFormValues>(initialForm)
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null)
  const [people, setPeople] = useState<Employee[]>([])
  const [departmentPositions, setDepartmentPositions] = useState<JobTitlePreview[]>([])
  const [isLoadingPositions, setIsLoadingPositions] = useState(false)
  const [positionLoadError, setPositionLoadError] = useState('')
  const [touched, setTouched] = useState<Partial<Record<EmployeeRequiredField, boolean>>>({})
  const [emailConflict, setEmailConflict] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState<EmployeeCreateTab>('OVERVIEW')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([getReferenceData(), getActiveEmployeeOptions()])
      .then(([referenceResult, activePeople]) => {
        setReferenceData(referenceResult.data)
        setPeople(activePeople)
      })
      .catch(() => setError('Không thể tải dữ liệu nhân viên. Vui lòng thử lại.'))
  }, [])

  useEffect(() => {
    void getNextEmployeeCode()
      .then((employeeCode) => setForm((current) => ({ ...current, employeeCode })))
      .catch(() => setError('Không thể tạo mã nhân viên. Vui lòng tải lại trang.'))
  }, [])

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  useEffect(() => {
    if (!error) return
    const timeoutId = window.setTimeout(() => setError(''), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [error])

  useEffect(() => {
    const departmentId = form.departmentId
    if (!departmentId) return

    let isCurrent = true
    // The loading state belongs to the department-specific API request.
    // oxlint-disable-next-line react/set-state-in-effect
    setIsLoadingPositions(true)
    setPositionLoadError('')
    void getDepartmentPositionsFromApi(departmentId)
      .then((positions) => {
        if (isCurrent) setDepartmentPositions(positions.filter((position) => position.isActive))
      })
      .catch(() => {
        if (!isCurrent) return
        setDepartmentPositions([])
        setPositionLoadError('Không thể tải chức danh của phòng ban. Vui lòng thử lại.')
      })
      .finally(() => {
        if (isCurrent) setIsLoadingPositions(false)
      })
    return () => { isCurrent = false }
  }, [form.departmentId])

  const activeDepartments = useMemo(
    () => referenceData?.departments.filter((department) => department.isActive) ?? [],
    [referenceData],
  )
  const validation = useMemo(() => validateEmployee(form), [form])
  const isDirty = useMemo(() => {
    const { employeeCode: _employeeCode, ...values } = form
    const { employeeCode: _initialEmployeeCode, ...initialValues } = initialForm
    return JSON.stringify(values) !== JSON.stringify(initialValues) || avatarFile !== null
  }, [avatarFile, form])

  function update<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    if (key === 'workEmail') setEmailConflict('')
    setError('')
  }

  function touchField(field: EmployeeRequiredField) {
    setTouched((current) => ({ ...current, [field]: true }))
  }

  function requestBack() {
    if (isDirty) setShowConfirm(true)
    else onBack()
  }

  function selectAvatar(file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Ảnh đại diện chỉ hỗ trợ JPG hoặc PNG.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Ảnh đại diện không được vượt quá 2 MB.')
      return
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const nextErrors = validateEmployee(form)
    setTouched({ fullName: true, workEmail: true, departmentId: true, positionId: true })
    if (Object.values(nextErrors).some(Boolean)) {
      setActiveTab('OVERVIEW')
      setError('Vui lòng nhập đầy đủ các thông tin bắt buộc.')
      return
    }

    setIsSaving(true)
    try {
      const { employeeCode: _employeeCode, ...values } = form
      const employee = await createEmployee({
        ...values,
        fullName: form.fullName.trim(),
        workEmail: form.workEmail.trim().toLowerCase(),
      })
      if (avatarFile) await uploadEmployeeAvatar(employee.id, avatarFile)
      onCreated()
    } catch (reason) {
      if (reason instanceof ApiError && (reason.field === 'workEmail' || reason.code === 'EMAIL_ALREADY_EXISTS')) {
        setTouched((current) => ({ ...current, workEmail: true }))
        setEmailConflict(reason.message)
        setActiveTab('OVERVIEW')
        return
      }
      setError(reason instanceof Error ? reason.message : 'Không thể tạo nhân viên hoặc tải ảnh đại diện.')
    } finally {
      setIsSaving(false)
    }
  }

  const positionPlaceholder = !form.departmentId
    ? 'Chọn phòng ban trước'
    : isLoadingPositions
      ? 'Đang tải chức danh...'
      : departmentPositions.length
        ? 'Chọn chức danh'
        : 'Phòng ban chưa có chức danh áp dụng'
  const summaryName = form.fullName.trim() || 'Nhân viên mới'
  const avatar = avatarPreview
    ? <img className="employee-avatar" src={avatarPreview} alt="Xem trước ảnh đại diện" />
    : <span className="employee-avatar employee-avatar-fallback" aria-hidden="true">{summaryName.charAt(0).toUpperCase() || 'N'}</span>

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng nhân viên">
      <button className="breadcrumb-link" type="button" onClick={requestBack}>Nhân viên</button>
      <span aria-hidden="true">/</span>
      <strong>Tạo nhân viên</strong>
    </nav>

    <section className="department-detail-summary">
      <div className="department-detail-summary-main"><h1>Tạo nhân viên{isDirty ? ' (*)' : ''}</h1></div>
      <div className="department-detail-actions">
        <button className="secondary-button compact-button" type="button" onClick={requestBack} disabled={isSaving}>Hủy</button>
        <button className="primary-button compact-button" type="submit" form="new-employee-form" disabled={isSaving}>{isSaving ? 'Đang lưu...' : 'Lưu'}</button>
      </div>
    </section>

    <form id="new-employee-form" onSubmit={(event) => void submit(event)} noValidate>
      <SurfaceCard className="employee-detail-card new-employee-detail-card">
        <div className="detail-tabs" role="tablist" aria-label="Thông tin nhân viên">
          <button className={activeTab === 'OVERVIEW' ? 'active' : ''} type="button" role="tab" aria-selected={activeTab === 'OVERVIEW'} onClick={() => setActiveTab('OVERVIEW')}>Tổng quan</button>
          <button className={activeTab === 'ORGANIZATION' ? 'active' : ''} type="button" role="tab" aria-selected={activeTab === 'ORGANIZATION'} onClick={() => setActiveTab('ORGANIZATION')}>Tổ chức &amp; phê duyệt</button>
        </div>

        {activeTab === 'OVERVIEW' && <>
          <div className="new-employee-avatar-row">
            <div><span className="profile-field-label">Ảnh đại diện</span><p>Chọn ảnh JPG hoặc PNG, dung lượng tối đa 2 MB.</p></div>
            <label className="employee-avatar-button" title="Chọn ảnh đại diện">
              {avatar}
              <span className="employee-avatar-change">Chọn ảnh</span>
              <input className="avatar-file-input" type="file" accept="image/jpeg,image/png" disabled={isSaving} onChange={(event) => selectAvatar(event.target.files?.[0])} />
            </label>
          </div>
          <div className="profile-field-grid">
          <ProfileField label="Mã nhân viên" value={form.employeeCode} isEditing editControl={<input className="employee-code-readonly" value={form.employeeCode} readOnly disabled />} />
          <ProfileField label="Họ và tên" value={form.fullName} isEditing required showRequiredError={Boolean(touched.fullName)} error={touched.fullName ? validation.fullName : undefined} editControl={<input value={form.fullName} disabled={isSaving} onChange={(event) => update('fullName', event.target.value)} onBlur={() => touchField('fullName')} />} />
          <ProfileField label="Email" value={form.workEmail} isEditing required showRequiredError={Boolean(touched.workEmail)} error={emailConflict || (touched.workEmail ? validation.workEmail : undefined)} editControl={<input type="email" value={form.workEmail} autoComplete="email" disabled={isSaving} onChange={(event) => update('workEmail', event.target.value)} onBlur={() => touchField('workEmail')} />} />
          <ProfileField label="Trạng thái" value="Hoạt động" isEditing editControl={<FilterSelect ariaLabel="Chọn trạng thái làm việc" value={String(form.isActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]} disabled={isSaving} onChange={(value) => update('isActive', value === 'true')} />} />
          <ProfileField label="Điện thoại" value={form.phone} isEditing editControl={<input type="tel" value={form.phone ?? ''} disabled={isSaving} onChange={(event) => update('phone', event.target.value)} />} />
          <ProfileField label="Ngày sinh" value={form.dateOfBirth} isEditing editControl={<DatePicker ariaLabel="Ngày sinh" value={form.dateOfBirth} onChange={(value) => update('dateOfBirth', value)} />} />
          <ProfileField label="Ngày vào làm" value={form.hiredAt} isEditing editControl={<DatePicker ariaLabel="Ngày vào làm" value={form.hiredAt} onChange={(value) => update('hiredAt', value)} />} />
          <ProfileField label="Phòng ban" value={form.department} isEditing required showRequiredError={Boolean(touched.departmentId)} error={touched.departmentId ? validation.departmentId : undefined} editControl={<FilterSelect ariaLabel="Chọn phòng ban" value={form.departmentId ?? ''} options={[{ value: '', label: 'Chọn phòng ban' }, ...activeDepartments.map((item) => ({ value: item._id, label: item.name }))]} disabled={isSaving} onOpenChange={(isOpen) => { if (!isOpen) touchField('departmentId') }} onChange={(value) => {
            const department = activeDepartments.find((item) => item._id === value)
            setDepartmentPositions([])
            setPositionLoadError('')
            setTouched((current) => ({ ...current, positionId: false }))
            setForm((current) => ({ ...current, departmentId: value || undefined, department: department?.name ?? '', positionId: undefined, position: '' }))
          }} />} />
          <ProfileField label="Chức danh" value={form.position} isEditing required showRequiredError={Boolean(touched.positionId)} error={positionLoadError || (touched.positionId ? validation.positionId : undefined)} editControl={<FilterSelect ariaLabel="Chọn chức danh" value={form.positionId ?? ''} options={[{ value: '', label: positionPlaceholder }, ...departmentPositions.map((item) => ({ value: item.id, label: item.name }))]} disabled={!form.departmentId || isLoadingPositions || isSaving} onOpenChange={(isOpen) => { if (!isOpen) touchField('positionId') }} onChange={(value) => {
            const position = departmentPositions.find((item) => item.id === value)
            setForm((current) => ({ ...current, positionId: value || undefined, position: position?.name ?? '' }))
          }} />} />
          <ProfileField label="Loại nhân sự" value={form.employmentType} isEditing editControl={<FilterSelect ariaLabel="Chọn loại nhân sự" value={form.employmentType} options={[{ value: 'FULL_TIME', label: 'Chính thức' }, { value: 'CONTRACT', label: 'Hợp đồng' }, { value: 'INTERN', label: 'Thực tập' }]} disabled={isSaving} onChange={(value) => update('employmentType', value as EmploymentType)} />} />
          <ProfileField label="Địa chỉ" value={form.address} isEditing editControl={<input value={form.address ?? ''} disabled={isSaving} onChange={(event) => update('address', event.target.value)} />} />
          </div>
        </>}

        {activeTab === 'ORGANIZATION' && <div className="profile-field-grid profile-field-grid-organization">
          <ProfileField label="Quản lý trực tiếp" value="Chưa thiết lập" isEditing editControl={<FilterSelect ariaLabel="Chọn quản lý trực tiếp" value={form.managerId ?? ''} options={[{ value: '', label: 'Chưa thiết lập' }, ...people.map((item) => ({ value: item.id, label: `${item.fullName} · ${item.employeeCode}` }))]} disabled={isSaving} onChange={(value) => update('managerId', value || undefined)} />} />
          <p className="employee-display-note">Workflow sẽ sử dụng quản lý trực tiếp này để xác định người phê duyệt cho các phiếu mới.</p>
        </div>}
      </SurfaceCard>
    </form>

    {error && <div className="toast-message toast-error" role="alert">{error}</div>}
    {showConfirm && <ConfirmDialog title="Rời màn hình khi chưa lưu thay đổi?" description="Thông tin hồ sơ nhân viên đang nhập sẽ bị hủy." confirmLabel="Hủy thay đổi và quay lại" onCancel={() => setShowConfirm(false)} onConfirm={onBack} />}
  </>
}
