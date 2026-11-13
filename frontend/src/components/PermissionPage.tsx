import { useEffect, useMemo, useRef, useState } from 'react'
import { getRolesFromApi } from '../services/roles.service'
import type { RoleRecord } from '../types/roles'
import { normalizeSearchText } from '../utils/formatters'
import { ErrorState, LoadingState } from './DataStates'
import { AdvancedFilterPanel } from './ui/AdvancedFilterPanel'
import { DataTable, EmptyTableRow } from './ui/DataTable'
import { FilterSelect } from './ui/FilterSelect'
import { ListToolbar } from './ui/ListToolbar'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { SortableTableHeader } from './ui/SortableTableHeader'
import { TablePagination } from './ui/TablePagination'

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
type PageSize = 10 | 20 | 50

interface PermissionPageProps {
  onCreateRole: () => void
  onOpenRole: (roleId: string) => void
  canCreateRole: boolean
}

const pageSizes: PageSize[] = [10, 20, 50]

function RoleStatusBadge({ isActive }: { isActive: boolean }) {
  return <span className={isActive ? 'master-status-badge is-active' : 'master-status-badge is-inactive'}>{isActive ? 'Hoạt động' : 'Ngưng hoạt động'}</span>
}

export function PermissionPage({ onCreateRole, onOpenRole, canCreateRole }: PermissionPageProps) {
  const [roles, setRoles] = useState<RoleRecord[] | null>(null)
  const [hasError, setHasError] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [openSelect, setOpenSelect] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const [sortBy, setSortBy] = useState<'authority' | 'key' | 'name' | 'status'>('authority')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [hasUserSorted, setHasUserSorted] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  async function load(showRefresh = false) {
    if (showRefresh) setIsRefreshing(true)
    try {
      setRoles(await getRolesFromApi())
      setHasError(false)
    } catch {
      setHasError(true)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Initial server synchronization for this catalog.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearchQuery(searchInput); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const filtered = useMemo(() => {
    const query = normalizeSearchText(searchQuery)
    return (roles ?? []).filter((role) => {
      const matchesSearch = !query || [role.key, role.name].some((value) => normalizeSearchText(value).includes(query))
      const matchesStatus = status === 'ALL' || (status === 'ACTIVE' ? role.isActive : !role.isActive)
      return matchesSearch && matchesStatus
    })
  }, [roles, searchQuery, status])
  const sorted = useMemo(() => [...filtered].sort((left, right) => {
    let comparison = 0
    if (sortBy === 'authority') comparison = roleAuthorityScore(left) - roleAuthorityScore(right)
    else if (sortBy === 'key') comparison = left.key.localeCompare(right.key, 'vi')
    else if (sortBy === 'name') comparison = left.name.localeCompare(right.name, 'vi')
    else comparison = Number(left.isActive) - Number(right.isActive)
    if (comparison === 0) comparison = left.name.localeCompare(right.name, 'vi')
    return sortOrder === 'asc' ? comparison : -comparison
  }), [filtered, sortBy, sortOrder])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const rangeStart = sorted.length ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(currentPage * pageSize, sorted.length)
  const activeFilterCount = Number(status !== 'ALL')

  function resetAndLoad() {
    setSearchInput('')
    setSearchQuery('')
    setStatus('ALL')
    setPage(1)
    setPageSize(10)
    setSortBy('authority')
    setSortOrder('desc')
    setHasUserSorted(false)
    setIsFilterOpen(false)
    setOpenSelect(false)
    void load(true)
  }

  function changeSort(column: string) {
    const nextColumn = column as 'key' | 'name' | 'status'
    setSortOrder((current) => sortBy === nextColumn ? (current === 'asc' ? 'desc' : 'asc') : 'asc')
    setSortBy(nextColumn)
    setHasUserSorted(true)
    setPage(1)
  }

  if (hasError) return <ErrorState onRetry={() => void load(true)} />
  if (roles === null) return <LoadingState />

  return <>
    <PageHeader className="catalog-page-header" title="Vai trò & phân quyền" actions={canCreateRole ? <button className="primary-button compact-button" type="button" onClick={onCreateRole}>Thêm vai trò</button> : undefined} />
    <SurfaceCard className="master-data-section role-catalog-section">
      <ListToolbar>
        <div className="catalog-toolbar-main">
          <div className="catalog-search-row">
            <label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input ref={searchRef} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Mã hoặc tên vai trò" />{searchInput && <button className="clear-search-button" type="button" onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); window.requestAnimationFrame(() => searchRef.current?.focus()) }} aria-label="Xóa nội dung tìm kiếm">×</button>}</span></label>
            <button className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'} type="button" aria-expanded={isFilterOpen} onClick={() => { setIsFilterOpen((open) => !open); setOpenSelect(false) }}><svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={isFilterOpen ? 'm4 10 4-4 4 4' : 'M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z'} /></svg><span>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span>{activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}</button>
            <button className="secondary-button catalog-refresh-button" type="button" disabled={isRefreshing} onClick={resetAndLoad}><span className={isRefreshing ? 'refresh-icon is-spinning' : 'refresh-icon'}>↻</span>{isRefreshing ? 'Đang làm mới...' : 'Làm mới'}</button>
          </div>
          <AdvancedFilterPanel id="role-filters" label="Bộ lọc vai trò" isOpen={isFilterOpen}><div className="advanced-filter-content master-filter-content"><label><span>Trạng thái</span><FilterSelect ariaLabel="Lọc theo trạng thái vai trò" value={status} options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, { value: 'ACTIVE', label: 'Hoạt động' }, { value: 'INACTIVE', label: 'Ngưng hoạt động' }]} isOpen={openSelect} onOpenChange={setOpenSelect} onChange={(value) => { setStatus(value as StatusFilter); setPage(1) }} /></label></div></AdvancedFilterPanel>
        </div>
      </ListToolbar>
      <DataTable className="admin-table master-data-table role-catalog-table" fixedLayout><thead><tr>
        <SortableTableHeader column="key" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Mã vai trò</SortableTableHeader>
        <SortableTableHeader column="name" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Vai trò</SortableTableHeader>
        <SortableTableHeader column="status" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Trạng thái</SortableTableHeader>
      </tr></thead><tbody>{rows.length === 0 ? <EmptyTableRow colSpan={3} message="Không tìm thấy vai trò phù hợp." /> : rows.map((role) => <tr key={role.id}><td><button className="master-code-link" type="button" onClick={() => onOpenRole(role.id)}>{role.key}</button></td><td><strong className="master-primary-text">{role.name}</strong></td><td><RoleStatusBadge isActive={role.isActive} /></td></tr>)}</tbody></DataTable>
      <TablePagination currentPage={currentPage} totalPages={totalPages} onPrevious={() => setPage(currentPage - 1)} onNext={() => setPage(currentPage + 1)} onPageChange={setPage} rangeLabel={`${rangeStart}–${rangeEnd} trên ${filtered.length} vai trò`} pageSize={pageSize} pageSizes={pageSizes} onPageSizeChange={(value) => { setPageSize(value as PageSize); setPage(1) }} />
    </SurfaceCard>
  </>
}

function roleAuthorityScore(role: RoleRecord): number {
  const fixedPriority: Record<string, number> = {
    ADMIN: 100_000,
    DIRECTOR: 90_000,
    MANAGER: 80_000,
    APPROVER: 70_000,
    EMPLOYEE: 0,
  }
  return (fixedPriority[role.key] ?? 50_000) + role.permissionKeys.length
}
