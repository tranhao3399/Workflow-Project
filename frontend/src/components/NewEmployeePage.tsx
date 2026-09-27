import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createEmployee, uploadEmployeeAvatar } from '../services/employees.service'
import { getReferenceData } from '../services/reference-data.service'
import type { EmployeeFormValues } from '../types/employees'
import type { ReferenceData } from '../types/reference-data'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { FilterSelect } from './ui/FilterSelect'

interface NewEmployeePageProps { onBack: () => void; onCreated: () => void }

const initialForm: EmployeeFormValues = { employeeCode: '', fullName: '', workEmail: '', department: '', position: '', employmentType: 'FULL_TIME', isActive: true }

export function NewEmployeePage({ onBack, onCreated }: NewEmployeePageProps) {
  const [form, setForm] = useState<EmployeeFormValues>(initialForm)
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  useEffect(() => { void getReferenceData().then((result) => setReferenceData(result.data)) }, [])
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }, [avatarPreview])
  const positions = useMemo(() => referenceData?.positions.filter((position) => !form.departmentId || !position.departmentId || (typeof position.departmentId === 'string' ? position.departmentId === form.departmentId : position.departmentId._id === form.departmentId)) ?? [], [form.departmentId, referenceData])
  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm) || avatarFile !== null, [avatarFile, form])

  function update<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) { setForm((current) => ({ ...current, [key]: value })); setError('') }
  function selectAvatar(file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError('Ảnh đại diện chỉ hỗ trợ JPG hoặc PNG.'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Ảnh đại diện không được vượt quá 2 MB.'); return }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file); setAvatarPreview(URL.createObjectURL(file)); setError('')
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.employeeCode || !form.fullName || !form.departmentId || !form.positionId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail)) { setError('Vui lòng nhập đủ thông tin bắt buộc và chọn danh mục hợp lệ.'); return }
    setIsSaving(true)
    try {
      const employee = await createEmployee({ ...form, employeeCode: form.employeeCode.trim().toUpperCase(), fullName: form.fullName.trim(), workEmail: form.workEmail.trim().toLowerCase() })
      if (avatarFile) await uploadEmployeeAvatar(employee.id, avatarFile)
      onCreated()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tạo nhân viên hoặc tải ảnh đại diện.') } finally { setIsSaving(false) }
  }

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng nhân viên"><button className="breadcrumb-link" type="button" onClick={() => isDirty ? setShowConfirm(true) : onBack()}>Nhân viên</button><span aria-hidden="true">/</span><strong>Thêm nhân viên</strong></nav>
    <PageHeader title="Thêm nhân viên" description="Tạo hồ sơ nhân sự trước khi cấp tài khoản đăng nhập." actions={<><button className="secondary-button" type="button" onClick={() => isDirty ? setShowConfirm(true) : onBack()}>← Quay lại danh sách</button><button className="primary-button compact-button" type="submit" form="new-employee-form" disabled={isSaving}>{isSaving ? 'Đang tạo...' : 'Tạo nhân viên'}</button></>} />
    <SurfaceCard className="employee-create-card"><div className="employee-create-heading"><h2>Thông tin nhân viên</h2></div><form className="employee-create-form" id="new-employee-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="employee-avatar-field"><span>Ảnh đại diện</span><label className="avatar-upload-control"><span className="employee-avatar employee-avatar-preview">{avatarPreview ? <img src={avatarPreview} alt="Xem trước ảnh đại diện" /> : (form.fullName.trim().charAt(0).toUpperCase() || 'N')}</span><span>Chọn JPG hoặc PNG, tối đa 2 MB</span><input className="avatar-file-input" type="file" accept="image/jpeg,image/png" onChange={(event) => selectAvatar(event.target.files?.[0])} /></label></div>
      <label><span>Mã nhân viên</span><input value={form.employeeCode} onChange={(event) => update('employeeCode', event.target.value)} /></label><label><span>Họ và tên</span><input value={form.fullName} onChange={(event) => update('fullName', event.target.value)} /></label><label><span>Email công việc</span><input type="email" value={form.workEmail} onChange={(event) => update('workEmail', event.target.value)} /></label>
      <label><span>Phòng ban</span><FilterSelect ariaLabel="Chọn phòng ban" value={form.departmentId ?? ''} options={[{ value: '', label: 'Chọn phòng ban' }, ...(referenceData?.departments.map((item) => ({ value: item._id, label: item.name })) ?? [])]} onChange={(value) => { const department = referenceData?.departments.find((item) => item._id === value); setForm((current) => ({ ...current, departmentId: value || undefined, department: department?.name ?? '', positionId: undefined, position: '' })) }} /></label>
      <label><span>Chức danh</span><FilterSelect ariaLabel="Chọn chức danh" value={form.positionId ?? ''} options={[{ value: '', label: 'Chọn chức danh' }, ...positions.map((item) => ({ value: item._id, label: item.name }))]} onChange={(value) => { const position = positions.find((item) => item._id === value); setForm((current) => ({ ...current, positionId: value || undefined, position: position?.name ?? '' })) }} /></label>
      <label><span>Loại nhân sự</span><FilterSelect ariaLabel="Chọn loại nhân sự" value={form.employmentType} options={[{ value: 'FULL_TIME', label: 'Chính thức' }, { value: 'CONTRACT', label: 'Hợp đồng' }, { value: 'INTERN', label: 'Thực tập' }]} onChange={(value) => update('employmentType', value as EmployeeFormValues['employmentType'])} /></label>
      <label><span>Trạng thái làm việc</span><FilterSelect ariaLabel="Chọn trạng thái làm việc" value={String(form.isActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngừng làm việc' }]} onChange={(value) => update('isActive', value === 'true')} /></label>
      {error && <p className="field-error">{error}</p>}
    </form></SurfaceCard>
    {showConfirm && <ConfirmDialog title="Rời màn hình khi chưa lưu thay đổi?" description="Thông tin hồ sơ nhân viên đang nhập sẽ bị hủy." confirmLabel="Hủy thay đổi và quay lại" onCancel={() => setShowConfirm(false)} onConfirm={onBack} />}
  </>
}
