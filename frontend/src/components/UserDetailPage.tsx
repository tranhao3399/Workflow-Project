import { useEffect, useMemo, useRef, useState } from 'react'
import { getActiveUserRoles, getUserActivity, getUserById, getUserEmployeeOptions, linkUserEmployee, unlinkUserEmployee, updateUser, type UserEmployeeOption, type UserRoleOption } from '../services/administration.service'
import { resolveApiAssetUrl } from '../services/api-client'
import type { User, UserActivityLog, UserFormValues } from '../types/administration'
import { auditChangeDetails, auditValue } from '../utils/audit-display'
import { formatDateTime, formatRole } from '../utils/formatters'
import { ActiveStatusBadge } from './ui/MasterDataStatusBadge'
import { EmptyState, ErrorState, LoadingState } from './DataStates'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { DataTable } from './ui/DataTable'
import { FilterSelect } from './ui/FilterSelect'
import { SurfaceCard } from './ui/SurfaceCard'

interface UserDetailPageProps {
  userId: string
  currentUserId: string
  onBack: () => void
  onOpenEmployee: (employeeId: string) => void
}

type PendingConfirmation = 'INACTIVE' | 'REMOVE_ROLES' | null

function toForm(user: User): UserFormValues {
  return { employeeId: user.employeeId ?? '', email: user.email, roleIds: user.roleIds ?? [], isActive: user.isActive }
}

function initial(value: string): string {
  return value.trim().charAt(0).toUpperCase() || 'T'
}

function emailValidationMessage(email: string): string {
  if (!email.trim()) return 'Email không được để trống.'
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Email không hợp lệ.'
  return ''
}

function auditDescription(log: UserActivityLog, email: string, currentUserId: string): string {
  const actor = log.actorId && log.actorId === currentUserId ? 'Bạn' : log.actorName ?? log.description ?? 'Người dùng hệ thống'
  if (log.action === 'AUTH.PASSWORD_RESET_SUCCEEDED') return `${actor} đã đặt lại mật khẩu qua chức năng Quên mật khẩu.`
  const roleKeys = Array.isArray(log.changes?.after?.roles) ? log.changes?.after?.roles : Array.isArray(log.changes?.before?.roles) ? log.changes?.before?.roles : []
  const roleNames = roleKeys.filter((value): value is string => typeof value === 'string').map((value) => formatRole(value as User['role'])).join(', ')
  if (log.action === 'USER.CREATED') return `${actor} đã tạo mới tài khoản ${email}.`
  if (log.action === 'USER.PASSWORD_CHANGED') return `${actor} đã thay đổi mật khẩu của tài khoản ${email}.`
  if (log.action === 'USER.STATUS_CHANGED') return `${actor} đã thay đổi trạng thái tài khoản ${email}.`
  if (log.action === 'USER.EMPLOYEE_LINKED') return `${actor} đã liên kết mã nhân viên ${String(log.changes?.after?.employeeCode ?? '')} với tài khoản ${email}.`
  if (log.action === 'USER.EMPLOYEE_UNLINKED') return `${actor} đã gỡ liên kết hồ sơ nhân viên khỏi tài khoản ${email}.`
  if (log.action === 'USER.ROLES_ADDED') return `${actor} đã thêm ${roleNames || 'vai trò'} vào tài khoản ${email}.`
  if (log.action === 'USER.ROLES_REMOVED') return `${actor} đã xóa ${roleNames || 'vai trò'} khỏi tài khoản ${email}.`
  return `${actor} đã chỉnh sửa thông tin tài khoản ${email}.`
}

function userChangeDetails(log: UserActivityLog): string[] {
  return auditChangeDetails(log.changes, [
    { key: 'email', label: 'Email' },
    { key: 'isActive', label: 'Trạng thái', format: (value) => value === true ? 'Hoạt động' : value === false ? 'Ngưng hoạt động' : auditValue(value) },
  ])
}

