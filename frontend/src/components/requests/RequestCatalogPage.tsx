import { useCallback, useEffect, useRef, useState } from 'react'
import { listOwnRequests } from '../../services/requests.service'
import type { RequestFilter, RequestStatus, RequestSummary } from '../../types/workflow'
import { formatDateTime, formatRequestFormSubtitle, toFilterDateIso } from '../../utils/formatters'
import { buildRequestStatusFilterOptions } from '../../utils/workflow-status'
import { RequestStatusBadge } from '../StatusBadge'
import { ErrorState, LoadingState } from '../DataStates'
import { AdvancedFilterPanel } from '../ui/AdvancedFilterPanel'
import { DataTable, EmptyTableRow } from '../ui/DataTable'
import { DatePicker } from '../ui/DatePicker'
import { FilterSelect, type FilterSelectOption } from '../ui/FilterSelect'
import { ListToolbar } from '../ui/ListToolbar'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'
import { SortableTableHeader } from '../ui/SortableTableHeader'
import { TablePagination } from '../ui/TablePagination'

interface RequestCatalogPageProps {
  canCreate: boolean
  onCreate: () => void
  onOpen: (id: string) => void
}

const statusOptions: FilterSelectOption[] = buildRequestStatusFilterOptions()

export function RequestCatalogPage({ canCreate, onCreate, onOpen }: RequestCatalogPageProps) {
  const [items, setItems] = useState<RequestSummary[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState('updatedAt:desc')
  const [hasUserSorted, setHasUserSorted] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [openSelect, setOpenSelect] = useState<'status' | null>(null)
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

  const load = useCallback(async () => {
    const [sortBy, sortOrder] = sort.split(':') as [NonNullable<RequestFilter['sortBy']>, 'asc' | 'desc']
    try {
      const result = await listOwnRequests({
        page,
        limit,
        search: search || undefined,
        status: status ? status as RequestStatus : undefined,
        dateFrom: toFilterDateIso(dateFrom, 'start'),
        dateTo: toFilterDateIso(dateTo, 'end'),
        sortBy,
        sortOrder,
      })
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
  }, [dateFrom, dateTo, limit, page, search, sort, status])

  // Data fetching intentionally synchronizes the catalog with server-side filters.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load, reloadVersion])
  useEffect(() => {
    const refreshFromEvent = () => { setIsLoading(true); setReloadVersion((value) => value + 1) }
    window.addEventListener('workflow:request-mutated', refreshFromEvent)
    return () => window.removeEventListener('workflow:request-mutated', refreshFromEvent)
  }, [])

  const activeFilterCount = Number(status !== '') + Number(dateFrom !== '') + Number(dateTo !== '')
  const rangeStart = total ? (page - 1) * limit + 1 : 0
  const rangeEnd = Math.min(page * limit, total)

  function clearSearch() {
    setSearchInput('')
    setSearch('')
    setPage(1)
    setIsLoading(true)
    searchRef.current?.focus()
  }

  function resetFilters() {
    setStatus('')
    setDateFrom('')
    setDateTo('')
    setOpenSelect(null)
    setPage(1)
    setIsLoading(true)
  }

  function refresh() {
    setSearchInput('')
    setSearch('')
    setStatus('')
    setDateFrom('')
    setDateTo('')
    setSort('updatedAt:desc')
    setHasUserSorted(false)
    setIsFilterOpen(false)
    setOpenSelect(null)
    setPage(1)
    setIsRefreshing(true)
    setIsLoading(true)
    setReloadVersion((value) => value + 1)
  }

  function changeSort(column: string) {
    const [currentColumn, currentOrder] = sort.split(':')
    const nextOrder = currentColumn === column
      ? (currentOrder === 'asc' ? 'desc' : 'asc')
      : (column === 'createdAt' || column === 'updatedAt' ? 'desc' : 'asc')
    setSort(`${column}:${nextOrder}`)
    setHasUserSorted(true)
    setPage(1)
    setIsLoading(true)
  }

  const [sortBy, sortOrder] = sort.split(':') as [string, 'asc' | 'desc']

  return <>
    <PageHeader
      className="catalog-page-header"
      title="Phiếu của tôi"
      actions={canCreate ? (
        <button className="primary-button compact-button" type="button" onClick={onCreate}>
          Tạo phiếu
        </button>
      ) : undefined}
    />
    <SurfaceCard className="admin-section request-catalog">
      <ListToolbar>
        <div className="catalog-toolbar-main">
          <div className="catalog-search-row">
            <label className="catalog-search">
              <span>Tìm kiếm</span>
              <span className="catalog-search-input">
                <input
                  ref={searchRef}
                  value={searchInput}
                  placeholder="Mã phiếu hoặc tiêu đề"
                  onChange={(event) => { setSearchInput(event.target.value); setIsLoading(true) }}
                />
                {searchInput && (
                  <button
                    className="clear-search-button"
                    type="button"
                    aria-label="Xóa nội dung tìm kiếm"
                    onClick={clearSearch}
                  >
                    ×
                  </button>
                )}
              </span>
            </label>
            <button
              className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'}
              type="button"
              aria-expanded={isFilterOpen}
              onClick={() => { setIsFilterOpen((open) => !open); setOpenSelect(null) }}
            >
              <svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path d={isFilterOpen ? 'm4 10 4-4 4 4' : 'M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z'} />
              </svg>
              <span>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span>
              {activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}
            </button>
            <button
              className="secondary-button catalog-refresh-button"
              type="button"
              disabled={isLoading || isRefreshing}
              onClick={refresh}
            >
              <span className={isRefreshing ? 'refresh-icon is-spinning' : 'refresh-icon'}>↻</span>
              {isRefreshing ? 'Đang làm mới...' : 'Làm mới'}
            </button>
          </div>
          <AdvancedFilterPanel id="request-catalog-filters" label="Bộ lọc danh sách phiếu" isOpen={isFilterOpen}>
            <div className="advanced-filter-content">
              <div className="advanced-filter-fields">
                <label>
                  <span>Trạng thái</span>
                  <FilterSelect
                    ariaLabel="Lọc trạng thái phiếu"
                    value={status}
                    options={statusOptions}
                    isOpen={openSelect === 'status'}
                    onOpenChange={(open) => setOpenSelect(open ? 'status' : null)}
                    onChange={(value) => { setStatus(value); setPage(1); setIsLoading(true) }}
                  />
                </label>
                <label>
                  <span>Từ ngày</span>
                  <DatePicker
                    ariaLabel="Từ ngày"
                    value={dateFrom}
                    maxDate={dateTo}
                    onChange={(value) => { setDateFrom(value ?? ''); setPage(1); setIsLoading(true) }}
                  />
                </label>
                <label>
                  <span>Đến ngày</span>
                  <DatePicker
                    ariaLabel="Đến ngày"
                    value={dateTo}
                    minDate={dateFrom}
                    onChange={(value) => { setDateTo(value ?? ''); setPage(1); setIsLoading(true) }}
                  />
                </label>
              </div>
              {activeFilterCount > 0 && (
                <div className="advanced-filter-actions">
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={resetFilters}
                  >
                    Xóa bộ lọc
                  </button>
                </div>
              )}
            </div>
          </AdvancedFilterPanel>
        </div>
      </ListToolbar>
      {isLoading && !items.length ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((value) => value + 1) }} /> : <><DataTable className="admin-table request-table" fixedLayout><thead><tr>
        <SortableTableHeader column="requestNo" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Mã phiếu</SortableTableHeader>
        <SortableTableHeader column="title" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Tiêu đề</SortableTableHeader>
        <SortableTableHeader column="status" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Trạng thái</SortableTableHeader>
        <th>Bước hiện tại</th>
        <SortableTableHeader column="createdAt" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Ngày tạo</SortableTableHeader>
      </tr></thead><tbody>{items.length === 0 ? <EmptyTableRow colSpan={5} message="Không có phiếu phù hợp." /> : items.map((item) => <tr className="request-row" key={item.id} onClick={() => onOpen(item.id)}><td><button className="master-code-link" type="button" onClick={(event) => { event.stopPropagation(); onOpen(item.id) }}>{item.requestNo}</button></td><td><strong>{item.title}</strong><small className="request-form-version">{formatRequestFormSubtitle(item)}</small></td><td><RequestStatusBadge status={item.status} /></td><td>{item.currentStepName || item.currentStepKey || '—'}</td><td>{formatDateTime(item.createdAt)}</td></tr>)}</tbody></DataTable><TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setPage((value) => Math.max(1, value - 1)); setIsLoading(true) }} onNext={() => { setPage((value) => Math.min(totalPages, value + 1)); setIsLoading(true) }} onPageChange={(value) => { setPage(value); setIsLoading(true) }} rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} phiếu`} pageSize={limit} pageSizes={[10, 20, 50]} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} /></>}
    </SurfaceCard>
  </>
}
