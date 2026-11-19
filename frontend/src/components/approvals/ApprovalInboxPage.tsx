import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listApprovalInbox } from '../../services/approvals.service'
import { listManagedRequests } from '../../services/requests.service'
import { approvalTaskStatus } from '../../types/workflow'
import type {
  ApprovalInboxScope,
  ApprovalTask,
  ApprovalTaskFilter,
  ApprovalTaskStatus,
  RequestFilter,
  RequestStatus,
  RequestSummary,
} from '../../types/workflow'
import { formatDateTime, formatRequestFormSubtitle, toFilterDateIso } from '../../utils/formatters'
import { buildRequestStatusFilterOptions } from '../../utils/workflow-status'
import { ApprovalTaskStatusBadge, RequestStatusBadge } from '../StatusBadge'
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

type ApprovalCatalogTab = ApprovalInboxScope | 'managed'

interface ApprovalInboxPageProps {
  canViewManaged?: boolean
  onOpenRequest: (requestId: string, taskId?: string) => void
}

const taskTabs: Array<{ value: ApprovalInboxScope; label: string }> = [
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'processed', label: 'Đã xử lý' },
  { value: 'closed', label: 'Đã hủy/không còn hiệu lực' },
]

const statusesByScope: Record<ApprovalInboxScope, ApprovalTaskStatus[]> = {
  pending: [approvalTaskStatus.pending],
  processed: [approvalTaskStatus.approved, approvalTaskStatus.rejected, approvalTaskStatus.revisionRequested],
  closed: [approvalTaskStatus.cancelled, approvalTaskStatus.skipped, approvalTaskStatus.expired],
}

const statusLabels: Record<ApprovalTaskStatus, string> = {
  PENDING: 'Đang chờ',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
  REVISION_REQUESTED: 'Yêu cầu bổ sung',
  CANCELLED: 'Đã hủy',
  SKIPPED: 'Đã bỏ qua',
  EXPIRED: 'Quá hạn',
}

const managedStatusOptions: FilterSelectOption[] = buildRequestStatusFilterOptions()

