import { useCallback, useEffect, useRef, useState } from 'react'
import { listWorkflowDefinitions } from '../../services/workflow-definitions.service'
import { definitionStatuses, type DefinitionStatus, type WorkflowDefinition, type WorkflowDefinitionSortField } from '../../types/workflow'
import { DefinitionStatusBadge } from '../StatusBadge'
import { ErrorState, LoadingState } from '../DataStates'
import { AdvancedFilterPanel } from '../ui/AdvancedFilterPanel'
import { DataTable, EmptyTableRow } from '../ui/DataTable'
import { FilterSelect } from '../ui/FilterSelect'
import { ListToolbar } from '../ui/ListToolbar'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'
import { SortableTableHeader } from '../ui/SortableTableHeader'
import { TablePagination } from '../ui/TablePagination'

interface WorkflowBuilderCatalogPageProps {
  canCreate: boolean
  onCreate: () => void
  onOpen: (id: string) => void
}

const statusOptions = [
  { value: '', label: 'Tất cả trạng thái' },
  ...definitionStatuses.map((status) => ({ value: status, label: ({ DRAFT: 'Nháp', PUBLISHED: 'Đã xuất bản', INACTIVE: 'Ngưng hoạt động', ARCHIVED: 'Đã lưu trữ' })[status] })),
]

