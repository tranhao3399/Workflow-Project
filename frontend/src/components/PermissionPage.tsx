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
import { TablePagination } from './ui/TablePagination'

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
type PageSize = 5 | 10 | 20 | 50

interface PermissionPageProps {
  onCreateRole: () => void
  onOpenRole: (roleId: string) => void
  canCreateRole: boolean
}

const pageSizes: PageSize[] = [5, 10, 20, 50]

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
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const rangeStart = filtered.length ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(currentPage * pageSize, filtered.length)
  const activeFilterCount = Number(status !== 'ALL')

  function resetAndLoad() {
    setSearchInput('')
    setSearchQuery('')
    setStatus('ALL')
    setPage(1)
    setPageSize(10)
    setIsFilterOpen(false)
    setOpenSelect(false)
    void load(true)
  }

  if (hasError) return <ErrorState onRetry={() => void load(true)} />
  if (roles === null) return <LoadingState />

  return <>
    <PageHeader title="Vai trò & phân quyền" description="Quản lý vai trò và quyền truy cập của tài khoản trong hệ thống." actions={canCreateRole ? <button className="primary-button compact-button" type="button" onClick={onCreateRole}>Thêm vai trò</button> : undefined} />
    <SurfaceCard className="master-data-section role-catalog-section">
      <ListToolbar>
        <div className="catalog-toolbar-main">
          <div className="catalog-search-row">
            <label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input ref={searchRef} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Mã hoặc tên vai trò" />{searchInput && <button className="clear-search-button" type="button" onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); window.requestAnimationFrame(() => searchRef.current?.focus()) }} aria-label="Xóa nội dung tìm kiếm">×</button>}</span></label>
            <button className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'} type="button" aria-expanded={isFilterOpen} onClick={() => { setIsFilterOpen((open) => !open); setOpenSelect(false) }}>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}<svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={isFilterOpen ? 'm4 10 4-4 4 4' : 'M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z'} /></svg>{activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}</button>
            <button className="secondary-button catalog-refresh-button" type="button" disabled={isRefreshing} onClick={resetAndLoad}><span className={isRefreshing ? 'refresh-icon is-spinning' : 'refresh-icon'}>↻</span>{isRefreshing ? 'Đang làm mới...' : 'Làm mới'}</button>
          </div>
          <AdvancedFilterPanel id="role-filters" label="Bộ lọc vai trò" isOpen={isFilterOpen}><div className="advanced-filter-content master-filter-content"><label><span>Trạng thái</span><FilterSelect ariaLabel="Lọc theo trạng thái vai trò" value={status} options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, { value: 'ACTIVE', label: 'Hoạt động' }, { value: 'INACTIVE', label: 'Ngưng hoạt động' }]} isOpen={openSelect} onOpenChange={setOpenSelect} onChange={(value) => { setStatus(value as StatusFilter); setPage(1) }} /></label></div></AdvancedFilterPanel>
        </div>
      </ListToolbar>
      <DataTable className="admin-table master-data-table role-catalog-table" fixedLayout><thead><tr><th>Mã vai trò</th><th>Vai trò</th><th>Trạng thái</th></tr></thead><tbody>{rows.length === 0 ? <EmptyTableRow colSpan={3} message="Không tìm thấy vai trò phù hợp." /> : rows.map((role) => <tr key={role.id}><td><button className="master-code-link" type="button" onClick={() => onOpenRole(role.id)}>{role.key}</button></td><td><strong className="master-primary-text">{role.name}</strong></td><td><RoleStatusBadge isActive={role.isActive} /></td></tr>)}</tbody></DataTable><TablePagination currentPage={currentPage} totalPages={totalPages} onPrevious={() => setPage(currentPage - 1)} onNext={() => setPage(currentPage + 1)} rangeLabel={`${rangeStart}–${rangeEnd} trên ${filtered.length} vai trò`} pageSize={pageSize} pageSizes={pageSizes} onPageSizeChange={(value) => { setPageSize(value as PageSize); setPage(1) }} />
    </SurfaceCard>
  </>
}
