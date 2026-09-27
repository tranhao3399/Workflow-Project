import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../services/api-client'
import { createRoleFromApi, getPermissionRegistryFromApi, getRoleAuditLogs, getRoleFromApi, updateRoleFromApi, updateRoleStatusFromApi } from '../services/roles.service'
import type { PermissionDefinition, RoleAuditLog, RoleRecord } from '../types/roles'
import { normalizeSearchText } from '../utils/formatters'
import { ErrorState, LoadingState } from './DataStates'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { FilterSelect } from './ui/FilterSelect'
import { ActiveStatusBadge } from './ui/MasterDataStatusBadge'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'

interface RoleDetailPageProps {
  roleId?: string
  onBack: () => void
  onSaved: () => void
  canUpdateRole: boolean
}

interface RoleFormState {
  name: string
  key: string
  permissionKeys: string[]
  isActive: boolean
}

interface PermissionModule {
  key: string
  label: string
  permissions: PermissionDefinition[]
}

type MatrixColumn = 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE'
type RoleField = 'name' | 'key'
type FieldErrors = Partial<Record<RoleField, string>>

const matrixColumns: Array<{ key: MatrixColumn; label: string }> = [
  { key: 'VIEW', label: 'Xem' },
  { key: 'CREATE', label: 'Tạo' },
  { key: 'UPDATE', label: 'Chỉnh sửa' },
  { key: 'DELETE', label: 'Xóa' },
]
const emptyForm: RoleFormState = { name: '', key: '', permissionKeys: [], isActive: true }

function toPermissionModules(registry: PermissionDefinition[]): PermissionModule[] {
  const grouped = new Map<string, PermissionModule>()
  for (const permission of registry) {
    const current = grouped.get(permission.module)
    if (current) current.permissions.push(permission)
    else grouped.set(permission.module, { key: permission.module, label: permission.moduleLabel, permissions: [permission] })
  }
  return [...grouped.values()].map((module) => ({
    ...module,
    permissions: [...module.permissions].sort((first, second) => first.displayOrder - second.displayOrder || first.label.localeCompare(second.label, 'vi')),
  }))
}

function toForm(role: RoleRecord): RoleFormState {
  return { name: role.name, key: role.key, permissionKeys: role.permissionKeys, isActive: role.isActive }
}

function validate(form: RoleFormState, canEditKey: boolean): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Tên vai trò là bắt buộc.'
  else if (form.name.trim().length > 100) errors.name = 'Tên vai trò không được vượt quá 100 ký tự.'
  if (canEditKey && !/^[A-Z][A-Z0-9_]*$/.test(form.key.trim())) errors.key = 'Mã chỉ gồm A-Z, 0-9 và dấu gạch dưới.'
  return errors
}

function samePermissionKeys(first: readonly string[], second: readonly string[]) {
  return first.length === second.length && first.every((key) => second.includes(key))
}

function sameForm(first: RoleFormState, second: RoleFormState) {
  return first.name === second.name
    && first.key === second.key
    && first.isActive === second.isActive
    && samePermissionKeys(first.permissionKeys, second.permissionKeys)
}

function activityDescription(log: RoleAuditLog, roleName: string) {
  if (log.action === 'ROLE.CREATED') return `${log.actorName} đã tạo vai trò ${roleName}.`
  if (log.action === 'ROLE.PERMISSIONS_UPDATED') return `${log.actorName} đã cập nhật quyền truy cập cho vai trò ${roleName}.`
  if (log.action === 'ROLE.STATUS_CHANGED') return `${log.actorName} đã cập nhật trạng thái vai trò ${roleName}.`
  if (log.action === 'ROLE.DELETED') return `${log.actorName} đã xóa vai trò ${roleName}.`
  return `${log.actorName} đã cập nhật vai trò ${roleName}.`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function MatrixCheckbox({ checked, indeterminate = false, onChange, ariaLabel }: { checked: boolean; indeterminate?: boolean; onChange: (checked: boolean) => void; ariaLabel: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = indeterminate }, [indeterminate])
  return <input ref={inputRef} className="role-matrix-checkbox" type="checkbox" checked={checked} aria-label={ariaLabel} onChange={(event) => onChange(event.target.checked)} />
}

