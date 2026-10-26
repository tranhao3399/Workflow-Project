import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../services/api-client'
import { createRoleFromApi, deleteRoleFromApi, getPermissionRegistryFromApi, getRoleAuditLogs, getRoleFromApi, updateRoleFromApi, updateRoleStatusFromApi } from '../services/roles.service'
import type { PermissionDefinition, RoleAuditLog, RoleRecord } from '../types/roles'
import { auditActorLabel, auditChangeDetails, auditValue } from '../utils/audit-display'
import { formatDateTime, normalizeSearchText } from '../utils/formatters'
import { ErrorState, LoadingState } from './DataStates'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { FilterSelect } from './ui/FilterSelect'
import { ActiveStatusBadge } from './ui/MasterDataStatusBadge'
import { SurfaceCard } from './ui/SurfaceCard'

interface RoleDetailPageProps {
  roleId?: string
  currentUserId: string
  onBack: () => void
  onSaved: () => void
  canUpdateRole: boolean
  canDeleteRole: boolean
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
type PermissionGroup = 'PROCESS_OPERATIONS' | 'ORGANIZATION' | 'SYSTEM_ADMINISTRATION'
type RoleField = 'name' | 'key'
type FieldErrors = Partial<Record<RoleField, string>>

interface PermissionGroupDefinition {
  key: PermissionGroup
  label: string
}

const matrixColumns: Array<{ key: MatrixColumn; label: string }> = [
  { key: 'VIEW', label: 'Xem' },
  { key: 'CREATE', label: 'Tạo' },
  { key: 'UPDATE', label: 'Chỉnh sửa' },
  { key: 'DELETE', label: 'Xóa' },
]

const permissionGroups: PermissionGroupDefinition[] = [
  { key: 'PROCESS_OPERATIONS', label: 'Quy trình & vận hành' },
  { key: 'ORGANIZATION', label: 'Cơ cấu tổ chức' },
  { key: 'SYSTEM_ADMINISTRATION', label: 'Quản trị hệ thống' },
]

const moduleDisplayOrder: Record<string, number> = {
  FORM_BUILDER: 10,
  WORKFLOW_BUILDER: 20,
  REQUESTS: 30,
  APPROVALS: 40,
  DASHBOARD: 50,
  NOTIFICATION: 60,
  EMPLOYEE: 10,
  DEPARTMENT: 20,
  JOB_TITLE: 30,
  POSITION: 40,
  USER: 10,
  ROLE: 20,
  WORKSPACE_MODULE: 30,
  AUDIT_LOG: 40,
}

const emptyForm: RoleFormState = { name: '', key: '', permissionKeys: [], isActive: true }

function groupForModule(moduleKey: string): PermissionGroup {
  if (moduleKey === 'FORM_BUILDER' || moduleKey === 'WORKFLOW_BUILDER' || moduleKey === 'REQUESTS' || moduleKey === 'APPROVALS' || moduleKey === 'DASHBOARD' || moduleKey === 'NOTIFICATION') return 'PROCESS_OPERATIONS'
  if (moduleKey === 'EMPLOYEE' || moduleKey === 'DEPARTMENT' || moduleKey === 'JOB_TITLE' || moduleKey === 'POSITION') return 'ORGANIZATION'
  return 'SYSTEM_ADMINISTRATION'
}

function matrixColumnFor(permission: PermissionDefinition): MatrixColumn | null {
  if (permission.matrixColumn !== 'SPECIAL') return permission.matrixColumn
  if (permission.key === 'REQUESTS.SUBMIT') return 'CREATE'
  if (permission.key === 'REQUESTS.VOID') return 'DELETE'
  if (permission.key === 'REQUESTS.VIEW_ALL') return null
  return 'UPDATE'
}

function toPermissionModules(registry: PermissionDefinition[]): PermissionModule[] {
  const grouped = new Map<string, PermissionModule>()
  for (const permission of registry) {
    if (permission.module === 'DASHBOARD' || permission.module === 'NOTIFICATION' || permission.module === 'POSITION' || permission.key === 'REQUESTS.VIEW_ALL') continue
    const current = grouped.get(permission.module)
    if (current) current.permissions.push(permission)
    else grouped.set(permission.module, { key: permission.module, label: permission.moduleLabel, permissions: [permission] })
  }

  return [...grouped.values()]
    .map((module) => ({ ...module, permissions: [...module.permissions].sort((first, second) => first.displayOrder - second.displayOrder || first.label.localeCompare(second.label, 'vi')) }))
    .sort((first, second) => permissionGroups.findIndex((group) => group.key === groupForModule(first.key)) - permissionGroups.findIndex((group) => group.key === groupForModule(second.key)) || (moduleDisplayOrder[first.key] ?? Number.MAX_SAFE_INTEGER) - (moduleDisplayOrder[second.key] ?? Number.MAX_SAFE_INTEGER) || first.label.localeCompare(second.label, 'vi'))
}

function toForm(role: RoleRecord): RoleFormState {
  return { name: role.name, key: role.key, permissionKeys: role.permissionKeys, isActive: role.isActive }
}

function validate(form: RoleFormState, canEditKey: boolean): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.name.trim()) errors.name = 'Tên vai trò không được để trống.'
  else if (form.name.trim().length > 100) errors.name = 'Tên vai trò không được để trống.'
  if (canEditKey && !form.key.trim()) errors.key = 'Mã vai trò không được để trống.'
  else if (canEditKey && !/^[A-Z][A-Z0-9_]*$/.test(form.key.trim())) errors.key = 'Mã vai trò không được để trống.'
  return errors
}

