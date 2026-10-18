import { useEffect, useMemo, useState } from 'react'
import { getWorkspaceModules, updateWorkspaceModule } from '../services/workspace-modules.service'
import type { WorkspaceModule } from '../types/workspace-modules'
import { EmptyState, ErrorState, LoadingState } from './DataStates'
import { DataTable } from './ui/DataTable'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'

function isProtectedModule(module: WorkspaceModule): boolean {
  return module.moduleKey === 'DASHBOARD' || module.moduleKey === 'WORKSPACE_MODULES'
}

export function WorkspaceModulesPage() {
  const [modules, setModules] = useState<WorkspaceModule[]>([])
  const [savedEnabled, setSavedEnabled] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    let isCurrent = true
    async function load() {
      try {
        const result = await getWorkspaceModules()
        if (!isCurrent) return
        setModules(result)
        setSavedEnabled(Object.fromEntries(result.map((module) => [module.moduleKey, module.isEnabled])))
        setHasError(false)
      } catch {
        if (isCurrent) setHasError(true)
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }
    void load()
    return () => { isCurrent = false }
  }, [reloadVersion])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const sortedModules = useMemo(() => [...modules].sort((left, right) => (
    left.groupKey.localeCompare(right.groupKey) || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
  )), [modules])
  const changedModules = useMemo(() => modules.filter((module) => savedEnabled[module.moduleKey] !== module.isEnabled), [modules, savedEnabled])

  function setModuleEnabled(moduleKey: string, isEnabled: boolean) {
    setModules((current) => current.map((module) => module.moduleKey === moduleKey ? { ...module, isEnabled } : module))
  }

  async function saveChanges() {
    if (!changedModules.length) return
    setIsSaving(true)
    try {
      const saved = await Promise.all(changedModules.map((module) => updateWorkspaceModule(module.moduleKey, { isEnabled: module.isEnabled })))
      setModules((current) => current.map((module) => saved.find((item) => item.moduleKey === module.moduleKey) ?? module))
      setSavedEnabled((current) => ({ ...current, ...Object.fromEntries(saved.map((module) => [module.moduleKey, module.isEnabled])) }))
      setToast('Đã lưu cấu hình không gian làm việc.')
    } catch {
      setToast('Không thể lưu cấu hình. Vui lòng thử lại.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (hasError) return <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((version) => version + 1) }} />
  if (!modules.length) return <EmptyState title="Chưa có module nào" description="Cấu hình module sẽ xuất hiện sau khi backend hoàn tất seed dữ liệu." />

  return <>
    <PageHeader title="Quản lý không gian làm việc" description="Bật hoặc tắt module trên toàn hệ thống. Quyền truy cập vẫn được quyết định bởi vai trò của người dùng." actions={<button className="primary-button compact-button" type="button" disabled={isSaving || !changedModules.length} onClick={() => void saveChanges()}>{isSaving ? 'Đang lưu...' : `Lưu thay đổi${changedModules.length ? ` (${changedModules.length})` : ''}`}</button>} />
    <SurfaceCard className="admin-section workspace-modules-section">
      <DataTable className="workspace-modules-table">
        <thead><tr><th>Module</th><th>Nhóm</th><th>Đường dẫn</th><th>Trạng thái</th></tr></thead>
        <tbody>{sortedModules.map((module) => <tr key={module.moduleKey}>
          <td><strong>{module.name}</strong><span className="cell-subtitle">{module.moduleKey}</span></td>
          <td>{module.groupKey === 'ADMIN' ? 'Quản trị' : 'Không gian làm việc'}</td>
          <td><span className="module-path">{module.path}</span></td>
          <td><label className="inline-toggle"><input type="checkbox" checked={module.isEnabled} disabled={isProtectedModule(module)} onChange={(event) => setModuleEnabled(module.moduleKey, event.target.checked)} /><span>{module.isEnabled ? 'Đang bật' : 'Đã tắt'}</span></label></td>
        </tr>)}</tbody>
      </DataTable>
    </SurfaceCard>
    {toast && <div className="toast-message" role="status">{toast}</div>}
  </>
}
