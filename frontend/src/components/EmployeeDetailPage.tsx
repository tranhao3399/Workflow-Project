import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getUserById } from '../services/administration.service'
import { getEmployeeAuditLogs, type EmployeeAuditLog } from '../services/employee-audit.service'
import { getActiveEmployeeOptions, getEmployeeById, updateEmployee } from '../services/employees.service'
import { getReferenceData } from '../services/reference-data.service'
import { resolveApiAssetUrl } from '../services/api-client'
import type { Employee, EmployeeFormValues, EmploymentType } from '../types/employees'
import type { ReferenceData } from '../types/reference-data'
import { formatDate, formatRole } from '../utils/formatters'
import { ActivityStatusBadge } from './StatusBadge'
import { EmptyState, ErrorState, LoadingState } from './DataStates'
import { DatePicker } from './ui/DatePicker'
import { FilterSelect } from './ui/FilterSelect'
import { ProfileField } from './ui/ProfileField'
import { SurfaceCard } from './ui/SurfaceCard'

interface Props { employeeId: string; onBack: () => void; onCreateAccount: (employeeId: string) => void; onOpenUser: (userId: string) => void; onCurrentUserUpdated: () => void; canUpdateEmployee: boolean; canChangeEmployeeStatus: boolean }
type Tab = 'OVERVIEW' | 'ORGANIZATION' | 'ACCOUNT'
type Toast = { message: string; tone: 'success' | 'error' }
const labels: Record<string, string> = { fullName: 'Họ và tên', workEmail: 'Email công việc', phone: 'Điện thoại', address: 'Địa chỉ', department: 'Phòng ban', departmentId: 'Phòng ban', position: 'Chức danh', positionId: 'Chức danh', managerId: 'Quản lý trực tiếp', employmentType: 'Loại nhân sự', isActive: 'Trạng thái làm việc', roles: 'Vai trò', email: 'Email đăng nhập', userId: 'Tài khoản liên kết', employeeId: 'Nhân viên liên kết' }
const sensitive = /password|secret|token|jwt|avatar|dateofbirth|binary|file/i
function toForm(employee: Employee): EmployeeFormValues { return { employeeCode: employee.employeeCode, fullName: employee.fullName, workEmail: employee.workEmail, department: employee.department, departmentId: employee.departmentId, position: employee.position, positionId: employee.positionId, phone: employee.phone, address: employee.address, dateOfBirth: employee.dateOfBirth, hiredAt: employee.hiredAt, employmentType: employee.employmentType ?? 'FULL_TIME', managerId: employee.managerId, isActive: employee.isActive } }
function actor(log: EmployeeAuditLog) { return log.actor.fullName ?? (log.actor.rolesAtTime?.includes('ADMIN') ? 'Quản trị viên' : log.actor.userId ? 'Người dùng hệ thống' : 'Hệ thống') }
function description(log: EmployeeAuditLog) { const name = actor(log); const descriptions: Record<string, string> = { 'EMPLOYEE.CREATED': `${name} đã tạo hồ sơ nhân viên`, 'EMPLOYEE.UPDATED': `${name} đã cập nhật thông tin nhân viên`, 'EMPLOYEE.ACTIVATED': `${name} đã kích hoạt làm việc cho nhân viên`, 'EMPLOYEE.DEACTIVATED': `${name} đã ngừng làm việc của nhân viên`, 'EMPLOYEE.AVATAR_UPDATED': `${name} đã cập nhật ảnh đại diện nhân viên`, 'USER.EMPLOYEE_LINKED': `${name} đã liên kết tài khoản với nhân viên`, 'USER.EMPLOYEE_UNLINKED': `${name} đã hủy liên kết tài khoản`, 'USER.DEACTIVATED': `${name} đã ngưng hoạt động tài khoản` }; return descriptions[log.action] ?? `${name} đã cập nhật tài khoản người dùng` }
function dateTime(value: string) { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) }

