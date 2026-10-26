import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createUser, getUserEmployeeOptions } from '../services/administration.service'
import type { UserFormValues } from '../types/administration'
import { getReferenceData } from '../services/reference-data.service'
import type { RoleOption } from '../types/reference-data'
import type { UserEmployeeOption } from '../services/administration.service'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { DataTable } from './ui/DataTable'
import { SurfaceCard } from './ui/SurfaceCard'
import { FilterSelect } from './ui/FilterSelect'
import { passwordPolicyError } from '../utils/password-policy'
import { ApiError } from '../services/api-client'

interface NewUserPageProps { onBack: () => void; onCreated: () => void; initialEmployeeId?: string }
const emptyForm: UserFormValues = { employeeId: '', email: '', roleIds: [], isActive: true }
interface NewUserFieldErrors { employeeId?: string; email?: string; password?: string; roleIds?: string }

function emailErrorMessage(email: string): string | undefined {
  if (!email.trim()) return 'Email không được để trống.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Email không hợp lệ.'
  return undefined
}

function passwordErrorMessage(password: string): string | undefined {
  if (!password) return 'Mật khẩu không được để trống.'
  return passwordPolicyError(password)
}

export function NewUserPage({ onBack, onCreated, initialEmployeeId }: NewUserPageProps) {
  const [form, setForm] = useState<UserFormValues>({ ...emptyForm, employeeId: initialEmployeeId ?? '' })
  const [employees, setEmployees] = useState<UserEmployeeOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<NewUserFieldErrors>({})
  const [emailConflict, setEmailConflict] = useState('')
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [roleIdsToRemove, setRoleIdsToRemove] = useState<string[]>([])
  const selectAllRolesRef = useRef<HTMLInputElement>(null)
  useEffect(() => { void getUserEmployeeOptions({ availableOnly: true, includeEmployeeId: initialEmployeeId }).then(setEmployees).catch(() => setError('Không thể tải danh sách nhân viên.')).finally(() => setIsLoading(false)) }, [initialEmployeeId])
  useEffect(() => { void getReferenceData().then((result) => setRoles(result.data.roles)) }, [])
  const isDirty = useMemo(() => form.employeeId !== (initialEmployeeId ?? '') || form.email !== '' || temporaryPassword !== '' || form.roleIds.length > 0 || !form.isActive, [form, initialEmployeeId, temporaryPassword])
  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === form.employeeId) ?? null, [employees, form.employeeId])
  const activeRoles = useMemo(() => roles.flatMap((role) => {
    const id = role.id ?? role._id
    return id && role.isActive ? [{ id, key: role.key, name: role.name }] : []
  }), [roles])
  const assignedRoles = useMemo(() => activeRoles.filter((role) => form.roleIds.includes(role.id)), [activeRoles, form.roleIds])
  const availableRoles = useMemo(() => activeRoles.filter((role) => !form.roleIds.includes(role.id)), [activeRoles, form.roleIds])
  const allRolesSelected = assignedRoles.length > 0 && assignedRoles.every((role) => roleIdsToRemove.includes(role.id))
  const someRolesSelected = assignedRoles.some((role) => roleIdsToRemove.includes(role.id))

  useEffect(() => {
    if (selectAllRolesRef.current) selectAllRolesRef.current.indeterminate = someRolesSelected && !allRolesSelected
  }, [allRolesSelected, someRolesSelected])

  function applyRoles() {
    setForm((current) => ({ ...current, roleIds: [...new Set([...current.roleIds, ...selectedRoleIds])] }))
    setFieldErrors((current) => ({ ...current, roleIds: undefined }))
    setSelectedRoleIds([])
    setIsRoleDialogOpen(false)
  }
  function removeSelectedRoles() {
    setForm((current) => ({ ...current, roleIds: current.roleIds.filter((roleId) => !roleIdsToRemove.includes(roleId)) }))
    setRoleIdsToRemove([])
  }
  function requestBack() { if (isDirty) setShowDiscardConfirm(true); else onBack() }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextFieldErrors: NewUserFieldErrors = {
      email: emailErrorMessage(form.email),
      password: passwordErrorMessage(temporaryPassword),
      roleIds: form.roleIds.length > 0 ? undefined : 'Vui lòng gán ít nhất một vai trò.',
    }
    setFieldErrors(nextFieldErrors)
    setError('')
    if (Object.values(nextFieldErrors).some(Boolean)) return

    setIsSaving(true)
    try {
      await createUser({ ...form, email: form.email.trim().toLowerCase(), temporaryPassword })
      onCreated()
    } catch (reason) {
      if (reason instanceof ApiError && (reason.field === 'email' || reason.code === 'EMAIL_ALREADY_EXISTS')) {
        setEmailConflict(reason.message)
        return
      }
      setError(reason instanceof Error ? reason.message : 'Không thể tạo tài khoản.')
    } finally {
      setIsSaving(false)
    }
  }
  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng tài khoản"><button className="breadcrumb-link" type="button" onClick={requestBack}>Tài khoản người dùng</button><span aria-hidden="true">/</span><strong>Tạo tài khoản</strong></nav>
    <section className="department-detail-summary">
      <div className="department-detail-summary-main"><h1>Tạo tài khoản</h1></div>
      <div className="department-detail-actions">
        <button className="secondary-button compact-button" type="button" onClick={requestBack} disabled={isSaving}>Hủy</button>
        <button className="primary-button compact-button" type="submit" form="new-user-form" disabled={isSaving || isLoading}>{isSaving ? 'Đang lưu...' : 'Lưu'}</button>
      </div>
    </section>

    {isLoading ? <SurfaceCard className="user-detail-section user-information-card"><p className="form-loading">Đang tải thông tin tạo tài khoản...</p></SurfaceCard> : <form id="new-user-form" onSubmit={(event) => void submit(event)} noValidate>
      <SurfaceCard className="user-detail-section user-information-card">
        <div className="user-section-heading"><h2>Thông tin tài khoản</h2></div>
        <div className="detail-facts user-detail-form user-information-grid new-user-information-grid">
          <label><span className="required-field-label">Email</span><input type="email" value={form.email} onChange={(event) => { const email = event.target.value; setEmailConflict(''); setForm((current) => ({ ...current, email })); if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: emailErrorMessage(email) })) }} onBlur={() => setFieldErrors((current) => ({ ...current, email: emailErrorMessage(form.email) }))} autoComplete="email" aria-invalid={Boolean(emailConflict || fieldErrors.email)} disabled={isSaving} />{(emailConflict || fieldErrors.email) && <small className="field-error" role="alert">{emailConflict || fieldErrors.email}</small>}</label>
          <label><span>Mã nhân viên</span><FilterSelect ariaLabel="Chọn mã nhân viên" value={form.employeeId} options={[{ value: '', label: 'Không liên kết nhân viên' }, ...employees.map((employee) => ({ value: employee.id, label: employee.employeeCode }))]} onChange={(employeeId) => setForm((current) => ({ ...current, employeeId }))} disabled={isSaving} /></label>
          <label><span>Họ tên</span><input className="readonly-field" value={selectedEmployee?.fullName ?? 'Chưa liên kết nhân viên'} readOnly disabled /></label>
          <div className="detail-status"><span>Trạng thái</span><FilterSelect ariaLabel="Trạng thái tài khoản" value={String(form.isActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]} onChange={(value) => setForm((current) => ({ ...current, isActive: value === 'true' }))} disabled={isSaving} /></div>
          <label className="new-user-password-field"><span className="required-field-label">Mật khẩu</span><input type="password" value={temporaryPassword} onChange={(event) => { const password = event.target.value; setTemporaryPassword(password); if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: passwordErrorMessage(password) })) }} onBlur={() => setFieldErrors((current) => ({ ...current, password: passwordErrorMessage(temporaryPassword) }))} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} disabled={isSaving} />{fieldErrors.password && <small className="field-error" role="alert">{fieldErrors.password}</small>}</label>
        </div>
        {error && <p className="field-error new-user-form-error" role="alert">{error}</p>}
      </SurfaceCard>

      <SurfaceCard className="user-detail-section user-roles-card">
        <div className="user-section-heading user-roles-heading"><h2>Vai trò</h2><div><button className="secondary-button compact-button user-add-role-button" type="button" disabled={isSaving || availableRoles.length === 0} onClick={() => { setSelectedRoleIds([]); setIsRoleDialogOpen(true) }}>+ Gán vai trò</button>{roleIdsToRemove.length > 0 && <button className="danger-button compact-button" type="button" disabled={isSaving} onClick={removeSelectedRoles}>Gỡ ({roleIdsToRemove.length})</button>}</div></div>
        {fieldErrors.roleIds && <p className="field-error new-user-role-error" role="alert">{fieldErrors.roleIds}</p>}
        {assignedRoles.length === 0 ? <p className="department-position-empty">Chưa có vai trò nào được gán cho tài khoản này.</p> : <DataTable className="admin-table user-roles-table">
          <thead><tr><th className="user-role-selection"><input ref={selectAllRolesRef} type="checkbox" aria-label="Chọn tất cả vai trò đã gán" checked={allRolesSelected} disabled={isSaving} onChange={() => setRoleIdsToRemove(allRolesSelected ? [] : assignedRoles.map((role) => role.id))} /></th><th className="user-role-number">#</th><th>Mã vai trò</th><th>Tên vai trò</th></tr></thead>
          <tbody>{assignedRoles.map((role, index) => <tr className={roleIdsToRemove.includes(role.id) ? 'is-selected' : ''} key={role.id}><td className="user-role-selection"><input type="checkbox" aria-label={`Chọn ${role.name}`} checked={roleIdsToRemove.includes(role.id)} disabled={isSaving} onChange={() => setRoleIdsToRemove((current) => current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id])} /></td><td className="user-role-number">{index + 1}</td><td>{role.key}</td><td><strong>{role.name}</strong></td></tr>)}</tbody>
        </DataTable>}
      </SurfaceCard>
    </form>}

    {isRoleDialogOpen && <div className="modal-backdrop department-job-title-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsRoleDialogOpen(false) }}><section className="modal-panel department-job-title-modal" role="dialog" aria-modal="true" aria-labelledby="new-user-role-dialog-title"><header className="modal-header"><div><h2 id="new-user-role-dialog-title">Gán vai trò</h2></div><button className="icon-button" type="button" aria-label="Đóng hộp thoại" onClick={() => setIsRoleDialogOpen(false)} disabled={isSaving}>×</button></header><div className="department-job-title-modal-content">{availableRoles.length === 0 ? <p className="department-job-title-modal-empty">Tất cả vai trò hoạt động đã được gán cho tài khoản này.</p> : <DataTable className="department-job-title-selection-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả vai trò" checked={availableRoles.length > 0 && availableRoles.every((role) => selectedRoleIds.includes(role.id))} onChange={() => setSelectedRoleIds(availableRoles.every((role) => selectedRoleIds.includes(role.id)) ? [] : availableRoles.map((role) => role.id))} disabled={isSaving} /></th><th>Mã vai trò</th><th>Tên vai trò</th></tr></thead><tbody>{availableRoles.map((role) => <tr className={selectedRoleIds.includes(role.id) ? 'is-selected' : ''} key={role.id}><td><input type="checkbox" checked={selectedRoleIds.includes(role.id)} aria-label={`Chọn ${role.name}`} onChange={() => setSelectedRoleIds((current) => current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id])} disabled={isSaving} /></td><td><span>{role.key}</span></td><td><strong>{role.name}</strong></td></tr>)}</tbody></DataTable>}</div><footer className="modal-actions"><button className="secondary-button" type="button" onClick={() => setIsRoleDialogOpen(false)} disabled={isSaving}>Hủy</button><button className="primary-button" type="button" onClick={applyRoles} disabled={selectedRoleIds.length === 0 || isSaving}>Áp dụng{selectedRoleIds.length ? ` (${selectedRoleIds.length})` : ''}</button></footer></section></div>}

    {showDiscardConfirm && <ConfirmDialog title="Rời màn hình khi chưa lưu thay đổi?" description="Thông tin tạo tài khoản đang nhập sẽ bị hủy." confirmLabel="Hủy thay đổi và quay lại" onCancel={() => setShowDiscardConfirm(false)} onConfirm={onBack} />}
  </>
}
