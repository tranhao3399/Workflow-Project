import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createEmployee, getNextEmployeeCode, uploadEmployeeAvatar } from '../services/employees.service'
import { getDepartmentPositionsFromApi } from '../services/master-data.service'
import { getReferenceData } from '../services/reference-data.service'
import type { EmployeeFormValues } from '../types/employees'
import type { JobTitlePreview } from '../types/master-data'
import type { ReferenceData } from '../types/reference-data'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { FilterSelect } from './ui/FilterSelect'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'

interface NewEmployeePageProps { onBack: () => void; onCreated: () => void }

const initialForm: EmployeeFormValues = { employeeCode: '', fullName: '', workEmail: '', department: '', position: '', employmentType: 'FULL_TIME', isActive: true }

export function NewEmployeePage({ onBack, onCreated }: NewEmployeePageProps) {
  const [form, setForm] = useState<EmployeeFormValues>(initialForm)
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null)
  const [departmentPositions, setDepartmentPositions] = useState<JobTitlePreview[]>([])
  const [isLoadingPositions, setIsLoadingPositions] = useState(false)
  const [positionLoadError, setPositionLoadError] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  useEffect(() => { void getReferenceData().then((result) => setReferenceData(result.data)) }, [])
  useEffect(() => { void getNextEmployeeCode().then((employeeCode) => setForm((current) => ({ ...current, employeeCode }))).catch(() => setError('Không thể tạo mã nhân viên. Vui lòng tải lại trang.')) }, [])
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }, [avatarPreview])
  // Reset and reload the dependent position field when the department changes.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    const departmentId = form.departmentId
    if (!departmentId) {
      // Clearing the dependent options keeps the form consistent with its parent field.
      // oxlint-disable-next-line react/set-state-in-effect
      setDepartmentPositions([])
      setPositionLoadError('')
      return
    }

    let isCurrent = true
    setIsLoadingPositions(true)
    setPositionLoadError('')
    void getDepartmentPositionsFromApi(departmentId)
      .then((positions) => {
        if (isCurrent) setDepartmentPositions(positions.filter((position) => position.isActive))
      })
      .catch(() => {
        if (isCurrent) {
          setDepartmentPositions([])
          setPositionLoadError('Không thể tải chức danh của phòng ban. Vui lòng thử lại.')
        }
      })
      .finally(() => { if (isCurrent) setIsLoadingPositions(false) })
    return () => { isCurrent = false }
  }, [form.departmentId])

  const activeDepartments = useMemo(() => referenceData?.departments.filter((department) => department.isActive) ?? [], [referenceData])
  const isDirty = useMemo(() => {
    const { employeeCode: _employeeCode, ...values } = form
    const { employeeCode: _initialEmployeeCode, ...initialValues } = initialForm
    return JSON.stringify(values) !== JSON.stringify(initialValues) || avatarFile !== null
  }, [avatarFile, form])

  function update<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function selectAvatar(file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError('Ảnh đại diện chỉ hỗ trợ JPG hoặc PNG.'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Ảnh đại diện không được vượt quá 2 MB.'); return }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.fullName || !form.departmentId || !form.positionId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail)) {
      setError('Vui lòng nhập đủ thông tin bắt buộc và chọn danh mục hợp lệ.')
      return
    }
    setIsSaving(true)
    try {
      const { employeeCode: _employeeCode, ...values } = form
      const employee = await createEmployee({ ...values, fullName: form.fullName.trim(), workEmail: form.workEmail.trim().toLowerCase() })
      if (avatarFile) await uploadEmployeeAvatar(employee.id, avatarFile)
      onCreated()
    } catch (reason) {
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

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng nhân viên"><button className="breadcrumb-link" type="button" onClick={() => isDirty ? setShowConfirm(true) : onBack()}>Nhân viên</button><span aria-hidden="true">/</span><strong>Thêm nhân viên</strong></nav>
    <PageHeader title="Thêm nhân viên" description="Tạo hồ sơ nhân sự trước khi cấp tài khoản đăng nhập." actions={<><button className="secondary-button" type="button" onClick={() => isDirty ? setShowConfirm(true) : onBack()}>← Quay lại danh sách</button><button className="primary-button compact-button" type="submit" form="new-employee-form" disabled={isSaving}>{isSaving ? 'Đang tạo...' : 'Tạo nhân viên'}</button></>} />
    <SurfaceCard className="employee-create-card"><div className="employee-create-heading"><h2>Thông tin nhân viên</h2></div><form className="employee-create-form" id="new-employee-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="employee-avatar-field"><span>Ảnh đại diện</span><label className="avatar-upload-control"><span className="employee-avatar employee-avatar-preview">{avatarPreview ? <img src={avatarPreview} alt="Xem trước ảnh đại diện" /> : (form.fullName.trim().charAt(0).toUpperCase() || 'N')}</span><span>Chọn JPG hoặc PNG, tối đa 2 MB</span><input className="avatar-file-input" type="file" accept="image/jpeg,image/png" onChange={(event) => selectAvatar(event.target.files?.[0])} /></label></div>
      <label><span className="required-field-label">Mã nhân viên</span><input value={form.employeeCode} readOnly aria-label="Mã nhân viên do hệ thống tự tạo" /></label><label><span className="required-field-label">Họ và tên</span><input value={form.fullName} onChange={(event) => update('fullName', event.target.value)} /></label><label><span className="required-field-label">Email công việc</span><input type="email" value={form.workEmail} onChange={(event) => update('workEmail', event.target.value)} /></label>
      <label><span className="required-field-label">Phòng ban</span><FilterSelect ariaLabel="Chọn phòng ban" value={form.departmentId ?? ''} options={[{ value: '', label: 'Chọn phòng ban' }, ...activeDepartments.map((item) => ({ value: item._id, label: item.name }))]} onChange={(value) => { const department = activeDepartments.find((item) => item._id === value); setDepartmentPositions([]); setPositionLoadError(''); setForm((current) => ({ ...current, departmentId: value || undefined, department: department?.name ?? '', positionId: undefined, position: '' })) }} /></label>
      <label><span className="required-field-label">Chức danh</span><FilterSelect ariaLabel="Chọn chức danh" value={form.positionId ?? ''} options={[{ value: '', label: positionPlaceholder }, ...departmentPositions.map((item) => ({ value: item.id, label: item.name }))]} disabled={!form.departmentId || isLoadingPositions} onChange={(value) => { const position = departmentPositions.find((item) => item.id === value); setForm((current) => ({ ...current, positionId: value || undefined, position: position?.name ?? '' })) }} />{positionLoadError && <small className="field-error">{positionLoadError}</small>}</label>
      <label><span>Loại nhân sự</span><FilterSelect ariaLabel="Chọn loại nhân sự" value={form.employmentType} options={[{ value: 'FULL_TIME', label: 'Chính thức' }, { value: 'CONTRACT', label: 'Hợp đồng' }, { value: 'INTERN', label: 'Thực tập' }]} onChange={(value) => update('employmentType', value as EmployeeFormValues['employmentType'])} /></label>
      <label><span>Trạng thái làm việc</span><FilterSelect ariaLabel="Chọn trạng thái làm việc" value={String(form.isActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngừng làm việc' }]} onChange={(value) => update('isActive', value === 'true')} /></label>
      {error && <p className="field-error">{error}</p>}
    </form></SurfaceCard>
    {showConfirm && <ConfirmDialog title="Rời màn hình khi chưa lưu thay đổi?" description="Thông tin hồ sơ nhân viên đang nhập sẽ bị hủy." confirmLabel="Hủy thay đổi và quay lại" onCancel={() => setShowConfirm(false)} onConfirm={onBack} />}
  </>
}