export function EmployeeDetailPage({ employeeId, onBack, onCreateAccount, onOpenUser, onCurrentUserUpdated, canUpdateEmployee, canChangeEmployeeStatus }: Props) {
  const [employee, setEmployee] = useState<Employee | null>(null); const [form, setForm] = useState<EmployeeFormValues | null>(null); const [people, setPeople] = useState<Employee[]>([]); const [references, setReferences] = useState<ReferenceData | null>(null); const [account, setAccount] = useState<Awaited<ReturnType<typeof getUserById>>>(null); const [logs, setLogs] = useState<EmployeeAuditLog[]>([])
  const [tab, setTab] = useState<Tab>('OVERVIEW'); const [editing, setEditing] = useState(false); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [failed, setFailed] = useState(false); const [menuOpen, setMenuOpen] = useState(false); const [pendingNavigation, setPendingNavigation] = useState(false); const [visibleLogs, setVisibleLogs] = useState(5); const [avatarFailed, setAvatarFailed] = useState(false); const [toast, setToast] = useState<Toast | null>(null)
  const menuRef = useRef<HTMLDivElement>(null); const auditRef = useRef<HTMLElement>(null)
  const load = useCallback(async () => { try { const current = await getEmployeeById(employeeId); const [activePeople, referenceResult, linked] = await Promise.all([getActiveEmployeeOptions(), getReferenceData(), current?.userId ? getUserById(current.userId) : Promise.resolve(null)]); setEmployee(current); setForm(current ? toForm(current) : null); setPeople(activePeople); setReferences(referenceResult.data); setAccount(linked); setLogs(current ? await getEmployeeAuditLogs(current.id, current.userId) : []); setFailed(false) } catch { setFailed(true) } finally { setLoading(false) } }, [employeeId])
  // Initial/detail route synchronization with the server.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 4000); return () => window.clearTimeout(id) }, [toast])
  useEffect(() => { if (!menuOpen) return; const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false) }; const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }; document.addEventListener('mousedown', close); document.addEventListener('keydown', esc); return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) } }, [menuOpen])
  // Permission changes can invalidate an already open edit session.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { if (editing && !canUpdateEmployee) { setEditing(false); setToast({ message: 'Bạn không có quyền chỉnh sửa thông tin nhân viên.', tone: 'error' }) } }, [editing, canUpdateEmployee])
  useEffect(() => { if (employee?.updatedAt) onCurrentUserUpdated() }, [employee?.updatedAt, onCurrentUserUpdated])
  const manager = useMemo(() => people.find((item) => item.id === employee?.managerId), [people, employee?.managerId]); const positions = useMemo(() => references?.positions.filter((item) => !form?.departmentId || !item.departmentId || (typeof item.departmentId === 'string' ? item.departmentId === form.departmentId : item.departmentId._id === form.departmentId)) ?? [], [form, references]); const dirty = Boolean(employee && form && JSON.stringify(toForm(employee)) !== JSON.stringify(form)); const valid = Boolean(form?.fullName.trim() && form && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail))
  const discardAndBack = useCallback(() => {
    if (employee) setForm(toForm(employee))
    setAvatarFailed(false)
    setEditing(false)
    setPendingNavigation(false)
    onBack()
  }, [employee, onBack])
  const requestBack = useCallback(() => {
    if (pendingNavigation) return
    if (!editing || !dirty) {
      onBack()
      return
    }
    setPendingNavigation(true)
    window.dispatchEvent(new CustomEvent('workflow:navigate-request', {
      detail: {
        onConfirm: discardAndBack,
      },
    }))
  }, [dirty, discardAndBack, editing, onBack, pendingNavigation])
  useEffect(() => {
    const breadcrumb = document.querySelector<HTMLElement>('.detail-breadcrumb')
    const breadcrumbLink = breadcrumb?.firstElementChild as HTMLElement | null
    if (breadcrumbLink) {
      breadcrumbLink.classList.add('breadcrumb-link')
      breadcrumbLink.setAttribute('role', 'link')
      breadcrumbLink.setAttribute('tabindex', '0')
    }
    window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: editing && dirty }))
    const guard = (event: MouseEvent) => {
      const breadcrumbTarget = (event.target as HTMLElement).closest('.detail-breadcrumb > :first-child')
      if (breadcrumbTarget) {
        event.preventDefault()
        event.stopImmediatePropagation()
        requestBack()
        return
      }
      const target = (event.target as HTMLElement).closest('.user-profile-actions button')
      if (!target || !target.textContent?.includes('Quay lại')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      requestBack()
    }
    const keyGuard = (event: KeyboardEvent) => {
      const target = (event.target as HTMLElement).closest('.detail-breadcrumb > :first-child')
      if (!target || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      requestBack()
    }
    document.addEventListener('click', guard, true)
    document.addEventListener('keydown', keyGuard, true)
    const cancelNavigation = () => setPendingNavigation(false)
    window.addEventListener('workflow:navigate-cancel', cancelNavigation)
    return () => {
      document.removeEventListener('click', guard, true)
      document.removeEventListener('keydown', keyGuard, true)
      window.removeEventListener('workflow:navigate-cancel', cancelNavigation)
      window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false }))
    }
  }, [dirty, editing, requestBack])
  const update = <K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) => { if (key === 'isActive' && !canChangeEmployeeStatus) { setToast({ message: 'Bạn không có quyền thay đổi trạng thái nhân viên.', tone: 'error' }); return } if (form) setForm({ ...form, [key]: value }) }
  const reset = () => { if (!employee) return; setForm(toForm(employee)); setAvatarFailed(false); setEditing(false) }
  async function save() { if (!employee || !form || !dirty || !valid) return; const current = toForm(employee); const changes = Object.fromEntries(Object.entries(form).filter(([key, value]) => value !== current[key as keyof EmployeeFormValues])) as Partial<EmployeeFormValues>; if (changes.fullName !== undefined) changes.fullName = changes.fullName.trim(); if (changes.workEmail !== undefined) changes.workEmail = changes.workEmail.trim().toLowerCase(); setSaving(true); try { const updated = await updateEmployee(employee.id, changes); setEmployee(updated); setForm(toForm(updated)); setEditing(false); setToast({ message: 'Đã lưu cập nhật hồ sơ nhân viên.', tone: 'success' }); if (!employee.id.startsWith('emp-')) setLogs(await getEmployeeAuditLogs(employee.id, employee.userId)) } catch (error) { setToast({ message: error instanceof Error ? error.message : 'Không thể lưu thay đổi.', tone: 'error' }) } finally { setSaving(false) } }
  if (loading) return <LoadingState />; if (failed) return <ErrorState onRetry={() => void load()} />; if (!employee || !form) return <EmptyState title="Không tìm thấy nhân viên" description="Hồ sơ này không còn trong dữ liệu hiện có." />
  const source = !avatarFailed && employee.avatarUrl ? resolveApiAssetUrl(employee.avatarUrl) : null; const avatar = source ? <img className="employee-avatar" src={source} alt={`Ảnh đại diện ${employee.fullName}`} onError={() => setAvatarFailed(true)} /> : <span className="employee-avatar employee-avatar-fallback">{employee.fullName.trim().charAt(0).toUpperCase() || 'N'}</span>; const editable = editing && !saving
  return <><nav className="detail-breadcrumb"><span>Nhân viên</span><span>/</span><strong>{employee.fullName}</strong></nav><section className="employee-summary-card"><div className="employee-summary-main"><div className="employee-avatar-wrap">{avatar}</div><div><h2>{employee.fullName}</h2><p className="employee-summary-code">{employee.employeeCode}</p><p className="employee-summary-email">{employee.workEmail}</p></div></div><div className="user-profile-actions">{editing ? <><button className="secondary-button" type="button" onClick={reset}>Hủy</button><button className="primary-button" type="button" disabled={!dirty || !valid || saving} onClick={() => void save()}>Lưu thay đổi</button></> : <><button className="secondary-button" type="button" onClick={onBack}>← Quay lại</button><button className="secondary-button" type="button" onClick={() => setEditing(true)}>Chỉnh sửa</button><div className="employee-action-menu" ref={menuRef}><button className="secondary-button" type="button" onClick={() => setMenuOpen((open) => !open)}>⋯ Thao tác</button>{menuOpen && <div className="employee-action-menu-popover" role="menu">{!account && <button type="button" role="menuitem" onClick={() => onCreateAccount(employee.id)}>Tạo/Liên kết tài khoản</button>}<button type="button" role="menuitem" onClick={() => auditRef.current?.scrollIntoView({ behavior: 'smooth' })}>Đi tới nhật ký thay đổi</button></div>}</div></>}</div></section>
    <SurfaceCard className="employee-detail-card"><div className="detail-tabs" role="tablist"><button className={tab === 'OVERVIEW' ? 'active' : ''} type="button" onClick={() => setTab('OVERVIEW')}>Tổng quan</button><button className={tab === 'ORGANIZATION' ? 'active' : ''} type="button" onClick={() => setTab('ORGANIZATION')}>Tổ chức &amp; phê duyệt</button><button className={tab === 'ACCOUNT' ? 'active' : ''} type="button" onClick={() => setTab('ACCOUNT')}>Tài khoản &amp; phân quyền</button></div>{tab === 'OVERVIEW' && <div className="profile-field-grid"><ProfileField label="Mã nhân viên" value={employee.employeeCode} isEditing={editable} /><ProfileField label="Họ và tên" value={employee.fullName} isEditing={editable} required editControl={<input value={form.fullName} onChange={(event) => update('fullName', event.target.value)} />} /><ProfileField label="Email công việc" value={employee.workEmail} isEditing={editable} required editControl={<input type="email" value={form.workEmail} onChange={(event) => update('workEmail', event.target.value)} />} /><ProfileField label="Trạng thái" value={<ActivityStatusBadge isActive={employee.isActive} />} isEditing={editable} editControl={<FilterSelect ariaLabel="Chọn trạng thái làm việc" value={String(form.isActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]} onChange={(value) => update('isActive', value === 'true')} />} /><ProfileField label="Điện thoại" value={employee.phone} isEditing={editable} editControl={<input type="tel" value={form.phone ?? ''} onChange={(event) => update('phone', event.target.value)} />} /><ProfileField label="Ngày sinh" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : undefined} isEditing={editable} editControl={<DatePicker ariaLabel="Ngày sinh" value={form.dateOfBirth} onChange={(value) => update('dateOfBirth', value)} />} /><ProfileField label="Ngày vào làm" value={employee.hiredAt ? formatDate(employee.hiredAt) : undefined} isEditing={editable} editControl={<DatePicker ariaLabel="Ngày vào làm" value={form.hiredAt} onChange={(value) => update('hiredAt', value)} />} /><ProfileField label="Phòng ban" value={employee.department} isEditing={editable} required editControl={<FilterSelect ariaLabel="Chọn phòng ban" value={form.departmentId ?? ''} options={[{ value: '', label: form.department || 'Chọn phòng ban' }, ...(references?.departments.map((item) => ({ value: item._id, label: item.name })) ?? [])]} onChange={(value) => { const item = references?.departments.find((department) => department._id === value); setForm({ ...form, departmentId: value || undefined, department: item?.name ?? form.department, positionId: undefined, position: '' }) }} />} /><ProfileField label="Chức danh" value={employee.position} isEditing={editable} required editControl={<FilterSelect ariaLabel="Chọn chức danh" value={form.positionId ?? ''} options={[{ value: '', label: form.position || 'Chọn chức danh' }, ...positions.map((item) => ({ value: item._id, label: item.name }))]} onChange={(value) => { const item = positions.find((position) => position._id === value); setForm({ ...form, positionId: value || undefined, position: item?.name ?? form.position }) }} />} /><ProfileField label="Loại nhân sự" value={form.employmentType === 'CONTRACT' ? 'Hợp đồng' : form.employmentType === 'INTERN' ? 'Thực tập' : 'Chính thức'} isEditing={editable} editControl={<FilterSelect ariaLabel="Chọn loại nhân sự" value={form.employmentType} options={[{ value: 'FULL_TIME', label: 'Chính thức' }, { value: 'CONTRACT', label: 'Hợp đồng' }, { value: 'INTERN', label: 'Thực tập' }]} onChange={(value) => update('employmentType', value as EmploymentType)} />} /><ProfileField label="Địa chỉ" value={employee.address} isEditing={editable} editControl={<input value={form.address ?? ''} onChange={(event) => update('address', event.target.value)} />} /></div>}{tab === 'ORGANIZATION' && <div className="profile-field-grid profile-field-grid-organization"><ProfileField label="Quản lý trực tiếp" value={manager ? `${manager.fullName} · ${manager.employeeCode}` : undefined} isEditing={editable} editControl={<FilterSelect ariaLabel="Chọn quản lý trực tiếp" value={form.managerId ?? ''} options={[{ value: '', label: 'Chưa thiết lập' }, ...people.filter((item) => item.id !== employee.id && item.isActive).map((item) => ({ value: item.id, label: `${item.fullName} · ${item.employeeCode}` }))]} onChange={(value) => update('managerId', value || undefined)} />} /><p className="employee-display-note">Workflow dùng Quản lý trực tiếp của người gửi từ managerId hiện tại cho các phiếu mới.</p></div>}{tab === 'ACCOUNT' && <div className="employee-account-panel"><p className="state-kicker">TÀI KHOẢN VÀ PHÂN QUYỀN</p>{account ? <div className="employee-account-content"><div><h3>{account.email}</h3><p className="role-chip-list">{(account.roles ?? [account.role]).map((role) => <span className="role-chip" key={role}>{formatRole(role)}</span>)}</p><ActivityStatusBadge isActive={account.isActive} /></div><button className="secondary-button" type="button" onClick={() => onOpenUser(account.id)}>Xem tài khoản người dùng</button></div> : <div className="employee-account-content"><div><h3>Chưa có tài khoản người dùng</h3><p>Hồ sơ nhân sự có thể tồn tại độc lập.</p></div><button className="primary-button" type="button" onClick={() => onCreateAccount(employee.id)}>Tạo tài khoản</button></div>}</div>}</SurfaceCard>
    <section className="employee-activity-section" ref={auditRef}><div className="employee-activity-heading"><div><p className="state-kicker">AUDIT LOG</p><h2>Nhật ký thay đổi</h2></div></div><SurfaceCard className="employee-activity-card"><div className="employee-activity-list">{logs.slice(0, visibleLogs).map((log) => { const fields = [...new Set([...Object.keys(log.changes?.before ?? {}), ...Object.keys(log.changes?.after ?? {})])].filter((field) => !sensitive.test(field)).map((field) => labels[field] ?? field); return <article className="activity-log-row" key={log._id ?? log.id}><div><strong>{description(log)}</strong>{fields.length > 0 && <p>Thay đổi: {fields.join(', ')}</p>}<small>{log.action}</small></div><time>{dateTime(log.occurredAt)}</time></article> })}{!logs.length && <p className="employee-activity-empty">Chưa có nhật ký thay đổi liên quan đến nhân viên hoặc tài khoản liên kết.</p>}</div>{visibleLogs < logs.length && <div className="employee-activity-more"><button className="secondary-button" type="button" onClick={() => setVisibleLogs((count) => count + 5)}>Xem thêm</button></div>}</SurfaceCard></section>{toast && <div className={`toast-message${toast.tone === 'error' ? ' toast-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.message}</div>}</>
}