export function WorkflowBuilderCatalogPage({ canCreate, onCreate, onOpen }: WorkflowBuilderCatalogPageProps) {
  const [items, setItems] = useState<WorkflowDefinition[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isStatusSelectOpen, setIsStatusSelectOpen] = useState(false)
  const [status, setStatus] = useState<DefinitionStatus | ''>('')
  const [sortBy, setSortBy] = useState<WorkflowDefinitionSortField>('updatedAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [hasUserSorted, setHasUserSorted] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const load = useCallback(async (refreshVersion: number) => {
    if (refreshVersion < 0) return
    try {
      const result = await listWorkflowDefinitions({ page, limit, ...(search ? { search } : {}), ...(status ? { status } : {}), sortBy, sortOrder })
      setItems(result.data)
      setTotal(result.pagination.total)
      setTotalPages(Math.max(1, result.pagination.totalPages))
      setHasError(false)
      if (page > Math.max(1, result.pagination.totalPages)) setPage(Math.max(1, result.pagination.totalPages))
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [limit, page, search, sortBy, sortOrder, status])

  useEffect(() => { const id = window.setTimeout(() => { void load(reloadVersion) }, 0); return () => window.clearTimeout(id) }, [load, reloadVersion])

  const activeFilterCount = Number(status !== '')
  const rangeStart = total ? (page - 1) * limit + 1 : 0
  const rangeEnd = Math.min(page * limit, total)

  function clearSearch() {
    setSearchInput('')
    setSearch('')
    setPage(1)
    setIsLoading(true)
    window.requestAnimationFrame(() => searchRef.current?.focus())
  }

  function resetFilters() {
    setStatus('')
    setIsStatusSelectOpen(false)
    setPage(1)
    setIsLoading(true)
  }

  function refresh() {
    setSearchInput('')
    setSearch('')
    setStatus('')
    setSortBy('updatedAt')
    setSortOrder('desc')
    setHasUserSorted(false)
    setIsFilterOpen(false)
    setIsStatusSelectOpen(false)
    setPage(1)
    setIsRefreshing(true)
    setIsLoading(true)
    setReloadVersion((value) => value + 1)
  }

  function changeSort(column: string) {
    const nextColumn = column as WorkflowDefinitionSortField
    setSortOrder((currentOrder) => sortBy === nextColumn
      ? (currentOrder === 'asc' ? 'desc' : 'asc')
      : (nextColumn === 'updatedAt' || nextColumn === 'version' ? 'desc' : 'asc'))
    setSortBy(nextColumn)
    setHasUserSorted(true)
    setPage(1)
    setIsLoading(true)
  }

  return <>
    <PageHeader className="catalog-page-header" title="Workflow Builder" actions={canCreate ? <button className="primary-button compact-button" type="button" onClick={onCreate}>Tạo Workflow</button> : undefined} />
    <SurfaceCard className="master-data-section workflow-builder-catalog">
      <ListToolbar><div className="catalog-toolbar-main">
        <div className="catalog-search-row">
          <label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input ref={searchRef} value={searchInput} placeholder="Mã, tên Workflow hoặc Form" onChange={(event) => { setSearchInput(event.target.value); setIsLoading(true) }} />{searchInput && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={clearSearch}>×</button>}</span></label>
          <button className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'} type="button" aria-expanded={isFilterOpen} onClick={() => { setIsFilterOpen((open) => !open); setIsStatusSelectOpen(false) }}>
            <svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={isFilterOpen ? 'm4 10 4-4 4 4' : 'M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z'} /></svg>
            <span>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span>
            {activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}
          </button>
          <button className="secondary-button catalog-refresh-button" type="button" disabled={isLoading || isRefreshing} onClick={refresh}><span className={isRefreshing ? 'refresh-icon is-spinning' : 'refresh-icon'}>↻</span>{isRefreshing ? 'Đang làm mới...' : 'Làm mới'}</button>
        </div>
        <AdvancedFilterPanel id="workflow-builder-filters" label="Bộ lọc danh sách Workflow" isOpen={isFilterOpen}>
          <div className="advanced-filter-content master-filter-content form-builder-filter-content">
            <label><span>Trạng thái</span><FilterSelect ariaLabel="Lọc trạng thái Workflow" value={status} options={statusOptions} isOpen={isStatusSelectOpen} onOpenChange={setIsStatusSelectOpen} onChange={(value) => { setStatus(value as DefinitionStatus | ''); setPage(1); setIsLoading(true) }} /></label>
            {activeFilterCount > 0 && <button className="secondary-button compact-button form-builder-reset-filter-btn" type="button" onClick={resetFilters}>Xóa bộ lọc</button>}
          </div>
        </AdvancedFilterPanel>
      </div></ListToolbar>
      {isLoading && !items.length ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setReloadVersion((value) => value + 1) }} /> : <>
        <DataTable className="admin-table master-data-table workflow-builder-table" fixedLayout><thead><tr>
          <SortableTableHeader column="code" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Mã quy trình</SortableTableHeader>
          <SortableTableHeader column="name" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Tên quy trình</SortableTableHeader>
          <th>Biểu mẫu</th>
          <SortableTableHeader column="version" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Phiên bản</SortableTableHeader>
          <SortableTableHeader column="status" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Trạng thái</SortableTableHeader>
        </tr></thead><tbody>{items.length === 0 ? <EmptyTableRow colSpan={5} message="Không tìm thấy Workflow phù hợp." /> : items.map((item) => <tr className="form-builder-row" key={item.id}>
          <td><button className="master-code-link" type="button" onClick={() => onOpen(item.id)}>{item.code}</button></td>
          <td><strong>{item.name}</strong></td>
          <td>{item.formDefinition ? <><strong>{item.formDefinition.name}</strong><small className="workflow-form-code">{`${item.formDefinition.code} · v${item.formDefinition.version}`}</small></> : '—'}</td>
          <td>v{item.version}</td>
          <td><DefinitionStatusBadge status={item.status} /></td>
        </tr>)}</tbody></DataTable>
        <TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setIsLoading(true); setPage((value) => Math.max(1, value - 1)) }} onNext={() => { setIsLoading(true); setPage((value) => Math.min(totalPages, value + 1)) }} onPageChange={(value) => { setIsLoading(true); setPage(value) }} rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} Workflow`} pageSize={limit} pageSizes={[10, 20, 50]} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} />
      </>}
    </SurfaceCard>
  </>
}