function samePermissionKeys(first: readonly string[], second: readonly string[]) {
  return first.length === second.length && first.every((key) => second.includes(key))
}

function sameForm(first: RoleFormState, second: RoleFormState) {
  return first.name === second.name && first.key === second.key && first.isActive === second.isActive && samePermissionKeys(first.permissionKeys, second.permissionKeys)
}

function activityDescription(log: RoleAuditLog, roleName: string, currentUserId: string) {
  const actor = auditActorLabel(log.actor, currentUserId)
  if (log.action === 'ROLE.CREATED') return `${actor} đã tạo mới vai trò ${roleName}.`
  if (log.action === 'ROLE.PERMISSIONS_UPDATED') return `${actor} đã cập nhật phân quyền cho vai trò ${roleName}.`
  if (log.action === 'ROLE.STATUS_CHANGED') return `${actor} đã thay đổi trạng thái vai trò ${roleName}.`
  if (log.action === 'ROLE.DELETED') return `${actor} đã xóa vai trò ${roleName}.`
  return `${actor} đã chỉnh sửa thông tin vai trò ${roleName}.`
}

function roleChangeDetails(log: RoleAuditLog): string[] {
  const details = auditChangeDetails(log.changes, [
    { key: 'key', label: 'Mã vai trò' },
    { key: 'name', label: 'Tên vai trò' },
    { key: 'isActive', label: 'Trạng thái', format: (value) => value === true ? 'Hoạt động' : value === false ? 'Ngưng hoạt động' : auditValue(value) },
  ])
  const beforePermissions = log.changes?.before?.permissionKeys
  const afterPermissions = log.changes?.after?.permissionKeys
  if (JSON.stringify(beforePermissions ?? []) !== JSON.stringify(afterPermissions ?? [])) details.push('Phân quyền: Đã cập nhật')
  return details
}

function MatrixCheckbox({ checked, indeterminate = false, onChange, ariaLabel }: { checked: boolean; indeterminate?: boolean; onChange: (checked: boolean) => void; ariaLabel: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = indeterminate }, [indeterminate])
  return <input ref={inputRef} className="role-matrix-checkbox" type="checkbox" checked={checked} aria-label={ariaLabel} onChange={(event) => onChange(event.target.checked)} />
}

function StaticPermissionMark({ granted, partial = false }: { granted: boolean; partial?: boolean }) {
  const label = granted ? 'Đã cấp toàn bộ quyền trong nhóm' : partial ? 'Đã cấp một phần quyền trong nhóm' : 'Chưa cấp'
  return <span className={granted ? 'role-matrix-readonly-check is-granted' : partial ? 'role-matrix-readonly-check is-partial' : 'role-matrix-readonly-check'} aria-label={label}>{granted ? '✓' : partial ? '−' : ''}</span>
}

function UnavailablePermissionMark() {
  return <span className="role-matrix-unavailable" aria-label="Không có quyền này">—</span>
}

