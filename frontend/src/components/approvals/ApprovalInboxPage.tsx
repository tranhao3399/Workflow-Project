import { useCallback, useEffect, useMemo, useState } from 'react'
import { listApprovalInbox } from '../../services/approvals.service'
import { approvalTaskStatus } from '../../types/workflow'
import type {
  ApprovalInboxScope,
  ApprovalTask,
  ApprovalTaskFilter,
  ApprovalTaskStatus,
} from '../../types/workflow'
import { formatDateTime } from '../../utils/formatters'
import { ApprovalTaskStatusBadge, RequestStatusBadge } from '../StatusBadge'
import { ErrorState, LoadingState } from '../DataStates'
import { DataTable, EmptyTableRow } from '../ui/DataTable'
import { FilterSelect, type FilterSelectOption } from '../ui/FilterSelect'
import { ListToolbar } from '../ui/ListToolbar'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'
import { TablePagination } from '../ui/TablePagination'

interface ApprovalInboxPageProps {
  onOpenRequest: (requestId: string, taskId: string) => void
}

const tabs: Array<{ value: ApprovalInboxScope; label: string }> = [
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

const sortOptions: FilterSelectOption[] = [
  { value: 'assignedAt:desc', label: 'Giao mới nhất' },
  { value: 'assignedAt:asc', label: 'Giao cũ nhất' },
  { value: 'dueAt:asc', label: 'Hạn gần nhất' },
  { value: 'dueAt:desc', label: 'Hạn xa nhất' },
  { value: 'actedAt:desc', label: 'Xử lý mới nhất' },
  { value: 'status:asc', label: 'Theo trạng thái' },
]

export function ApprovalInboxPage({ onOpenRequest }: ApprovalInboxPageProps) {
  const [items, setItems] = useState<ApprovalTask[]>([])
  const [scope, setScope] = useState<ApprovalInboxScope>('pending')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [approvalMode, setApprovalMode] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [sort, setSort] = useState('assignedAt:desc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [pendingCount, setPendingCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const statusOptions = useMemo<FilterSelectOption[]>(() => [
    { value: '', label: 'Tất cả trạng thái' },
    ...statusesByScope[scope].map((value) => ({ value, label: statusLabels[value] })),
  ], [scope])

  const load = useCallback(async () => {
    const [sortBy, sortOrder] = sort.split(':') as [NonNullable<ApprovalTaskFilter['sortBy']>, 'asc' | 'desc']
    try {
      const filter: ApprovalTaskFilter = {
        scope,
        page,
        limit,
        search: search || undefined,
        status: status ? status as ApprovalTaskStatus : undefined,
        approvalMode: approvalMode ? approvalMode as ApprovalTaskFilter['approvalMode'] : undefined,
        overdue: scope === 'pending' && overdueOnly ? true : undefined,
        sortBy,
        sortOrder,
      }
      const [result, pendingResult] = await Promise.all([
        listApprovalInbox(filter),
        scope === 'pending' && !search && !status && !approvalMode && !overdueOnly
          ? Promise.resolve(null)
          : listApprovalInbox({ scope: 'pending', page: 1, limit: 1 }),
      ])
      setItems(result.data)
      setTotal(result.pagination.total)
      setTotalPages(Math.max(1, result.pagination.totalPages))
      setPendingCount((current) => pendingResult?.pagination.total ?? (scope === 'pending' ? result.pagination.total : current))
      setHasError(false)
      if (page > Math.max(1, result.pagination.totalPages)) setPage(Math.max(1, result.pagination.totalPages))
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }, [approvalMode, limit, overdueOnly, page, scope, search, sort, status])

  // Data fetching intentionally synchronizes the inbox with server-side filters.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load, reloadVersion])

  useEffect(() => {
    const refresh = () => { setIsLoading(true); setReloadVersion((value) => value + 1) }
    window.addEventListener('workflow:approval-tasks-refresh', refresh)
    return () => window.removeEventListener('workflow:approval-tasks-refresh', refresh)
  }, [])

  function selectScope(nextScope: ApprovalInboxScope) {
    setScope(nextScope)
    setStatus('')
    setOverdueOnly(false)
    setPage(1)
    setIsLoading(true)
  }

  const rangeStart = total ? (page - 1) * limit + 1 : 0
  const rangeEnd = Math.min(page * limit, total)

  return <>
    <PageHeader title="Chờ phê duyệt" description="Theo dõi và xử lý các phiếu được giao cho bạn." />
    <SurfaceCard className="approval-inbox">
      <div className="approval-scope-tabs" role="tablist" aria-label="Phạm vi task phê duyệt">{tabs.map((tab) => <button className={scope === tab.value ? 'is-active' : ''} type="button" role="tab" aria-selected={scope === tab.value} key={tab.value} onClick={() => selectScope(tab.value)}><span>{tab.label}</span>{tab.value === 'pending' && <strong>{pendingCount}</strong>}</button>)}</div>
      <ListToolbar><div className="approval-inbox-toolbar">
        <label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input value={searchInput} placeholder="Mã phiếu, người gửi hoặc bước" onChange={(event) => { setSearchInput(event.target.value); setIsLoading(true) }} />{searchInput && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearchInput('')}>×</button>}</span></label>
        <label className="approval-filter-control"><span>Trạng thái</span><FilterSelect ariaLabel="Lọc trạng thái task" value={status} options={statusOptions} onChange={(value) => { setStatus(value); setPage(1); setIsLoading(true) }} /></label>
        <label className="approval-filter-control"><span>Chế độ duyệt</span><FilterSelect ariaLabel="Lọc chế độ duyệt" value={approvalMode} options={[{ value: '', label: 'Tất cả chế độ' }, { value: 'ANY', label: 'Một người duyệt' }, { value: 'ALL', label: 'Tất cả duyệt' }, { value: 'MAJORITY', label: 'Đa số duyệt' }]} onChange={(value) => { setApprovalMode(value); setPage(1); setIsLoading(true) }} /></label>
        <label className="approval-filter-control"><span>Sắp xếp</span><FilterSelect ariaLabel="Sắp xếp task" value={sort} options={sortOptions} onChange={(value) => { setSort(value); setPage(1); setIsLoading(true) }} /></label>
        {scope === 'pending' && <label className="approval-overdue-toggle"><input type="checkbox" checked={overdueOnly} onChange={(event) => { setOverdueOnly(event.target.checked); setPage(1); setIsLoading(true) }} /><span>Chỉ quá hạn</span></label>}
      </div></ListToolbar>
      {isLoading && !items.length ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((value) => value + 1) }} /> : <><DataTable className="admin-table approval-inbox-table" fixedLayout><thead><tr><th>Mã phiếu</th><th>Form</th><th>Người gửi</th><th>Phòng ban</th><th>Bước</th><th>Ngày giao</th><th>Hạn xử lý</th><th>Trạng thái</th></tr></thead><tbody>{items.length === 0 ? <EmptyTableRow colSpan={8} message="Không có task phê duyệt phù hợp." /> : items.map((task) => <tr className="approval-inbox-row" key={task.id} onClick={() => onOpenRequest(task.requestId, task.id)}><td><button className="master-code-link" type="button" onClick={(event) => { event.stopPropagation(); onOpenRequest(task.requestId, task.id) }}>{task.request?.requestNo ?? '—'}</button><small>{task.request?.title}</small></td><td><strong>{task.request?.form?.name || task.request?.form?.code || `Form v${task.request?.form?.version ?? '—'}`}</strong>{task.request?.form?.code && <small>{task.request.form.code} · v{task.request.form.version}</small>}</td><td><strong>{task.request?.requesterSnapshot.fullName ?? '—'}</strong><small>{task.request?.requesterSnapshot.employeeCode}</small></td><td>{task.request?.requesterSnapshot.departmentName ?? '—'}</td><td><strong>{task.stepName}</strong><small>{task.stepKey} · lần {task.stepRunNo}</small></td><td>{formatDateTime(task.assignedAt)}</td><td>{task.dueAt ? <><span>{formatDateTime(task.dueAt)}</span>{task.isOverdue && <span className="approval-overdue-badge">Quá hạn</span>}</> : 'Không có hạn'}</td><td><ApprovalTaskStatusBadge status={task.status} />{task.request && <RequestStatusBadge status={task.request.status} />}</td></tr>)}</tbody></DataTable><TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setPage((value) => Math.max(1, value - 1)); setIsLoading(true) }} onNext={() => { setPage((value) => Math.min(totalPages, value + 1)); setIsLoading(true) }} rangeLabel={`${rangeStart}-${rangeEnd} trên ${total} task`} pageSize={limit} pageSizes={[10, 20, 50]} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} /></>}
    </SurfaceCard>
  </>
}