export function ApprovalInboxPage({ canViewManaged = false, onOpenRequest }: ApprovalInboxPageProps) {
  const [items, setItems] = useState<ApprovalTask[]>([])
  const [managedItems, setManagedItems] = useState<RequestSummary[]>([])
  const [scope, setScope] = useState<ApprovalCatalogTab>('pending')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [approvalMode, setApprovalMode] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState('assignedAt:desc')
  const [hasUserSorted, setHasUserSorted] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [openSelect, setOpenSelect] = useState<'scope' | 'status' | 'approvalMode' | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const scopeOptions = useMemo<FilterSelectOption[]>(() => [
    ...taskTabs,
    ...(canViewManaged ? [{ value: 'managed' as const, label: 'Phiếu thuộc phạm vi quản lý' }] : []),
  ], [canViewManaged])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const statusOptions = useMemo<FilterSelectOption[]>(() => (
    scope === 'managed'
      ? managedStatusOptions
      : [
          { value: '', label: 'Tất cả trạng thái' },
          ...statusesByScope[scope].map((value) => ({ value, label: statusLabels[value] })),
        ]
  ), [scope])

  const load = useCallback(async () => {
    const dateFromIso = toFilterDateIso(dateFrom, 'start')
    const dateToIso = toFilterDateIso(dateTo, 'end')
    try {
      if (scope === 'managed') {
        const [sortBy, sortOrder] = sort.split(':') as [NonNullable<RequestFilter['sortBy']>, 'asc' | 'desc']
        const result = await listManagedRequests({
          page,
          limit,
          search: search || undefined,
          status: status ? status as RequestStatus : undefined,
          dateFrom: dateFromIso,
          dateTo: dateToIso,
          sortBy,
          sortOrder,
        })
        setManagedItems(result.data)
        setTotal(result.pagination.total)
        setTotalPages(Math.max(1, result.pagination.totalPages))
        setHasError(false)
        if (page > Math.max(1, result.pagination.totalPages)) setPage(Math.max(1, result.pagination.totalPages))
        return
      }

      const [sortBy, sortOrder] = sort.split(':') as [NonNullable<ApprovalTaskFilter['sortBy']>, 'asc' | 'desc']
      const result = await listApprovalInbox({
        scope,
        page,
        limit,
        search: search || undefined,
        status: status ? status as ApprovalTaskStatus : undefined,
        approvalMode: approvalMode ? approvalMode as ApprovalTaskFilter['approvalMode'] : undefined,
        overdue: scope === 'pending' && overdueOnly ? true : undefined,
        dateFrom: dateFromIso,
        dateTo: dateToIso,
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
  }, [approvalMode, dateFrom, dateTo, limit, overdueOnly, page, scope, search, sort, status])

  // Data fetching intentionally synchronizes the inbox with server-side filters.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load, reloadVersion])

  useEffect(() => {
    const refresh = () => { setIsLoading(true); setReloadVersion((value) => value + 1) }
    window.addEventListener('workflow:approval-tasks-refresh', refresh)
    window.addEventListener('workflow:request-mutated', refresh)
    return () => {
      window.removeEventListener('workflow:approval-tasks-refresh', refresh)
      window.removeEventListener('workflow:request-mutated', refresh)
    }
  }, [])

  function selectScope(nextScope: ApprovalCatalogTab) {
    setScope(nextScope)
    setStatus('')
    setApprovalMode('')
    setOverdueOnly(false)
    setDateFrom('')
    setDateTo('')
    setOpenSelect(null)
    setSort(nextScope === 'managed' ? 'updatedAt:desc' : 'assignedAt:desc')
    setHasUserSorted(false)
    setPage(1)
    setIsLoading(true)
  }

  function clearSearch() {
    setSearchInput('')
    setSearch('')
    setPage(1)
    setIsLoading(true)
    searchRef.current?.focus()
  }

  function resetFilters() {
    setScope('pending')
    setStatus('')
    setApprovalMode('')
    setOverdueOnly(false)
    setDateFrom('')
    setDateTo('')
    setSort('assignedAt:desc')
    setHasUserSorted(false)
    setOpenSelect(null)
    setPage(1)
    setIsLoading(true)
  }

  function refresh() {
    setSearchInput('')
    setSearch('')
    setScope('pending')
    setStatus('')
    setApprovalMode('')
    setOverdueOnly(false)
    setDateFrom('')
    setDateTo('')
    setSort('assignedAt:desc')
    setHasUserSorted(false)
    setIsFilterOpen(false)
    setOpenSelect(null)
    setPage(1)
    setIsRefreshing(true)
    setIsLoading(true)
    setReloadVersion((value) => value + 1)
  }

  const activeFilterCount = Number(scope !== 'pending')
    + Number(status !== '')
    + Number(scope !== 'managed' && approvalMode !== '')
    + Number(scope === 'pending' && overdueOnly)
    + Number(dateFrom !== '')
    + Number(dateTo !== '')
  const rangeStart = total ? (page - 1) * limit + 1 : 0
  const rangeEnd = Math.min(page * limit, total)

  function changeSort(column: string) {
    const [currentColumn, currentOrder] = sort.split(':')
    const nextOrder = currentColumn === column
      ? (currentOrder === 'asc' ? 'desc' : 'asc')
      : (column === 'assignedAt' || column === 'dueAt' || column === 'createdAt' || column === 'updatedAt' ? 'desc' : 'asc')
    setSort(`${column}:${nextOrder}`)
    setHasUserSorted(true)
    setPage(1)
    setIsLoading(true)
  }

  const [sortBy, sortOrder] = sort.split(':') as [string, 'asc' | 'desc']
  const hasVisibleRows = scope === 'managed' ? managedItems.length > 0 : items.length > 0

  return <>
    <PageHeader className="catalog-page-header" title="Chờ phê duyệt" />
    <SurfaceCard className="admin-section approval-inbox">
      <ListToolbar>
        <div className="catalog-toolbar-main">
          <div className="catalog-search-row">
            <label className="catalog-search">
              <span>Tìm kiếm</span>
              <span className="catalog-search-input">
                <input
                  ref={searchRef}
                  value={searchInput}
                  placeholder={scope === 'managed' ? 'Mã phiếu hoặc tiêu đề' : 'Mã phiếu, người gửi hoặc bước'}
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
          <AdvancedFilterPanel id="approval-inbox-filters" label="Bộ lọc danh sách chờ phê duyệt" isOpen={isFilterOpen}>
            <div className="advanced-filter-content">
              <div className="advanced-filter-fields">
                <label>
                  <span>Phạm vi</span>
                  <FilterSelect
                    ariaLabel="Lọc phạm vi xử lý"
                    value={scope}
                    options={scopeOptions}
                    isOpen={openSelect === 'scope'}
                    onOpenChange={(open) => setOpenSelect(open ? 'scope' : null)}
                    onChange={(value) => selectScope(value as ApprovalCatalogTab)}
                  />
                </label>
                <label>
                  <span>Trạng thái</span>
                  <FilterSelect
                    ariaLabel="Lọc trạng thái"
                    value={status}
                    options={statusOptions}
                    isOpen={openSelect === 'status'}
                    onOpenChange={(open) => setOpenSelect(open ? 'status' : null)}
                    onChange={(value) => { setStatus(value); setPage(1); setIsLoading(true) }}
                  />
                </label>
                {scope !== 'managed' && (
                  <label>
                    <span>Chế độ duyệt</span>
                    <FilterSelect
                      ariaLabel="Lọc chế độ duyệt"
                      value={approvalMode}
                      options={[
                        { value: '', label: 'Tất cả chế độ' },
                        { value: 'ANY', label: 'Một người duyệt' },
                        { value: 'ALL', label: 'Tất cả duyệt' },
                        { value: 'MAJORITY', label: 'Đa số duyệt' },
                      ]}
                      isOpen={openSelect === 'approvalMode'}
                      onOpenChange={(open) => setOpenSelect(open ? 'approvalMode' : null)}
                      onChange={(value) => { setApprovalMode(value); setPage(1); setIsLoading(true) }}
                    />
                  </label>
                )}
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
                {scope === 'pending' && (
                  <div className="approval-overdue-field">
                    <span>Tình trạng hạn</span>
                    <label className="approval-overdue-toggle">
                      <input
                        type="checkbox"
                        checked={overdueOnly}
                        onChange={(event) => { setOverdueOnly(event.target.checked); setPage(1); setIsLoading(true) }}
                      />
                      <span>Chỉ quá hạn</span>
                    </label>
                  </div>
                )}
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
      {isLoading && !hasVisibleRows ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((value) => value + 1) }} /> : scope === 'managed' ? (
        <>
          <DataTable className="admin-table request-table request-table-managed" fixedLayout><thead><tr>
            <SortableTableHeader column="requestNo" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Mã phiếu</SortableTableHeader>
            <SortableTableHeader column="title" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Tiêu đề</SortableTableHeader>
            <th>Người gửi</th>
            <SortableTableHeader column="status" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Trạng thái</SortableTableHeader>
            <th>Bước hiện tại</th>
            <SortableTableHeader column="createdAt" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Ngày tạo</SortableTableHeader>
            <SortableTableHeader column="updatedAt" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Cập nhật lúc</SortableTableHeader>
          </tr></thead><tbody>{managedItems.length === 0 ? <EmptyTableRow colSpan={7} message="Không có phiếu thuộc phạm vi quản lý phù hợp." /> : managedItems.map((item) => <tr className="request-row" key={item.id} onClick={() => onOpenRequest(item.id)}><td><button className="master-code-link" type="button" onClick={(event) => { event.stopPropagation(); onOpenRequest(item.id) }}>{item.requestNo}</button></td><td><strong>{item.title}</strong><small className="request-form-version">{formatRequestFormSubtitle(item)}</small></td><td><strong>{item.requesterSnapshot.fullName}</strong><small className="request-form-version">{item.requesterSnapshot.departmentName}</small></td><td><RequestStatusBadge status={item.status} /></td><td>{item.currentStepName || item.currentStepKey || '—'}</td><td>{formatDateTime(item.createdAt)}</td><td>{formatDateTime(item.updatedAt)}</td></tr>)}</tbody></DataTable>
          <TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setPage((value) => Math.max(1, value - 1)); setIsLoading(true) }} onNext={() => { setPage((value) => Math.min(totalPages, value + 1)); setIsLoading(true) }} onPageChange={(value) => { setPage(value); setIsLoading(true) }} rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} phiếu`} pageSize={limit} pageSizes={[10, 20, 50]} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} />
        </>
      ) : (
        <>
          <DataTable className="admin-table approval-inbox-table" fixedLayout><thead><tr><th>Mã phiếu</th><th>Tiêu đề</th><th>Người gửi</th><th>Phòng ban</th>
            <SortableTableHeader column="stepNameSnapshot" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Bước</SortableTableHeader>
            <SortableTableHeader column="assignedAt" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Ngày giao</SortableTableHeader>
            <SortableTableHeader column="dueAt" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Hạn xử lý</SortableTableHeader>
            <SortableTableHeader column="status" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Trạng thái</SortableTableHeader>
          </tr></thead><tbody>{items.length === 0 ? <EmptyTableRow colSpan={8} message="Không có task phê duyệt phù hợp." /> : items.map((task) => <tr className="approval-inbox-row" key={task.id} onClick={() => onOpenRequest(task.requestId, task.id)}><td><button className="master-code-link" type="button" onClick={(event) => { event.stopPropagation(); onOpenRequest(task.requestId, task.id) }}>{task.request?.requestNo ?? '—'}</button></td><td><strong>{task.request?.title || task.request?.form?.name || '—'}</strong>{task.request && <small className="request-form-version">{formatRequestFormSubtitle(task.request)}</small>}</td><td><strong>{task.request?.requesterSnapshot.fullName ?? '—'}</strong><small>{task.request?.requesterSnapshot.employeeCode}</small></td><td>{task.request?.requesterSnapshot.departmentName ?? '—'}</td><td><strong>{task.stepName}</strong><small>{task.stepKey} · lần {task.stepRunNo}</small></td><td>{formatDateTime(task.assignedAt)}</td><td>{task.dueAt ? <><span>{formatDateTime(task.dueAt)}</span>{task.isOverdue && <span className="approval-overdue-badge">Quá hạn</span>}</> : 'Không có hạn'}</td><td><ApprovalTaskStatusBadge status={task.status} />{task.request && <RequestStatusBadge status={task.request.status} />}</td></tr>)}</tbody></DataTable>
          <TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setPage((value) => Math.max(1, value - 1)); setIsLoading(true) }} onNext={() => { setPage((value) => Math.min(totalPages, value + 1)); setIsLoading(true) }} onPageChange={(value) => { setPage(value); setIsLoading(true) }} rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} task`} pageSize={limit} pageSizes={[10, 20, 50]} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} />
        </>
      )}
    </SurfaceCard>
  </>
}
