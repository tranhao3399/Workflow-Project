import { useEffect, useMemo, useRef, useState } from 'react'
import { getWorkspaceModules, updateWorkspaceModule } from '../services/workspace-modules.service'
import type { WorkspaceModule } from '../types/workspace-modules'
import { normalizeSearchText } from '../utils/formatters'
import { EmptyState, ErrorState, LoadingState } from './DataStates'
import { DataTable, EmptyTableRow } from './ui/DataTable'
import { FilterSelect } from './ui/FilterSelect'
import { ListToolbar } from './ui/ListToolbar'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { TablePagination } from './ui/TablePagination'

function isProtectedModule(module: WorkspaceModule): boolean {
  return module.moduleKey === 'DASHBOARD' || module.moduleKey === 'WORKSPACE_MODULES'
}

type GroupFilter = 'ALL' | 'WORKSPACE' | 'ADMIN'
type PageSize = 10 | 20 | 50
const pageSizes: PageSize[] = [10, 20, 50]

export function WorkspaceModulesPage() {
  const [modules, setModules] = useState<WorkspaceModule[]>([])
  const [savedEnabled, setSavedEnabled] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(20)
  const searchInputRef = useRef<HTMLInputElement>(null)

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
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const sortedModules = useMemo(() => [...modules].sort((left, right) => (
    left.groupKey.localeCompare(right.groupKey) || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
  )), [modules])

  const changedModules = useMemo(() => modules.filter((module) => savedEnabled[module.moduleKey] !== module.isEnabled), [modules, savedEnabled])

  const filteredModules = useMemo(() => {
    const query = normalizeSearchText(searchQuery)
    return sortedModules.filter((module) => {
      const matchesSearch = !query || [module.name, module.moduleKey, module.path].some((val) => normalizeSearchText(val).includes(query))
      const matchesGroup = groupFilter === 'ALL' || module.groupKey === groupFilter
      return matchesSearch && matchesGroup
    })
  }, [sortedModules, searchQuery, groupFilter])

  function setModuleEnabled(moduleKey: string, isEnabled: boolean) {
    setModules((current) => current.map((module) => module.moduleKey === moduleKey ? { ...module, isEnabled } : module))
  }

  function handleRefresh() {
    setSearchInput('')
    setSearchQuery('')
    setGroupFilter('ALL')
    setPage(1)
    setIsLoading(true)
    setReloadVersion((v) => v + 1)
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

  if (isLoading && modules.length === 0) return <LoadingState />
  if (hasError) return <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((version) => version + 1) }} />
  if (!modules.length) return <EmptyState title="Chưa có module nào" description="Cấu hình module sẽ xuất hiện sau khi backend hoàn tất seed dữ liệu." />

  const totalPages = Math.max(1, Math.ceil(filteredModules.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = filteredModules.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const rangeStart = filteredModules.length ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(currentPage * pageSize, filteredModules.length)

  return <>
    <PageHeader title="Quản lý không gian làm việc" actions={<button className="primary-button compact-button" type="button" disabled={isSaving || !changedModules.length} onClick={() => void saveChanges()}>{isSaving ? 'Đang lưu...' : `Lưu thay đổi${changedModules.length ? ` (${changedModules.length})` : ''}`}</button>} />
    <SurfaceCard className="admin-section workspace-modules-section">
      <ListToolbar>
        <div className="catalog-toolbar-main">
          <div className="catalog-search-row">
            <label className="catalog-search">
              <span>Tìm kiếm</span>
              <span className="catalog-search-input">
                <input
                  ref={searchInputRef}
                  value={searchInput}
                  onChange={(event) => { setSearchInput(event.target.value); setPage(1) }}
                  placeholder="Tìm theo tên, mã hoặc đường dẫn module"
                />
                {searchInput && (
                  <button
                    className="clear-search-button"
                    type="button"
                    onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); searchInputRef.current?.focus() }}
                    aria-label="Xóa nội dung tìm kiếm"
                  >
                    ×
                  </button>
                )}
              </span>
            </label>
            <div className="catalog-group-filter" style={{ minWidth: 200 }}>
              <FilterSelect
                ariaLabel="Lọc theo nhóm module"
                value={groupFilter}
                options={[
                  { value: 'ALL', label: 'Tất cả nhóm' },
                  { value: 'WORKSPACE', label: 'Không gian làm việc' },
                  { value: 'ADMIN', label: 'Quản trị' },
                ]}
                onChange={(value) => { setGroupFilter(value as GroupFilter); setPage(1) }}
              />
            </div>
            <button
              className="secondary-button catalog-refresh-button"
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <span className={isLoading ? 'refresh-icon is-spinning' : 'refresh-icon'}>↻</span>
              {isLoading ? 'Đang làm mới...' : 'Làm mới'}
            </button>
          </div>
        </div>
      </ListToolbar>
      <DataTable className="workspace-modules-table" fixedLayout>
        <thead><tr><th>Module</th><th>Nhóm</th><th>Đường dẫn</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyTableRow colSpan={4} message="Không tìm thấy module phù hợp." />
          ) : (
            rows.map((module) => <tr key={module.moduleKey}>
              <td><strong>{module.name}</strong><span className="cell-subtitle">{module.moduleKey}</span></td>
              <td>{module.groupKey === 'ADMIN' ? 'Quản trị' : 'Không gian làm việc'}</td>
              <td><span className="module-path">{module.path}</span></td>
              <td><label className="inline-toggle"><input type="checkbox" checked={module.isEnabled} disabled={isProtectedModule(module)} onChange={(event) => setModuleEnabled(module.moduleKey, event.target.checked)} /><span>{module.isEnabled ? 'Đang bật' : 'Đã tắt'}</span></label></td>
            </tr>)
          )}
        </tbody>
      </DataTable>
      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevious={() => setPage(currentPage - 1)}
        onNext={() => setPage(currentPage + 1)}
        rangeLabel={`${rangeStart}–${rangeEnd} trên ${filteredModules.length} module`}
        pageSize={pageSize}
        pageSizes={pageSizes}
        onPageSizeChange={(value) => { setPageSize(value as PageSize); setPage(1) }}
      />
    </SurfaceCard>
    {toast && <div className="toast-message" role="status">{toast}</div>}
  </>
}