export function RoleDetailPage({ roleId, currentUserId, onBack, onSaved, canUpdateRole, canDeleteRole }: RoleDetailPageProps) {
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
  const [showInactiveConfirm, setShowInactiveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [grantedOnly, setGrantedOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<PermissionGroup>>(new Set())
  const [successMessage, setSuccessMessage] = useState('')
  const [toastIsError, setToastIsError] = useState(false)
  const [activity, setActivity] = useState<RoleAuditLog[]>([])
  const [activityPage, setActivityPage] = useState(1)
  const [hasMoreActivity, setHasMoreActivity] = useState(false)
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)

  const modules = useMemo(() => toPermissionModules(registry ?? []), [registry])

  const canEditKey = isCreating || role?.key !== 'ADMIN'
  const validation = useMemo(() => validate(form, canEditKey), [form, canEditKey])
  const isDirty = !sameForm(form, original)
  const selectedKeys = useMemo(() => new Set(form.permissionKeys), [form.permissionKeys])
  const filteredModules = useMemo(() => {
    const query = normalizeSearchText(searchQuery.trim())
    return modules.filter((module) => {
      const matchesSearch = !query || [module.label, ...module.permissions.flatMap((permission) => [permission.key, permission.label])].some((value) => normalizeSearchText(value).includes(query))
      return matchesSearch && (!grantedOnly || module.permissions.some((permission) => selectedKeys.has(permission.key)))
    })
  }, [grantedOnly, modules, searchQuery, selectedKeys])
  const groupedModules = useMemo(() => permissionGroups.map((group) => ({ ...group, modules: filteredModules.filter((module) => groupForModule(module.key) === group.key) })).filter((group) => group.modules.length > 0), [filteredModules])

  useLayoutEffect(() => {
    window.dispatchEvent(new Event('workflow:sync-scrollbar-layout'))
  }, [grantedOnly])

  const hasGrantedPermissions = modules.some((module) => module.permissions.some((permission) => selectedKeys.has(permission.key)))
  const grantedPermissionCount = modules.flatMap((module) => module.permissions).filter((permission) => selectedKeys.has(permission.key)).length
  const grantedModuleCount = modules.filter((module) => module.permissions.some((permission) => selectedKeys.has(permission.key))).length

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
      const [roleResult, registryResult] = await Promise.all([roleId ? getRoleFromApi(roleId) : Promise.resolve(null), getPermissionRegistryFromApi()])
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

  // Reload the role and permission registry whenever the route identity changes.
  // oxlint-disable-next-line react/set-state-in-effect react-hooks/exhaustive-deps
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
    if (touched[field]) setErrors((current) => ({ ...current, [field]: validate(next, canEditKey)[field] }))
  }

  function selectablePermissionsForModule(module: PermissionModule) {
    return module.permissions.filter((permission) => matrixColumnFor(permission) !== null)
  }

  function permissionsForColumn(module: PermissionModule, column: MatrixColumn) {
    return selectablePermissionsForModule(module).filter((permission) => matrixColumnFor(permission) === column)
  }

  function updatePermission(module: PermissionModule, column: MatrixColumn, checked: boolean) {
    const permissions = permissionsForColumn(module, column)
    const viewPermissions = permissionsForColumn(module, 'VIEW')
    setForm((current) => {
      const next = new Set(current.permissionKeys)
      if (checked) {
        for (const permission of permissions) next.add(permission.key)
        if (column !== 'VIEW') for (const permission of viewPermissions) next.add(permission.key)
      } else if (column === 'VIEW') {
        for (const permission of module.permissions) next.delete(permission.key)
        if (module.key === 'REQUESTS') next.delete('REQUESTS.VIEW_ALL')
      } else {
        for (const permission of permissions) next.delete(permission.key)
      }
      return { ...current, permissionKeys: [...next] }
    })
  }

  function toggleGroupExpanded(groupKey: PermissionGroup) {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  function groupPermissionState(groupKey: PermissionGroup) {
    const permissions = modules
      .filter((module) => groupForModule(module.key) === groupKey)
      .flatMap((module) => selectablePermissionsForModule(module))
    const selectedCount = permissions.filter((permission) => selectedKeys.has(permission.key)).length
    return {
      checked: permissions.length > 0 && selectedCount === permissions.length,
      indeterminate: selectedCount > 0 && selectedCount < permissions.length,
    }
  }

  function updateGroupPermissions(groupKey: PermissionGroup, checked: boolean) {
    setForm((current) => {
      const next = new Set(current.permissionKeys)
      for (const module of modules) {
        if (groupForModule(module.key) !== groupKey) continue
        for (const permission of checked ? selectablePermissionsForModule(module) : module.permissions) {
          if (checked) next.add(permission.key)
          else next.delete(permission.key)
        }
        if (!checked && module.key === 'REQUESTS') next.delete('REQUESTS.VIEW_ALL')
      }
      return { ...current, permissionKeys: [...next] }
    })
  }

  function updateColumnPermissions(column: MatrixColumn, checked: boolean) {
    setForm((current) => {
      const next = new Set(current.permissionKeys)
      for (const module of filteredModules) {
        const permissions = permissionsForColumn(module, column)
        if (!permissions.length) continue
        const viewPermissions = permissionsForColumn(module, 'VIEW')
        if (checked) {
          for (const permission of permissions) next.add(permission.key)
          if (column !== 'VIEW') for (const permission of viewPermissions) next.add(permission.key)
        } else if (column === 'VIEW') {
          for (const permission of module.permissions) next.delete(permission.key)
          if (module.key === 'REQUESTS') next.delete('REQUESTS.VIEW_ALL')
        } else {
          for (const permission of permissions) next.delete(permission.key)
        }
      }
      return { ...current, permissionKeys: [...next] }
    })
  }

  function columnState(column: MatrixColumn) {
    const items = filteredModules.flatMap((module) => permissionsForColumn(module, column))
    const selectedCount = items.filter((permission) => selectedKeys.has(permission.key)).length
    return { checked: items.length > 0 && selectedCount === items.length, indeterminate: selectedCount > 0 && selectedCount < items.length, hasItems: items.length > 0 }
  }

  function cancelEditing() {
    setForm(original)
    setErrors({})
    setTouched({})
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
    const hasErrors = Object.keys(nextErrors).length > 0
    if (hasErrors) {
      setToastIsError(true)
      setSuccessMessage('Vui lòng nhập đầy đủ các thông tin bắt buộc.')
    }
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
      const updated = Object.keys(input).length === 1 && 'isActive' in input ? await updateRoleStatusFromApi(roleId, form.isActive) : await updateRoleFromApi(roleId, input)
      const next = toForm(updated)
      setRole(updated)
      setForm(next)
      setOriginal(next)
      setIsEditing(false)
      setShowInactiveConfirm(false)
      setToastIsError(false)
      setSuccessMessage('Lưu thay đổi vai trò thành công.')
      void loadActivity(1, true)
    } catch (error) {
      if (error instanceof ApiError && (error.field === 'name' || error.field === 'key')) {
        const field = error.field as RoleField
        setTouched((current) => ({ ...current, [field]: true }))
        setErrors((current) => ({ ...current, [field]: error.message }))
        setToastIsError(true)
        setSuccessMessage(error.message)
      } else {
        setToastIsError(true)
        setSuccessMessage(error instanceof Error ? error.message : 'Không thể lưu vai trò.')
      }
      setShowInactiveConfirm(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteRole() {
    if (!roleId || !role || !canDeleteRole) return
    setIsSaving(true)
    try {
      await deleteRoleFromApi(roleId)
      onSaved()
    } catch (error) {
      setShowDeleteConfirm(false)
      setToastIsError(true)
      setSuccessMessage(error instanceof Error ? error.message : 'Không thể xóa vai trò.')
    } finally {
      setIsSaving(false)
    }
  }

  if (hasLoadError) return <ErrorState onRetry={() => { setIsLoading(true); void load() }} />
  if (isLoading || registry === null) return <LoadingState />

  const roleName = role?.name ?? 'Tạo vai trò'

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng vai trò"><button className="breadcrumb-link" type="button" onClick={requestBack}>Vai trò & phân quyền</button><span>/</span><strong>{isCreating ? 'Tạo vai trò' : roleName}</strong></nav>
    <section className="department-detail-summary role-detail-summary">
      <div className="department-detail-summary-main"><h1>{roleName}</h1></div>
      <div className="department-detail-actions">
        {isEditing ? <><button className="secondary-button compact-button" type="button" disabled={isSaving} onClick={cancelEditing}>Hủy</button><button className="primary-button compact-button" type="submit" form="role-form" disabled={!isDirty || isSaving}>{isSaving ? 'Đang lưu...' : isCreating ? 'Lưu' : 'Lưu thay đổi'}</button></> : <><button className="secondary-button compact-button" type="button" onClick={requestBack}>← Quay lại</button>{canUpdateRole && <button className="secondary-button compact-button" type="button" onClick={() => setIsEditing(true)}>Chỉnh sửa</button>}{canDeleteRole && <button className="danger-button compact-button" type="button" onClick={() => setShowDeleteConfirm(true)} disabled={isSaving}>Xóa</button>}</>}
      </div>
    </section>
    <form id="role-form" onSubmit={requestSave} noValidate>
      <SurfaceCard className="role-workbench-card">
        <section className="role-information-section" aria-labelledby="role-information-title">
          <h2 id="role-information-title">Thông tin vai trò</h2>
          <div className="role-information-grid">
            <label><span className={isEditing && canEditKey ? 'required-field-label' : undefined}>Mã vai trò</span>{isEditing && canEditKey ? <><input value={form.key} onChange={(event) => updateText('key', event.target.value)} onBlur={() => { setTouched((current) => ({ ...current, key: true })); setErrors((current) => ({ ...current, key: validation.key })) }} aria-invalid={Boolean(touched.key && errors.key)} />{touched.key && errors.key && <small className="job-title-form-error">{errors.key}</small>}</> : <strong>{role?.key}</strong>}</label>
            <label><span className={isEditing ? 'required-field-label' : undefined}>Tên vai trò</span>{isEditing ? <><input value={form.name} onChange={(event) => updateText('name', event.target.value)} onBlur={() => { setTouched((current) => ({ ...current, name: true })); setErrors((current) => ({ ...current, name: validation.name })) }} aria-invalid={Boolean(touched.name && errors.name)} />{touched.name && errors.name && <small className="job-title-form-error">{errors.name}</small>}</> : <strong>{role?.name}</strong>}</label>
            <label><span>Trạng thái</span>{isEditing ? <FilterSelect ariaLabel="Chọn trạng thái vai trò" value={String(form.isActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]} onChange={(value) => setForm((current) => ({ ...current, isActive: value === 'true' }))} /> : <ActiveStatusBadge isActive={role?.isActive ?? true} />}</label>
          </div>
        </section>
        <section className="role-permissions-section" aria-labelledby="role-permissions-title">
          <div className="role-permissions-heading"><div><h2 id="role-permissions-title">Phân quyền</h2></div><div className="role-permission-summary"><span><strong>{grantedPermissionCount}</strong> quyền đã cấp</span><span><strong>{grantedModuleCount}</strong>/{modules.length} module</span></div></div>
          <div className="role-matrix-toolbar"><div className="role-matrix-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg><input aria-label="Tìm module hoặc chức năng" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm module hoặc chức năng" />{searchQuery && <button type="button" aria-label="Xóa nội dung tìm kiếm" title="Xóa tìm kiếm" onClick={() => setSearchQuery('')}>×</button>}</div><div className="role-matrix-toolbar-end"><label className="role-granted-filter"><input className="visually-hidden" type="checkbox" checked={grantedOnly} onChange={(event) => setGrantedOnly(event.target.checked)} /><span className="role-filter-switch" aria-hidden="true"><span /></span><span>Chỉ hiển thị quyền đã cấp</span></label></div></div>
          {!isEditing && !hasGrantedPermissions ? <p className="role-matrix-empty">Vai trò này chưa được cấp quyền truy cập nào.</p> : (
            <div className="role-matrix-scroll">
              <table className="role-matrix-table">
                <thead>
                  <tr>
                    <th><span className="role-matrix-header-label">Module</span></th>
                    {matrixColumns.map((column) => {
                      const state = columnState(column.key)
                      return <th key={column.key}><div className="role-matrix-column-heading">{isEditing && state.hasItems ? <MatrixCheckbox checked={state.checked} indeterminate={state.indeterminate} onChange={(checked) => updateColumnPermissions(column.key, checked)} ariaLabel={`Chọn toàn bộ quyền ${column.label} đang hiển thị`} /> : null}<span>{column.label}</span></div></th>
                    })}
                  </tr>
                </thead>
                {groupedModules.map((group) => {
                  const isExpanded = !collapsedGroupKeys.has(group.key)
                  const groupState = groupPermissionState(group.key)
                  return <tbody key={group.key}>
                    <tr className="role-matrix-group-row"><th colSpan={5} scope="rowgroup"><div className="role-group-heading"><button className="role-group-disclosure" type="button" aria-expanded={isExpanded} onClick={() => toggleGroupExpanded(group.key)}><span aria-hidden="true" />{group.label}</button>{isEditing && <label className="role-group-permission-toggle"><MatrixCheckbox checked={groupState.checked} indeterminate={groupState.indeterminate} onChange={(checked) => updateGroupPermissions(group.key, checked)} ariaLabel={`Cấp toàn bộ quyền nhóm ${group.label}`} /><span>Toàn quyền nhóm</span></label>}</div></th></tr>
                    {isExpanded && group.modules.map((module) => {
                      const selectedModuleCount = module.permissions.filter((permission) => selectedKeys.has(permission.key)).length
                      return <tr key={module.key} className={selectedModuleCount > 0 ? 'has-permissions' : undefined}>
                        <th scope="row"><div className="role-module-cell"><span><strong>{module.label}</strong></span></div></th>
                        {matrixColumns.map((column) => {
                          const permissions = permissionsForColumn(module, column.key)
                          const selectedCount = permissions.filter((permission) => selectedKeys.has(permission.key)).length
                          const isSelected = permissions.length > 0 && selectedCount === permissions.length
                          return <td key={column.key}>{permissions.length ? isEditing ? <MatrixCheckbox checked={isSelected} indeterminate={selectedCount > 0 && !isSelected} onChange={(checked) => updatePermission(module, column.key, checked)} ariaLabel={`${column.label} ${module.label}`} /> : <StaticPermissionMark granted={isSelected} partial={selectedCount > 0 && !isSelected} /> : <UnavailablePermissionMark />}</td>
                        })}
                      </tr>
                    })}
                  </tbody>
                })}
              </table>
              {filteredModules.length === 0 && <p className="role-matrix-filter-empty">Không tìm thấy module hoặc quyền phù hợp.</p>}
            </div>
          )}
        </section>
      </SurfaceCard>
    </form>
    {!isCreating && <section className="employee-activity-section role-audit-section"><div className="employee-activity-heading"><div><h2>Lịch sử</h2></div></div><SurfaceCard className="employee-activity-card">{activity.length ? <div className="employee-activity-list">{activity.map((log) => { const changes = roleChangeDetails(log); return <article className="activity-log-row" key={log.id}><div><strong>{activityDescription(log, roleName, currentUserId)}</strong>{changes.length > 0 && <p>Thay đổi: {changes.join(' · ')}</p>}</div><time>{formatDateTime(log.occurredAt)}</time></article> })}</div> : <p className="employee-activity-empty">Chưa có lịch sử liên quan đến vai trò này.</p>}{hasMoreActivity && <div className="employee-activity-more"><button className="secondary-button" type="button" disabled={isLoadingActivity} onClick={() => void loadActivity(activityPage + 1)}>{isLoadingActivity ? 'Đang tải...' : 'Xem thêm'}</button></div>}</SurfaceCard></section>}
    {successMessage && <div className={`toast-message${toastIsError ? ' toast-error' : ''}`} role={toastIsError ? 'alert' : 'status'}>{successMessage}</div>}
    {showLeaveConfirm && <ConfirmDialog title="Chưa lưu thay đổi" description="Thông tin vai trò đang chỉnh sửa sẽ bị hủy nếu bạn rời khỏi trang." confirmLabel="Rời khỏi trang" tone="danger" onCancel={() => setShowLeaveConfirm(false)} onConfirm={onBack} />}
    {showDeleteConfirm && <ConfirmDialog title="Xóa vai trò" description="Bạn có chắc chắn muốn xóa vai trò này?" confirmLabel="Xóa" confirmingLabel="Đang xóa..." tone="danger" isConfirming={isSaving} onCancel={() => setShowDeleteConfirm(false)} onConfirm={() => void deleteRole()} compact />}
    {showInactiveConfirm && <ConfirmDialog title="Ngưng hoạt động vai trò?" description="Vai trò sẽ không thể được cấp mới hoặc sử dụng cho các lần đăng nhập tiếp theo. Các tài khoản đang được gán vai trò này vẫn được giữ nguyên liên kết." confirmLabel="Ngưng hoạt động" tone="danger" isConfirming={isSaving} onCancel={() => setShowInactiveConfirm(false)} onConfirm={() => void persist()} />}
  </>
}