export function UserDetailPage({ userId, currentUserId, onBack, onOpenEmployee }: UserDetailPageProps) {
  const [user, setUser] = useState<User | null>(null)
  const [employees, setEmployees] = useState<UserEmployeeOption[]>([])
  const [roles, setRoles] = useState<UserRoleOption[]>([])
  const [activity, setActivity] = useState<UserActivityLog[]>([])
  const [visibleLogs, setVisibleLogs] = useState(5)
  const [form, setForm] = useState<UserFormValues | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>(null)
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [roleIdsToRemove, setRoleIdsToRemove] = useState<string[]>([])
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null)
  const [emailError, setEmailError] = useState('')
  const selectAllRolesRef = useRef<HTMLInputElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setIsLoading(true)
    try {
      const account = await getUserById(userId)
      const [employeeItems, activeRoles, auditLogs] = await Promise.all([getUserEmployeeOptions(), getActiveUserRoles(), getUserActivity(userId)])
      setUser(account)
      setEmployees(employeeItems)
      setRoles(activeRoles)
      setActivity(auditLogs)
      setVisibleLogs(5)
      setForm(account ? toForm(account) : null)
      setEmailError('')
      setAvatarFailed(false)
      setIsEditing(false)
      setHasError(false)
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }

  // Reload detail state when the route identity changes.
  // oxlint-disable-next-line react/set-state-in-effect react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [userId])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])
  const isDirty = useMemo(() => Boolean(user && form && (
    user.email !== form.email
    || (user.employeeId ?? '') !== form.employeeId
    || user.isActive !== form.isActive
    || (user.roleIds ?? []).length !== form.roleIds.length
    || (user.roleIds ?? []).some((roleId, index) => roleId !== form.roleIds[index])
  )), [form, user])
  const linkedEmployee = useMemo(() => employees.find((employee) => employee.id === user?.employeeId) ?? null, [employees, user?.employeeId])
  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === form?.employeeId) ?? null, [employees, form?.employeeId])
  const assignedRoles = useMemo(() => {
    if (!user) return []
    const assignedIds = new Set(isEditing ? form?.roleIds ?? [] : user.roleIds ?? [])
    return roles.filter((role) => assignedIds.size > 0 ? assignedIds.has(role.id) : (user.roles ?? [user.role]).includes(role.key))
  }, [form?.roleIds, isEditing, roles, user])
  const availableRoles = useMemo(() => roles.filter((role) => !assignedRoles.some((assigned) => assigned.id === role.id)), [assignedRoles, roles])
  const availableEmployees = useMemo(() => employees.filter((employee) => employee.isActive && (!employee.userId || employee.id === user?.employeeId)), [employees, user?.employeeId])
  const allAssignedSelected = assignedRoles.length > 0 && assignedRoles.every((role) => roleIdsToRemove.includes(role.id))
  const someAssignedSelected = assignedRoles.some((role) => roleIdsToRemove.includes(role.id))
  const avatarSource = !avatarFailed && user?.avatarUrl ? resolveApiAssetUrl(user.avatarUrl) : null

  useEffect(() => { if (selectAllRolesRef.current) selectAllRolesRef.current.indeterminate = someAssignedSelected && !allAssignedSelected }, [allAssignedSelected, someAssignedSelected])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: isEditing && isDirty }))
    return () => { window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false })) }
  }, [isDirty, isEditing])

  function cancelEditing() {
    if (!user) return
    setForm(toForm(user))
    setEmailError('')
    setRoleIdsToRemove([])
    setSelectedRoleIds([])
    setIsRoleDialogOpen(false)
    setIsEditing(false)
  }

  function requestBack() {
    if (isEditing && isDirty) setShowLeaveConfirm(true)
    else onBack()
  }

  async function persistChanges() {
    if (!user || !form || !isEditing) return
    setIsSaving(true)
    try {
      const hasRoleChanges = (user.roleIds ?? []).length !== form.roleIds.length
        || (user.roleIds ?? []).some((roleId, index) => roleId !== form.roleIds[index])
      const hasAccountChanges = user.email !== form.email || user.isActive !== form.isActive || hasRoleChanges
      const { roleIds, ...accountValues } = form
      let updated = hasAccountChanges ? await updateUser(user.id, { ...accountValues, ...(hasRoleChanges ? { roleIds } : {}) }) : user
      const currentEmployeeId = user.employeeId ?? ''
      if (form.employeeId !== currentEmployeeId) {
        updated = form.employeeId ? await linkUserEmployee(user.id, form.employeeId) : await unlinkUserEmployee(user.id)
      }
      setUser(updated)
      setForm(toForm(updated))
      setIsEditing(false)
      setPendingConfirmation(null)
      setToast({ message: 'Đã lưu thay đổi tài khoản.', isError: false })
      const [employeeItems, auditLogs] = await Promise.all([getUserEmployeeOptions(), getUserActivity(user.id)])
      setEmployees(employeeItems)
      setActivity(auditLogs)
      setVisibleLogs(5)
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Không thể lưu thay đổi tài khoản.', isError: true })
    } finally {
      setIsSaving(false)
    }
  }

  function save() {
    if (!user || !form || !isEditing) return
    const nextEmailError = emailValidationMessage(form.email)
    if (nextEmailError) {
      setEmailError(nextEmailError)
      setToast({ message: 'Vui lòng nhập đầy đủ các thông tin bắt buộc.', isError: true })
      window.requestAnimationFrame(() => emailInputRef.current?.focus())
      return
    }
    setEmailError('')
    if (!isDirty) return
    if (user.isActive && !form.isActive) { setPendingConfirmation('INACTIVE'); return }
    void persistChanges()
  }

  function applyRoles() {
    if (!form || selectedRoleIds.length === 0) return
    setForm({ ...form, roleIds: [...new Set([...form.roleIds, ...selectedRoleIds])] })
    setSelectedRoleIds([])
    setIsRoleDialogOpen(false)
  }

  function removeRoles() {
    if (!form || roleIdsToRemove.length === 0) return
    setForm({ ...form, roleIds: form.roleIds.filter((roleId) => !roleIdsToRemove.includes(roleId)) })
    setRoleIdsToRemove([])
    setPendingConfirmation(null)
  }

  if (isLoading) return <LoadingState />
  if (hasError) return <ErrorState onRetry={() => void load()} />
  if (!user || !form) return <EmptyState title="Không tìm thấy tài khoản" description="Tài khoản này không còn trong dữ liệu hiện có." />

  const statusOptions = [{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng tài khoản"><button className="breadcrumb-link" type="button" onClick={requestBack}>Tài khoản người dùng</button><span aria-hidden="true">/</span><strong>{user.email}</strong></nav>
    <section className="user-profile-header user-detail-header">
      <div className="user-profile-main">{avatarSource ? <img className="profile-avatar" src={avatarSource} alt={`Ảnh đại diện ${linkedEmployee?.fullName ?? user.fullName}`} onError={() => setAvatarFailed(true)} /> : <span className="profile-avatar" aria-hidden="true">{initial(linkedEmployee?.fullName ?? user.fullName)}</span>}<div><h1>{linkedEmployee?.fullName ?? user.fullName}</h1><p>{user.email}</p></div></div>
      <div className="user-profile-actions">{isEditing ? <><button className="secondary-button" type="button" onClick={cancelEditing} disabled={isSaving}>Hủy</button><button className="primary-button" type="button" onClick={save} disabled={!isDirty || isSaving}>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></> : <><button className="secondary-button" type="button" onClick={requestBack}>← Quay lại</button><button className="secondary-button" type="button" onClick={() => setIsEditing(true)}>Chỉnh sửa</button></>}</div>
    </section>

    <SurfaceCard className="user-detail-section user-information-card">
      <div className="user-section-heading"><h2>Thông tin tài khoản</h2></div>
      <div className="detail-facts user-detail-form user-information-grid">
        {isEditing ? <><label><span className="required-field-label">Email</span><input ref={emailInputRef} type="email" value={form.email} onChange={(event) => { const email = event.target.value; setForm({ ...form, email }); if (emailError) setEmailError(emailValidationMessage(email)) }} onBlur={() => setEmailError(emailValidationMessage(form.email))} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? 'user-email-error' : undefined} disabled={isSaving} />{emailError && <small className="field-error" id="user-email-error">{emailError}</small>}</label><label><span>Mã nhân viên</span><FilterSelect ariaLabel="Chọn mã nhân viên" value={form.employeeId} options={[{ value: '', label: 'Chưa liên kết' }, ...availableEmployees.map((employee) => ({ value: employee.id, label: employee.employeeCode }))]} onChange={(employeeId) => setForm((current) => current ? { ...current, employeeId } : current)} disabled={isSaving} /></label><label><span>Họ tên</span><input className="readonly-field" value={selectedEmployee?.fullName ?? 'Chưa liên kết'} readOnly disabled /></label><div className="detail-status"><span>Trạng thái</span><FilterSelect ariaLabel="Trạng thái tài khoản" value={String(form.isActive)} options={statusOptions} onChange={(value) => setForm({ ...form, isActive: value === 'true' })} disabled={isSaving} /></div></> : <><div className="user-detail-static-field"><span>Email</span><strong>{user.email}</strong></div><div className="user-detail-static-field"><span>Mã nhân viên</span>{linkedEmployee ? <button className="master-code-link user-employee-code-link" type="button" onClick={() => onOpenEmployee(linkedEmployee.id)}>{linkedEmployee.employeeCode}</button> : <strong>Chưa liên kết</strong>}</div><div className="user-detail-static-field"><span>Họ tên</span><strong>{linkedEmployee?.fullName ?? 'Chưa liên kết'}</strong></div><div className="detail-status"><span>Trạng thái</span><ActiveStatusBadge isActive={user.isActive} /></div></>}
      </div>
    </SurfaceCard>

    <SurfaceCard className="user-detail-section user-roles-card"><div className="user-section-heading user-roles-heading"><h2>Vai trò</h2>{isEditing && <div><button className="secondary-button compact-button user-add-role-button" type="button" disabled={isSaving} onClick={() => { setSelectedRoleIds([]); setIsRoleDialogOpen(true) }}>+ Thêm vai trò</button>{roleIdsToRemove.length > 0 && <button className="danger-button compact-button" type="button" disabled={isSaving} onClick={() => setPendingConfirmation('REMOVE_ROLES')}>Gỡ ({roleIdsToRemove.length})</button>}</div>}</div>{assignedRoles.length === 0 ? <EmptyState title="Chưa có vai trò nào được gán cho tài khoản này." description="" /> : <DataTable className="admin-table user-roles-table"><thead><tr>{isEditing && <th className="user-role-selection"><input ref={selectAllRolesRef} type="checkbox" aria-label="Chọn tất cả vai trò" checked={allAssignedSelected} disabled={isSaving} onChange={() => setRoleIdsToRemove(allAssignedSelected ? [] : assignedRoles.map((role) => role.id))} /></th>}<th className="user-role-number">#</th><th>Mã vai trò</th><th>Tên vai trò</th></tr></thead><tbody>{assignedRoles.map((role, index) => <tr className={isEditing && roleIdsToRemove.includes(role.id) ? 'is-selected' : ''} key={role.id}>{isEditing && <td className="user-role-selection"><input type="checkbox" aria-label={`Chọn ${role.name}`} checked={roleIdsToRemove.includes(role.id)} disabled={isSaving} onChange={() => setRoleIdsToRemove((current) => current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id])} /></td>}<td className="user-role-number">{index + 1}</td><td>{role.key}</td><td><strong>{role.name}</strong></td></tr>)}</tbody></DataTable>}</SurfaceCard>

    <section className="employee-activity-section user-audit-section"><div className="employee-activity-heading"><div><h2>Lịch sử</h2></div></div><SurfaceCard className="employee-activity-card">{activity.length ? <><div className="employee-activity-list">{activity.slice(0, visibleLogs).map((log) => { const changes = userChangeDetails(log); return <article className="activity-log-row" key={log.id}><div><strong>{auditDescription(log, user.email, currentUserId)}</strong>{changes.length > 0 && <p>Thay đổi: {changes.join(' · ')}</p>}</div><time>{formatDateTime(log.occurredAt)}</time></article> })}</div>{visibleLogs < activity.length && <div className="employee-activity-more"><button className="secondary-button" type="button" onClick={() => setVisibleLogs((count) => count + 5)}>Xem thêm</button></div>}</> : <p className="employee-activity-empty">Chưa có lịch sử liên quan đến tài khoản này.</p>}</SurfaceCard></section>

    {isRoleDialogOpen && <div className="modal-backdrop department-job-title-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsRoleDialogOpen(false) }}><section className="modal-panel department-job-title-modal" role="dialog" aria-modal="true" aria-labelledby="user-role-dialog-title"><header className="modal-header"><div><h2 id="user-role-dialog-title">Thêm vai trò</h2></div><button className="icon-button" type="button" aria-label="Đóng hộp thoại" onClick={() => setIsRoleDialogOpen(false)} disabled={isSaving}>×</button></header><div className="department-job-title-modal-content">{availableRoles.length === 0 ? <p className="department-job-title-modal-empty">Tất cả vai trò hoạt động đã được gán cho tài khoản này.</p> : <DataTable className="department-job-title-selection-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả vai trò" checked={availableRoles.length > 0 && availableRoles.every((role) => selectedRoleIds.includes(role.id))} onChange={() => setSelectedRoleIds(availableRoles.every((role) => selectedRoleIds.includes(role.id)) ? [] : availableRoles.map((role) => role.id))} disabled={isSaving} /></th><th>Mã vai trò</th><th>Tên vai trò</th></tr></thead><tbody>{availableRoles.map((role) => <tr className={selectedRoleIds.includes(role.id) ? 'is-selected' : ''} key={role.id}><td><input type="checkbox" checked={selectedRoleIds.includes(role.id)} aria-label={`Chọn ${role.name}`} onChange={() => setSelectedRoleIds((current) => current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id])} disabled={isSaving} /></td><td><span>{role.key}</span></td><td><strong>{role.name}</strong></td></tr>)}</tbody></DataTable>}</div><footer className="modal-actions"><button className="secondary-button" type="button" onClick={() => setIsRoleDialogOpen(false)} disabled={isSaving}>Hủy</button><button className="primary-button" type="button" onClick={applyRoles} disabled={selectedRoleIds.length === 0 || isSaving}>Áp dụng{selectedRoleIds.length ? ` (${selectedRoleIds.length})` : ''}</button></footer></section></div>}

    {showLeaveConfirm && <ConfirmDialog title="Chưa lưu thay đổi" description="Thông tin tài khoản đang chỉnh sửa sẽ bị hủy nếu bạn rời khỏi trang." confirmLabel="Rời khỏi trang" tone="danger" onCancel={() => setShowLeaveConfirm(false)} onConfirm={() => { cancelEditing(); setShowLeaveConfirm(false); onBack() }} />}
    {pendingConfirmation === 'INACTIVE' && <ConfirmDialog title="Ngưng hoạt động tài khoản?" description="Tài khoản sẽ không thể đăng nhập cho đến khi được hoạt động lại. Trạng thái nhân viên không tự thay đổi." confirmLabel="Ngưng hoạt động" tone="danger" onCancel={() => setPendingConfirmation(null)} onConfirm={() => void persistChanges()} isConfirming={isSaving} />}
    {pendingConfirmation === 'REMOVE_ROLES' && <ConfirmDialog title="Gỡ vai trò" description={`Bạn có chắc chắn muốn gỡ ${roleIdsToRemove.length} vai trò đã chọn?`} confirmLabel="Gỡ" tone="danger" onCancel={() => setPendingConfirmation(null)} onConfirm={removeRoles} compact />}
    {toast && <div className={toast.isError ? 'toast-message toast-error' : 'toast-message'} role="status">{toast.message}</div>}
  </>
}
