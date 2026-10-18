import { useCallback, useEffect, useState } from 'react'
import { listOwnRequests } from '../../services/requests.service'
import { requestStatus, type RequestFilter, type RequestSummary } from '../../types/workflow'
import { RequestStatusBadge } from '../StatusBadge'
import { ErrorState, LoadingState } from '../DataStates'
import { DataTable, EmptyTableRow } from '../ui/DataTable'
import { FilterSelect } from '../ui/FilterSelect'
import { ListToolbar } from '../ui/ListToolbar'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'
import { TablePagination } from '../ui/TablePagination'

type RequestTab = 'ALL' | NonNullable<RequestFilter['statusGroup']>

interface RequestCatalogPageProps {
  canCreate: boolean
  onCreate: () => void
  onOpen: (id: string) => void
}

const tabs: Array<{ value: RequestTab; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: requestStatus.draft, label: 'Bản nháp' },
  { value: requestStatus.inProgress, label: 'Đang xử lý' },
  { value: requestStatus.revisionRequested, label: 'Cần bổ sung' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]

const sortOptions = [
  { value: 'updatedAt:desc', label: 'Cập nhật mới nhất' },
  { value: 'createdAt:desc', label: 'Tạo mới nhất' },
  { value: 'createdAt:asc', label: 'Tạo cũ nhất' },
  { value: 'requestNo:asc', label: 'Mã phiếu A-Z' },
]

export function RequestCatalogPage({ canCreate, onCreate, onOpen }: RequestCatalogPageProps) {
  const [items, setItems] = useState<RequestSummary[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<RequestTab>('ALL')
  const [sort, setSort] = useState('updatedAt:desc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)

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
        statusGroup: tab === 'ALL' ? undefined : tab,
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
    }
  }, [limit, page, search, sort, tab])

  // Data fetching intentionally synchronizes the catalog with server-side filters.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load, reloadVersion])
  useEffect(() => {
    const refresh = () => { setIsLoading(true); setReloadVersion((value) => value + 1) }
    window.addEventListener('workflow:request-mutated', refresh)
    return () => window.removeEventListener('workflow:request-mutated', refresh)
  }, [])

  const rangeStart = total ? (page - 1) * limit + 1 : 0
  const rangeEnd = Math.min(page * limit, total)

  return <>
    <PageHeader title="Phiếu của tôi" description="Theo dõi phiếu nháp và tiến độ xử lý." actions={canCreate ? <button className="primary-button compact-button" type="button" onClick={onCreate}>+ Tạo phiếu</button> : undefined} />
    <SurfaceCard className="request-catalog">
      <div className="request-status-tabs" role="tablist" aria-label="Lọc trạng thái phiếu">{tabs.map((item) => <button className={tab === item.value ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === item.value} key={item.value} onClick={() => { setTab(item.value); setPage(1); setIsLoading(true) }}>{item.label}</button>)}</div>
      <ListToolbar><div className="request-list-toolbar"><label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input value={searchInput} placeholder="Mã phiếu hoặc tiêu đề" onChange={(event) => { setSearchInput(event.target.value); setIsLoading(true) }} />{searchInput && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearchInput('')}>×</button>}</span></label><label className="request-sort-control"><span>Sắp xếp</span><FilterSelect ariaLabel="Sắp xếp phiếu" value={sort} options={sortOptions} onChange={(value) => { setSort(value); setPage(1); setIsLoading(true) }} /></label><button className="secondary-button catalog-refresh-button" type="button" disabled={isLoading} onClick={() => { setIsLoading(true); setReloadVersion((value) => value + 1) }}>↻ {isLoading ? 'Đang tải...' : 'Làm mới'}</button></div></ListToolbar>
      {isLoading && !items.length ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((value) => value + 1) }} /> : <><DataTable className="admin-table request-table" fixedLayout><thead><tr><th>Mã phiếu</th><th>Form</th><th>Tiêu đề</th><th>Trạng thái</th><th>Bước hiện tại</th><th>Ngày tạo</th><th>Cập nhật</th></tr></thead><tbody>{items.length === 0 ? <EmptyTableRow colSpan={7} message="Không có phiếu phù hợp." /> : items.map((item) => <tr className="request-row" key={item.id} onClick={() => onOpen(item.id)}><td><button className="master-code-link" type="button" onClick={(event) => { event.stopPropagation(); onOpen(item.id) }}>{item.requestNo}</button></td><td>{item.form ? <><strong>{item.form.name}</strong><small className="request-form-version">{item.form.code} · v{item.form.version}</small></> : `Form v${item.formVersion}`}</td><td><strong>{item.title}</strong></td><td><RequestStatusBadge status={item.status} /></td><td>{item.currentStepName || item.currentStepKey || '—'}</td><td>{formatDateTime(item.createdAt)}</td><td>{formatDateTime(item.updatedAt)}</td></tr>)}</tbody></DataTable><TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setPage((value) => Math.max(1, value - 1)); setIsLoading(true) }} onNext={() => { setPage((value) => Math.min(totalPages, value + 1)); setIsLoading(true) }} rangeLabel={`${rangeStart}-${rangeEnd} trên ${total} phiếu`} pageSize={limit} pageSizes={[10, 20, 50]} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} /></>}
    </SurfaceCard>
  </>
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
