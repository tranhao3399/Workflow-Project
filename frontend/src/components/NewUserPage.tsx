import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createUser, getUsers } from '../services/administration.service'
import { getEmployees } from '../services/employees.service'
import type { UserFormValues } from '../types/administration'
import { getReferenceData } from '../services/reference-data.service'
import type { RoleOption } from '../types/reference-data'
import type { Employee } from '../types/employees'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { FilterSelect } from './ui/FilterSelect'

interface NewUserPageProps { onBack: () => void; onCreated: () => void; initialEmployeeId?: string }
const emptyForm: UserFormValues = { employeeId: '', email: '', roleIds: [], isActive: true }

export function NewUserPage({ onBack, onCreated, initialEmployeeId }: NewUserPageProps) {
  const [form, setForm] = useState<UserFormValues>({ ...emptyForm, employeeId: initialEmployeeId ?? '' })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [temporaryPassword, setTemporaryPassword] = useState('')
  useEffect(() => { Promise.all([getEmployees(), getUsers()]).then(([people, accounts]) => { const linked = new Set(accounts.map((account) => account.employeeId)); setEmployees(people.filter((employee) => !linked.has(employee.id) || employee.id === initialEmployeeId)) }).catch(() => setError('Không thể tải danh sách nhân viên.')).finally(() => setIsLoading(false)) }, [initialEmployeeId])
  useEffect(() => { void getReferenceData().then((result) => setRoles(result.data.roles)) }, [])
  const isDirty = useMemo(() => form.employeeId !== (initialEmployeeId ?? '') || form.email !== '' || temporaryPassword !== '' || form.roleIds.length > 0 || !form.isActive, [form, initialEmployeeId, temporaryPassword])
  function toggleRole(roleId: string) { setForm((current) => ({ ...current, roleIds: current.roleIds.includes(roleId) ? current.roleIds.filter((item) => item !== roleId) : [...current.roleIds, roleId] })) }
  function requestBack() { if (isDirty) setShowDiscardConfirm(true); else onBack() }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!form.employeeId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || temporaryPassword.length < 8 || form.roleIds.length === 0) { setError('Chọn nhân viên, nhập email hợp lệ, mật khẩu tạm tối thiểu 8 ký tự và ít nhất một vai trò.'); return }; setIsSaving(true); try { await createUser({ ...form, email: form.email.trim().toLowerCase(), temporaryPassword }); onCreated() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tạo tài khoản.') } finally { setIsSaving(false) } }
  return <><nav className="detail-breadcrumb" aria-label="Điều hướng tài khoản"><span>Tài khoản người dùng</span><span aria-hidden="true">/</span><strong>Thêm tài khoản</strong></nav><PageHeader title="Thêm tài khoản" description="Cấp quyền truy cập cho một hồ sơ nhân viên chưa có tài khoản." actions={<><button className="secondary-button" type="button" onClick={requestBack} disabled={isSaving}>← Quay lại danh sách</button><button className="primary-button compact-button" type="submit" form="new-user-form" disabled={isSaving || isLoading}>{isSaving ? 'Đang tạo...' : 'Tạo tài khoản'}</button></>} /><SurfaceCard className="new-user-card">{isLoading ? <p className="form-loading">Đang tải nhân viên chưa có tài khoản...</p> : <form className="new-user-form" id="new-user-form" onSubmit={(event) => void submit(event)} noValidate><label><span>Nhân viên</span><FilterSelect ariaLabel="Chọn nhân viên" value={form.employeeId} options={[{ value: '', label: 'Chọn nhân viên chưa có tài khoản' }, ...employees.map((employee) => ({ value: employee.id, label: `${employee.employeeCode} · ${employee.fullName} · ${employee.department}` }))]} onChange={(employeeId) => setForm((current) => ({ ...current, employeeId }))} /></label><label><span>Email đăng nhập</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" /></label><label><span>Mật khẩu tạm</span><input type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} autoComplete="new-password" /></label><fieldset className="role-multi-select"><legend>Vai trò</legend><div>{roles.flatMap((role) => { const roleId = role.id ?? role._id; return roleId ? [<label className="checkbox-line" key={roleId}><input type="checkbox" checked={form.roleIds.includes(roleId)} onChange={() => toggleRole(roleId)} /><span>{role.name}</span></label>] : [] })}</div></fieldset><label className="checkbox-line new-user-status"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>Trạng thái hoạt động</span></label>{error && <p className="field-error">{error}</p>}</form>}</SurfaceCard>{showDiscardConfirm && <ConfirmDialog title="Rời màn hình khi chưa lưu thay đổi?" description="Thông tin tạo tài khoản đang nhập sẽ bị hủy." confirmLabel="Hủy thay đổi và quay lại" onCancel={() => setShowDiscardConfirm(false)} onConfirm={onBack} />}</>
}