function StaticPermissionMark({ granted }: { granted: boolean }) {
  return <span className={granted ? 'role-matrix-mark is-granted' : 'role-matrix-mark'} aria-label={granted ? 'Đã cấp' : 'Không có quyền'}>{granted ? '✓' : '—'}</span>
}

export function RoleDetailPage({ roleId, onBack, onSaved, canUpdateRole }: RoleDetailPageProps) {
  const isCreating = !roleId
  const [role, setRole] = useState<RoleRecord | null>(null)
  const [registry, setRegistry] = useState<PermissionDefinition[] | null>(null)
  const [form, setForm] = useState<RoleFormState>(emptyForm)
  const [original, setOriginal] = useState<RoleFormState>(emptyForm)
  const [isEditing, setIsEditing] = useState(isCreating)
  const [isLoading, setIsLoading] = useState(!isCreating)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<Partial<Record<RoleField, boolean>>>({})
  const [formError, setFormError] = useState('')
  const [showInactiveConfirm, setShowInactiveConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [grantedOnly, setGrantedOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSpecialModules, setExpandedSpecialModules] = useState<Set<string>>(() => new Set())
  const [successMessage, setSuccessMessage] = useState('')
  const [activity, setActivity] = useState<RoleAuditLog[]>([])
  const [activityPage, setActivityPage] = useState(1)
  const [hasMoreActivity, setHasMoreActivity] = useState(false)
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)

  const modules = useMemo(() => toPermissionModules(registry ?? []), [registry])
  const canEditKey = isCreating || role?.isSystem !== true
  const validation = useMemo(() => validate(form, canEditKey), [form, canEditKey])
  const isDirty = !sameForm(form, original)
  const isValid = Object.keys(validation).length === 0
  const selectedKeys = useMemo(() => new Set(form.permissionKeys), [form.permissionKeys])
  const filteredModules = useMemo(() => {
    const query = normalizeSearchText(searchQuery.trim())
    return modules.filter((module) => {
      const matchesSearch = !query || [module.label, ...module.permissions.flatMap((permission) => [permission.key, permission.label])]
        .some((value) => normalizeSearchText(value).includes(query))
      const hasGrantedPermission = module.permissions.some((permission) => selectedKeys.has(permission.key))
      return matchesSearch && (!grantedOnly || hasGrantedPermission)
    })
  }, [grantedOnly, modules, searchQuery, selectedKeys])
  const hasGrantedPermissions = modules.some((module) => module.permissions.some((permission) => selectedKeys.has(permission.key)))

  async function loadActivity(page: number, replace = false) {
    if (!roleId) return
    setIsLoadingActivity(true)
    try {
      const result = await getRoleAuditLogs(roleId, page)
      setActivity((current) => replace ? result.items : [...current, ...result.items])
      setActivityPage(page)
      setHasMoreActivity(result.hasMore)
    } finally {
      setIsLoadingActivity(false)
    }
  }

  async function load() {
    try {
      const [roleResult, registryResult] = await Promise.all([
        roleId ? getRoleFromApi(roleId) : Promise.resolve(null),
        getPermissionRegistryFromApi(),
      ])
      if (roleResult) {
        const next = toForm(roleResult)
        setRole(roleResult)
        setForm(next)
        setOriginal(next)
        void loadActivity(1, true)
      }
      setRegistry(registryResult)
      setHasLoadError(false)
    } catch {
      setHasLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [roleId])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: isEditing && isDirty }))
    return () => { window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false })) }
  }, [isDirty, isEditing])
  useEffect(() => {
    if (!successMessage) return
    const timeoutId = window.setTimeout(() => setSuccessMessage(''), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [successMessage])

  function updateText(field: RoleField, value: string) {
    const next = { ...form, [field]: field === 'key' ? value.toUpperCase() : value }
    setForm(next)
    setFormError('')
    if (touched[field]) setErrors((current) => ({ ...current, [field]: validate(next, canEditKey)[field] }))
  }

  function permissionForColumn(module: PermissionModule, column: MatrixColumn) {
    return module.permissions.find((permission) => permission.matrixColumn === column)
  }

  function updatePermission(permission: PermissionDefinition, checked: boolean) {
    const module = modules.find((item) => item.key === permission.module)
    if (!module) return
    const viewPermission = permissionForColumn(module, 'VIEW')
    setForm((current) => {
      const next = new Set(current.permissionKeys)
      if (checked) {
        next.add(permission.key)
        if (permission.matrixColumn !== 'VIEW' && viewPermission) next.add(viewPermission.key)
      } else if (permission.matrixColumn === 'VIEW') {
        for (const item of module.permissions) next.delete(item.key)
      } else {
        next.delete(permission.key)
      }
      return { ...current, permissionKeys: [...next] }
    })
  }

  function updateModulePermissions(module: PermissionModule, checked: boolean) {
    setForm((current) => {
      const next = new Set(current.permissionKeys)
      for (const permission of module.permissions) {
        if (checked) next.add(permission.key)
        else next.delete(permission.key)
      }
      return { ...current, permissionKeys: [...next] }
    })
  }

  function updateColumnPermissions(column: MatrixColumn, checked: boolean) {
    setForm((current) => {
      const next = new Set(current.permissionKeys)
      for (const module of filteredModules) {
        const permission = permissionForColumn(module, column)
        if (!permission) continue
        const viewPermission = permissionForColumn(module, 'VIEW')
        if (checked) {
          next.add(permission.key)
          if (column !== 'VIEW' && viewPermission) next.add(viewPermission.key)
        } else if (column === 'VIEW') {
          for (const item of module.permissions) next.delete(item.key)
        } else {
          next.delete(permission.key)
        }
      }
      return { ...current, permissionKeys: [...next] }
    })
  }

  function columnState(column: MatrixColumn) {
    const items = filteredModules.flatMap((module) => {
      const permission = permissionForColumn(module, column)
      return permission ? [permission] : []
    })
    const selectedCount = items.filter((permission) => selectedKeys.has(permission.key)).length
    return { checked: items.length > 0 && selectedCount === items.length, indeterminate: selectedCount > 0 && selectedCount < items.length, hasItems: items.length > 0 }
  }

  function toggleSpecialModule(moduleKey: string) {
    setExpandedSpecialModules((current) => {
      const next = new Set(current)
      if (next.has(moduleKey)) next.delete(moduleKey)
      else next.add(moduleKey)
      return next
    })
  }

  function cancelEditing() {
    setForm(original)
    setErrors({})
    setTouched({})
    setFormError('')
    setExpandedSpecialModules(new Set())
    if (isCreating) onBack()
    else setIsEditing(false)
  }

  function requestBack() {
    if (isEditing && isDirty) setShowLeaveConfirm(true)
    else onBack()
  }

  function requestSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate(form, canEditKey)
    setTouched({ name: true, key: true })
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length || isSaving || !isDirty) return
    if (!isCreating && role?.isActive && !form.isActive) {
      setShowInactiveConfirm(true)
      return
    }
    void persist()
  }

  async function persist() {
    setIsSaving(true)
    try {
      if (isCreating) {
        await createRoleFromApi({ name: form.name.trim(), key: form.key.trim(), permissionKeys: form.permissionKeys, isActive: form.isActive })
        onSaved()
        return
      }
      if (!roleId) return
      const input = {
        ...(form.key.trim() !== original.key ? { key: form.key.trim() } : {}),
        ...(form.name.trim() !== original.name ? { name: form.name.trim() } : {}),
        ...(!samePermissionKeys(form.permissionKeys, original.permissionKeys) ? { permissionKeys: form.permissionKeys } : {}),
        ...(form.isActive !== original.isActive ? { isActive: form.isActive } : {}),
      }
      const updated = Object.keys(input).length === 1 && 'isActive' in input
        ? await updateRoleStatusFromApi(roleId, form.isActive)
        : await updateRoleFromApi(roleId, input)
      const next = toForm(updated)
      setRole(updated)
      setForm(next)
      setOriginal(next)
      setIsEditing(false)
      setShowInactiveConfirm(false)
      setExpandedSpecialModules(new Set())
      setSuccessMessage('Lưu thay đổi vai trò thành công.')
      void loadActivity(1, true)
    } catch (error) {
      if (error instanceof ApiError && (error.field === 'name' || error.field === 'key')) {
        const field = error.field as RoleField
        setTouched((current) => ({ ...current, [field]: true }))
        setErrors((current) => ({ ...current, [field]: error.message }))
      } else setFormError(error instanceof Error ? error.message : 'Không thể lưu vai trò.')
      setShowInactiveConfirm(false)
    } finally {
      setIsSaving(false)
    }
  }

  if (hasLoadError) return <ErrorState onRetry={() => { setIsLoading(true); void load() }} />
  if (isLoading || registry === null) return <LoadingState />

  const roleName = role?.name ?? 'Thêm vai trò'

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng vai trò"><button className="breadcrumb-link" type="button" onClick={requestBack}>Vai trò & phân quyền</button><span>/</span><strong>{isCreating ? 'Thêm vai trò' : roleName}</strong></nav>
    {isCreating ? <PageHeader title="Tạo vai trò" description="Tạo vai trò và phân quyền truy cập cho tài khoản trong hệ thống." /> : <section className="department-detail-summary">
      <div className="department-detail-summary-main"><h1>{roleName}</h1></div>
      {!isEditing && <div className="department-detail-actions"><button className="secondary-button compact-button" type="button" onClick={requestBack}>← Quay lại</button>{canUpdateRole && <button className="secondary-button compact-button" type="button" onClick={() => setIsEditing(true)}>Chỉnh sửa</button>}</div>}
    </section>}
    <form id="role-form" onSubmit={requestSave} noValidate>
      <SurfaceCard className="role-information-card"><h2>Thông tin vai trò</h2><div className="role-information-grid"><label><span>Mã vai trò</span>{isEditing && canEditKey ? <><input value={form.key} onChange={(event) => updateText('key', event.target.value)} onBlur={() => { setTouched((current) => ({ ...current, key: true })); setErrors((current) => ({ ...current, key: validation.key })) }} aria-invalid={Boolean(touched.key && errors.key)} placeholder="Ví dụ: REPORT_VIEWER" />{touched.key && errors.key && <small className="job-title-form-error">{errors.key}</small>}</> : <strong>{role?.key}</strong>}</label><label><span>Tên vai trò</span>{isEditing ? <><input value={form.name} onChange={(event) => updateText('name', event.target.value)} onBlur={() => { setTouched((current) => ({ ...current, name: true })); setErrors((current) => ({ ...current, name: validation.name })) }} aria-invalid={Boolean(touched.name && errors.name)} />{touched.name && errors.name && <small className="job-title-form-error">{errors.name}</small>}</> : <strong>{role?.name}</strong>}</label><label><span>Trạng thái</span>{isEditing ? <FilterSelect ariaLabel="Chọn trạng thái vai trò" value={String(form.isActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]} onChange={(value) => setForm((current) => ({ ...current, isActive: value === 'true' }))} /> : <ActiveStatusBadge isActive={role?.isActive ?? true} />}</label></div>{formError && <p className="job-title-form-server-error" role="alert">{formError}</p>}</SurfaceCard>
      <SurfaceCard className="role-permissions-card">
        <div className="role-permissions-heading"><div><h2>Quyền truy cập</h2><p>Phân quyền theo từng module và thao tác.</p></div>{isEditing && <div className="role-permissions-actions"><button className="secondary-button compact-button" type="button" disabled={isSaving} onClick={cancelEditing}>Hủy</button><button className="primary-button compact-button" type="submit" form="role-form" disabled={!isValid || !isDirty || isSaving}>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>}</div>
        <div className="role-matrix-toolbar"><label className="role-matrix-search"><span className="visually-hidden">Tìm module hoặc quyền</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm module hoặc quyền" /></label><label className="role-granted-filter"><input type="checkbox" checked={grantedOnly} onChange={(event) => setGrantedOnly(event.target.checked)} /><span>Chỉ hiển thị quyền đã cấp</span></label></div>
        {!isEditing && !hasGrantedPermissions ? <p className="role-matrix-empty">Vai trò này chưa được cấp quyền truy cập nào.</p> : <div className="role-matrix-scroll"><table className="role-matrix-table"><thead><tr><th>Module</th><th>Tất cả</th>{matrixColumns.map((column) => { const state = columnState(column.key); return <th key={column.key}>{isEditing && state.hasItems ? <MatrixCheckbox checked={state.checked} indeterminate={state.indeterminate} onChange={(checked) => updateColumnPermissions(column.key, checked)} ariaLabel={`Chọn toàn bộ quyền ${column.label} đang hiển thị`} /> : null}<span>{column.label}</span></th> })}<th>Quyền khác</th></tr></thead><tbody>{filteredModules.map((module) => { const specials = module.permissions.filter((permission) => permission.matrixColumn === 'SPECIAL'); const selectedSpecials = specials.filter((permission) => selectedKeys.has(permission.key)); const allSelected = module.permissions.length > 0 && module.permissions.every((permission) => selectedKeys.has(permission.key)); const someSelected = module.permissions.some((permission) => selectedKeys.has(permission.key)) && !allSelected; const isExpanded = expandedSpecialModules.has(module.key); return <Fragment key={module.key}><tr><th scope="row">{module.label}</th><td>{isEditing ? <MatrixCheckbox checked={allSelected} indeterminate={someSelected} onChange={(checked) => updateModulePermissions(module, checked)} ariaLabel={`Chọn tất cả quyền của ${module.label}`} /> : <StaticPermissionMark granted={allSelected} />}</td>{matrixColumns.map((column) => { const permission = permissionForColumn(module, column.key); return <td key={column.key}>{permission ? isEditing ? <MatrixCheckbox checked={selectedKeys.has(permission.key)} onChange={(checked) => updatePermission(permission, checked)} ariaLabel={`${column.label} ${module.label}`} /> : <StaticPermissionMark granted={selectedKeys.has(permission.key)} /> : <StaticPermissionMark granted={false} />}</td> })}<td>{specials.length === 0 ? <StaticPermissionMark granted={false} /> : isEditing ? <button className="role-special-toggle" type="button" aria-expanded={isExpanded} onClick={() => toggleSpecialModule(module.key)}>{`${specials.length} quyền`}</button> : selectedSpecials.length ? <div className="role-special-badges">{selectedSpecials.map((permission) => <span key={permission.key}>{permission.label}</span>)}</div> : <StaticPermissionMark granted={false} />}</td></tr>{isEditing && isExpanded && <tr className="role-special-row"><td colSpan={7}><div>{specials.map((permission) => <label key={permission.key}><MatrixCheckbox checked={selectedKeys.has(permission.key)} onChange={(checked) => updatePermission(permission, checked)} ariaLabel={`${permission.label} ${module.label}`} /><span>{permission.label}</span></label>)}</div></td></tr>}</Fragment> })}</tbody></table>{filteredModules.length === 0 && <p className="role-matrix-filter-empty">Không tìm thấy module hoặc quyền phù hợp.</p>}</div>}</SurfaceCard>
    </form>
    {!isCreating && <section className="employee-activity-section role-audit-section"><div className="employee-activity-heading"><div><h2>Nhật ký hoạt động</h2></div></div><SurfaceCard className="employee-activity-card">{activity.length ? <div className="employee-activity-list">{activity.map((log) => <article className="activity-log-row" key={log.id}><strong>{activityDescription(log, roleName)}</strong><time>{formatDateTime(log.occurredAt)}</time></article>)}</div> : <p className="employee-activity-empty">Chưa có nhật ký hoạt động liên quan đến vai trò này.</p>}{hasMoreActivity && <div className="role-audit-more"><button className="secondary-button compact-button" type="button" disabled={isLoadingActivity} onClick={() => void loadActivity(activityPage + 1)}>{isLoadingActivity ? 'Đang tải...' : 'Xem thêm'}</button></div>}</SurfaceCard></section>}
    {successMessage && <div className="toast-message" role="status">{successMessage}</div>}
    {showLeaveConfirm && <ConfirmDialog title="Chưa lưu thay đổi" description="Thông tin vai trò đang chỉnh sửa sẽ bị hủy nếu bạn rời khỏi trang." confirmLabel="Rời khỏi trang" tone="danger" onCancel={() => setShowLeaveConfirm(false)} onConfirm={onBack} />}
    {showInactiveConfirm && <ConfirmDialog title="Ngưng hoạt động vai trò?" description="Vai trò sẽ không thể được cấp hoặc sử dụng cho tài khoản. Thao tác có thể bị từ chối nếu vai trò đang được gán." confirmLabel="Ngưng hoạt động" tone="danger" isConfirming={isSaving} onCancel={() => setShowInactiveConfirm(false)} onConfirm={() => void persist()} />}
  </>
}
