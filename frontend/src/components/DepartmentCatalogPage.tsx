import { useEffect, useMemo, useRef, useState } from 'react'
import { getDepartmentsFromApi } from '../services/master-data.service'
import type { DepartmentPreview } from '../types/master-data'
import { normalizeSearchText } from '../utils/formatters'
import { ErrorState, LoadingState } from './DataStates'
import { AdvancedFilterPanel } from './ui/AdvancedFilterPanel'
import { DataTable, EmptyTableRow } from './ui/DataTable'
import { FilterSelect } from './ui/FilterSelect'
import { ListToolbar } from './ui/ListToolbar'
import { DepartmentStatusBadge } from './ui/MasterDataStatusBadge'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { TablePagination } from './ui/TablePagination'

type DepartmentStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
type PageSize = 10 | 20 | 50
const pageSizes: PageSize[] = [10, 20, 50]

interface DepartmentCatalogPageProps { onOpenDepartment: (departmentId: string) => void; onCreateDepartment: () => void; canCreateDepartment: boolean }

export function DepartmentCatalogPage({ onOpenDepartment, onCreateDepartment, canCreateDepartment }: DepartmentCatalogPageProps) {
  const [departments, setDepartments] = useState<DepartmentPreview[] | null>(null)
  const [hasError, setHasError] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [status, setStatus] = useState<DepartmentStatusFilter>('ALL')
  const [openSelect, setOpenSelect] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const searchRef = useRef<HTMLInputElement>(null)

  async function load(showRefresh = false) {
    if (showRefresh) setIsRefreshing(true)
    try {
      setDepartments(await getDepartmentsFromApi())
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
    return (departments ?? []).filter((department) => {
      const matchesQuery = !query || [department.name, department.code].some((value) => normalizeSearchText(value).includes(query))
      const matchesStatus = status === 'ALL' || (status === 'ACTIVE' ? department.isActive : !department.isActive)
      return matchesQuery && matchesStatus
    })
  }, [departments, searchQuery, status])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const rangeStart = filtered.length ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(currentPage * pageSize, filtered.length)
  const hasFilter = status !== 'ALL'

  function clearSearch() {
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
    window.requestAnimationFrame(() => searchRef.current?.focus())
  }

  function refresh() {
    setSearchInput('')
    setSearchQuery('')
    setStatus('ALL')
    setPage(1)
    setPageSize(10)
    setIsFilterOpen(false)
    setOpenSelect(false)
    void load(true)
  }

  if (departments === null) return <LoadingState />
  if (hasError) return <ErrorState onRetry={() => void load(true)} />

  return <>
    <PageHeader className="catalog-page-header" title="Phòng ban" actions={canCreateDepartment ? <button className="primary-button compact-button" type="button" onClick={onCreateDepartment}>Thêm phòng ban</button> : undefined} />
    <SurfaceCard className="master-data-section">
      <ListToolbar>
        <div className="catalog-toolbar-main">
          <div className="catalog-search-row">
            <label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input ref={searchRef} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tên hoặc mã phòng ban" />{searchInput && <button className="clear-search-button" type="button" onClick={clearSearch} aria-label="Xóa nội dung tìm kiếm">×</button>}</span></label>
            <button className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'} type="button" aria-expanded={isFilterOpen} onClick={() => { setIsFilterOpen((open) => !open); setOpenSelect(false) }}><svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={isFilterOpen ? 'm4 10 4-4 4 4' : 'M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z'} /></svg><span>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span>{hasFilter && <span className="filter-count-badge">1</span>}</button>
            <button className="secondary-button catalog-refresh-button" type="button" onClick={refresh} disabled={isRefreshing}><span className={isRefreshing ? 'refresh-icon is-spinning' : 'refresh-icon'}>↻</span>{isRefreshing ? 'Đang làm mới...' : 'Làm mới'}</button>
          </div>
          <AdvancedFilterPanel id="department-filters" label="Bộ lọc phòng ban" isOpen={isFilterOpen}><div className="advanced-filter-content master-filter-content"><label><span>Trạng thái</span><FilterSelect ariaLabel="Lọc theo trạng thái phòng ban" value={status} options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, { value: 'ACTIVE', label: 'Đang hoạt động' }, { value: 'INACTIVE', label: 'Ngưng hoạt động' }]} isOpen={openSelect} onOpenChange={setOpenSelect} onChange={(value) => { setStatus(value as DepartmentStatusFilter); setPage(1) }} /></label></div></AdvancedFilterPanel>
        </div>
      </ListToolbar>
      <DataTable className="admin-table master-data-table" fixedLayout><thead><tr><th>Mã phòng ban</th><th>Phòng ban</th><th>Trạng thái</th></tr></thead><tbody>{rows.length === 0 ? <EmptyTableRow colSpan={3} message="Không tìm thấy phòng ban phù hợp." /> : rows.map((department) => <tr key={department.id}><td><button className="master-code-link" type="button" onClick={() => onOpenDepartment(department.id)}>{department.code}</button></td><td><strong className="master-primary-text">{department.name}</strong></td><td><DepartmentStatusBadge isActive={department.isActive} /></td></tr>)}</tbody></DataTable><TablePagination currentPage={currentPage} totalPages={totalPages} onPrevious={() => setPage(currentPage - 1)} onNext={() => setPage(currentPage + 1)} rangeLabel={`${rangeStart}–${rangeEnd} trên ${filtered.length} phòng ban`} pageSize={pageSize} pageSizes={pageSizes} onPageSizeChange={(value) => { setPageSize(value as PageSize); setPage(1) }} />
    </SurfaceCard>
  </>
}
