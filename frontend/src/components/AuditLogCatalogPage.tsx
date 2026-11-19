import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { listAuditActorOptions, listAuditLogs } from '../services/audit-logs.service'
import type { AuditActionGroup, AuditActorOption, AuditLogQuery, AuditLogRecord, AuditModuleFilter, AuditOutcome } from '../types/audit-logs'
import { auditModuleLabel, auditObjectName, auditValue, formatAuditSentence } from '../utils/audit-display'
import { formatDate } from '../utils/formatters'
import { ErrorState, LoadingState } from './DataStates'
import { AdvancedFilterPanel } from './ui/AdvancedFilterPanel'
import { DataTable, EmptyTableRow } from './ui/DataTable'
import { DatePicker } from './ui/DatePicker'
import { FilterSelect } from './ui/FilterSelect'
import { ListToolbar } from './ui/ListToolbar'
import { SearchableFilterSelect } from './ui/SearchableFilterSelect'
import type { SearchableFilterOption } from './ui/SearchableFilterSelect'
import { SurfaceCard } from './ui/SurfaceCard'
import { TablePagination } from './ui/TablePagination'

type PageSize = 10 | 20 | 50
type AuditFilters = Pick<AuditLogQuery, 'actorId' | 'actorType' | 'module' | 'actionGroup' | 'outcome' | 'startDate' | 'endDate'>

const pageSizes: PageSize[] = [10, 20, 50]
const emptyFilters: AuditFilters = { actorId: undefined, actorType: undefined, module: '', actionGroup: '', outcome: undefined, startDate: '', endDate: '' }
const systemActorOption: SearchableFilterOption = { value: 'SYSTEM', label: 'Hệ thống', description: 'System' }
const moduleOptions = [
  { value: '', label: 'Tất cả phân hệ' },
  { value: 'AUTH_ACCOUNT', label: 'Xác thực & Tài khoản' },
  { value: 'EMPLOYEE', label: 'Nhân viên' },
  { value: 'ORGANIZATION', label: 'Cơ cấu tổ chức' },
  { value: 'JOB_TITLE', label: 'Chức danh' },
  { value: 'WORKSPACE', label: 'Không gian làm việc' },
  { value: 'WORKFLOW_FORM', label: 'Quy trình & Biểu mẫu' },
]
const outcomeOptions = [
  { value: '', label: 'Tất cả kết quả' },
  { value: 'SUCCESS', label: 'Thành công' },
  { value: 'DENIED', label: 'Bị từ chối' },
  { value: 'FAILED', label: 'Thất bại' },
]
const actionOptions = [
  { value: '', label: 'Tất cả hành động' },
  { value: 'LOGIN_LOGOUT', label: 'Đăng nhập / Đăng xuất' },
  { value: 'CREATE', label: 'Thêm mới' },
  { value: 'UPDATE', label: 'Cập nhật' },
  { value: 'DELETE', label: 'Xóa' },
  { value: 'APPROVAL', label: 'Phê duyệt' },
]
const fieldLabels: Record<string, string> = {
  fullName: 'Họ và tên', email: 'Email', employeeCode: 'Mã nhân viên', workEmail: 'Email công việc',
  phone: 'Điện thoại', address: 'Địa chỉ', status: 'Trạng thái', isActive: 'Trạng thái hoạt động',
  role: 'Vai trò', roles: 'Vai trò', permissionKeys: 'Quyền', departmentId: 'Phòng ban',
  positionId: 'Chức danh', managerId: 'Quản lý trực tiếp', name: 'Tên', code: 'Mã', title: 'Tiêu đề',
  group: 'Nhóm', sortOrder: 'Thứ tự', isEnabled: 'Trạng thái kích hoạt', version: 'Phiên bản',
}

function resourceName(log: AuditLogRecord): string {
  const value = log.resource.name || log.resource.code || log.resource.id || 'Không xác định'
  return auditObjectName(log.resource.type, value)
}

function resourceReference(log: AuditLogRecord): string | undefined {
  if (log.resource.code) return `Mã: ${log.resource.code}`
  if (log.resource.id) return `ID: ${log.resource.id}`
  if (log.resource.name) return `Tên: ${log.resource.name}`
  return undefined
}

function outcomeLabel(outcome: AuditOutcome): string {
  return outcome === 'SUCCESS' ? 'Thành công' : outcome === 'DENIED' ? 'Bị từ chối' : 'Thất bại'
}

function actorOption(actor: AuditActorOption): SearchableFilterOption {
  const identity = actor.fullName?.trim() || actor.email?.trim() || 'Người dùng hệ thống'
  return {
    value: actor.id,
    label: actor.employeeCode ? `${identity} (${actor.employeeCode})` : identity,
    description: actor.email,
  }
}

function timeOnly(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item)).join(', ') : 'Không có'
  if (value && typeof value === 'object') return JSON.stringify(value)
  return auditValue(value)
}

function changeEntries(log: AuditLogRecord): Array<{ key: string; before: string; after: string }> {
  const before = log.changes?.before ?? {}
  const after = log.changes?.after ?? {}
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  return keys.flatMap((key) => Object.is(before[key], after[key]) ? [] : [{
    key: fieldLabels[key] ?? key,
    before: displayValue(before[key]),
    after: displayValue(after[key]),
  }])
}

function normalizedIpAddress(value?: string): string {
  if (!value || value === 'unknown') return 'Không ghi nhận'
  if (value === '::1' || value === '::ffff:127.0.0.1') return '127.0.0.1 (Localhost)'
  return value.startsWith('::ffff:') ? value.slice('::ffff:'.length) : value
}

function supportsChangeComparison(action: string): boolean {
  return /(?:^|\.)(?:CREATED|UPDATED|DELETED)$/.test(action.trim().toUpperCase())
}

export function AuditLogCatalogPage() {
  const [items, setItems] = useState<AuditLogRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters)
  const [openSelect, setOpenSelect] = useState<'actor' | 'module' | 'outcome' | 'action' | null>(null)
  const [actorSearch, setActorSearch] = useState('')
  const [actors, setActors] = useState<AuditActorOption[]>([])
  const [selectedActorOption, setSelectedActorOption] = useState<SearchableFilterOption | null>(null)
  const [isLoadingActors, setIsLoadingActors] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const requestVersion = useRef(0)
  const actorRequestVersion = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentRequest = ++actorRequestVersion.current
      setIsLoadingActors(true)
      void listAuditActorOptions(actorSearch)
        .then((result) => {
          if (currentRequest === actorRequestVersion.current) setActors(result)
        })
        .catch(() => {
          if (currentRequest === actorRequestVersion.current) setActors([])
        })
        .finally(() => {
          if (currentRequest === actorRequestVersion.current) setIsLoadingActors(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [actorSearch, reloadVersion])

  const load = useCallback(async () => {
    const currentRequest = ++requestVersion.current
    void reloadVersion
    try {
      const result = await listAuditLogs({ ...filters, search, page, limit: pageSize })
      if (currentRequest !== requestVersion.current) return
      const nextTotalPages = Math.max(1, result.pagination.totalPages)
      if (page > nextTotalPages) {
        setPage(nextTotalPages)
        return
      }
      setItems(result.data)
      setTotal(result.pagination.total)
      setTotalPages(nextTotalPages)
      setHasError(false)
    } catch {
      if (currentRequest === requestVersion.current) setHasError(true)
    } finally {
      if (currentRequest === requestVersion.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [filters, page, pageSize, reloadVersion, search])

  // Đồng bộ danh sách với tiêu chí tra cứu và phân trang đang áp dụng.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const activeFilterCount = Number(Boolean(filters.actorId || filters.actorType)) + Number(Boolean(filters.module)) + Number(Boolean(filters.actionGroup))
    + Number(Boolean(filters.outcome)) + Number(Boolean(filters.startDate)) + Number(Boolean(filters.endDate))
  const rangeStart = total ? (page - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(page * pageSize, total)
  const actorOptions = [
    systemActorOption,
    ...(selectedActorOption && !actors.some((actor) => actor.id === selectedActorOption.value) ? [selectedActorOption] : []),
    ...actors.map(actorOption),
  ]
  const selectedActorValue = filters.actorType === 'SYSTEM' ? 'SYSTEM' : filters.actorId ?? ''

  function updateFilters(patch: Partial<AuditFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(1)
    setExpandedId(null)
  }

  function resetFilters() {
    setFilters(emptyFilters)
    setOpenSelect(null)
    setActorSearch('')
    setSelectedActorOption(null)
    setPage(1)
    setExpandedId(null)
  }

  function refresh() {
    setIsRefreshing(true)
    setSearchInput('')
    setSearch('')
    setFilters(emptyFilters)
    setOpenSelect(null)
    setActorSearch('')
    setSelectedActorOption(null)
    setPage(1)
    setPageSize(20)
    setExpandedId(null)
    setCopiedRequestId(null)
    setReloadVersion((value) => value + 1)
  }

  async function copyRequestId(requestId: string) {
    try {
      await navigator.clipboard.writeText(requestId)
      setCopiedRequestId(requestId)
      window.setTimeout(() => setCopiedRequestId((current) => current === requestId ? null : current), 1500)
    } catch {
      setCopiedRequestId(null)
    }
  }

  if (isLoading) return <LoadingState />
  if (hasError) return <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((value) => value + 1) }} />

  return <>
    <SurfaceCard className="admin-section audit-log-catalog">
      <ListToolbar><div className="catalog-toolbar-main audit-log-toolbar-main">
        <div className="catalog-search-row">
          <label className="catalog-search audit-log-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input ref={searchRef} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Người thực hiện, hành động hoặc đối tượng" />{searchInput && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); searchRef.current?.focus() }}>×</button>}</span></label>
          <button className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'} type="button" aria-expanded={isFilterOpen} onClick={() => { setIsFilterOpen((open) => !open); setOpenSelect(null) }}><svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={isFilterOpen ? 'm4 10 4-4 4 4' : 'M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z'} /></svg><span>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span>{activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}</button>
          <button className="secondary-button catalog-refresh-button" type="button" disabled={isRefreshing} onClick={refresh}>↻ {isRefreshing ? 'Đang làm mới...' : 'Làm mới'}</button>
        </div>
        <AdvancedFilterPanel id="audit-log-filters" label="Bộ lọc nhật ký hệ thống" isOpen={isFilterOpen}><div className="advanced-filter-content audit-log-filter-content"><div className="advanced-filter-fields">
          <label><span>Người thực hiện</span><SearchableFilterSelect ariaLabel="Lọc theo người thực hiện" value={selectedActorValue} options={actorOptions} placeholder="Tất cả người thực hiện" searchPlaceholder="Tìm theo tên, mã hoặc email..." isOpen={openSelect === 'actor'} isLoading={isLoadingActors} emptyText="Không tìm thấy người thực hiện phù hợp." onOpenChange={(open) => setOpenSelect(open ? 'actor' : null)} onSearchChange={setActorSearch} onChange={(value) => { const nextOption = actorOptions.find((option) => option.value === value) ?? null; setSelectedActorOption(value && value !== 'SYSTEM' ? nextOption : null); updateFilters(value === 'SYSTEM' ? { actorType: 'SYSTEM', actorId: undefined } : { actorType: undefined, actorId: value || undefined }) }} /></label>
          <label><span>Phân hệ</span><FilterSelect ariaLabel="Lọc theo phân hệ" value={filters.module ?? ''} options={moduleOptions} onChange={(value) => updateFilters({ module: value as AuditModuleFilter | '' })} isOpen={openSelect === 'module'} onOpenChange={(open) => setOpenSelect(open ? 'module' : null)} /></label>
          <label><span>Kết quả</span><FilterSelect ariaLabel="Lọc theo kết quả" value={filters.outcome ?? ''} options={outcomeOptions} onChange={(value) => updateFilters({ outcome: value ? value as AuditOutcome : undefined })} isOpen={openSelect === 'outcome'} onOpenChange={(open) => setOpenSelect(open ? 'outcome' : null)} /></label>
          <label><span>Hành động</span><FilterSelect ariaLabel="Lọc theo hành động" value={filters.actionGroup ?? ''} options={actionOptions} onChange={(value) => updateFilters({ actionGroup: value as AuditActionGroup | '' })} isOpen={openSelect === 'action'} onOpenChange={(open) => setOpenSelect(open ? 'action' : null)} /></label>
          <label><span>Từ ngày</span><DatePicker ariaLabel="Từ ngày" value={filters.startDate} maxDate={filters.endDate} onChange={(value) => updateFilters({ startDate: value ?? '' })} /></label>
          <label><span>Đến ngày</span><DatePicker ariaLabel="Đến ngày" value={filters.endDate} minDate={filters.startDate} onChange={(value) => updateFilters({ endDate: value ?? '' })} /></label>
        </div>{activeFilterCount > 0 && <div className="advanced-filter-actions"><button className="secondary-button compact-button" type="button" onClick={resetFilters}>Xóa bộ lọc</button></div>}</div></AdvancedFilterPanel>
      </div></ListToolbar>
      <DataTable className="admin-table audit-log-table" fixedLayout><thead><tr><th>Thời gian</th><th>Nội dung nhật ký</th><th>Kết quả</th><th>Phân hệ</th><th>Chi tiết</th></tr></thead><tbody>
        {items.length === 0 ? <EmptyTableRow colSpan={5} message="Không có nhật ký phù hợp với điều kiện tra cứu." /> : items.map((log) => {
          const isExpanded = expandedId === log._id
          const changes = changeEntries(log)
          const sentence = formatAuditSentence({ action: log.action, resourceType: log.resource.type, resourceName: resourceName(log), actor: log.actor })
          const showChanges = supportsChangeComparison(log.action) && changes.length > 0
          const module = auditModuleLabel(log.action, log.resource.type)
          const reference = resourceReference(log)
          const endpoint = log.context?.method && log.context.path ? `${log.context.method} ${log.context.path}` : 'Tác vụ nội bộ'
          return <Fragment key={log._id}><tr className={isExpanded ? 'audit-log-row is-expanded' : 'audit-log-row'}><td><strong>{formatDate(log.occurredAt)}</strong><small>{timeOnly(log.occurredAt)}</small></td><td><div className="audit-log-entry"><strong>{sentence}</strong><div><span className="audit-log-action-code">{log.action}</span>{reference && <><span aria-hidden="true">·</span><span>{reference}</span></>}</div></div></td><td><span className={`audit-outcome-badge audit-outcome-${log.outcome.toLowerCase()}`}>{outcomeLabel(log.outcome)}</span></td><td><strong>{module}</strong></td><td><button className="audit-log-detail-toggle" type="button" aria-expanded={isExpanded} onClick={() => setExpandedId(isExpanded ? null : log._id)}><span>{isExpanded ? 'Thu gọn' : 'Xem'}</span>{isExpanded ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}</button></td></tr>
            {isExpanded && <tr className="audit-log-detail-row"><td colSpan={5}><div className="audit-log-detail-panel"><div className="audit-log-detail-meta"><div><span>Mã yêu cầu truy vết (Request ID)</span><div className="audit-log-copy-value"><strong>{log.requestId}</strong><button type="button" aria-label="Sao chép mã yêu cầu truy vết" title={copiedRequestId === log.requestId ? 'Đã sao chép' : 'Sao chép'} onClick={() => void copyRequestId(log.requestId)}>{copiedRequestId === log.requestId ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}</button></div></div><div><span>Địa chỉ IP</span><strong>{normalizedIpAddress(log.context?.ipAddress)}</strong></div><div><span>Nguồn truy cập (Endpoint)</span><strong>{endpoint}</strong></div></div>{showChanges && <div className="audit-log-change-list"><h3>Nội dung thay đổi</h3>{changes.map((change) => <div className="audit-log-change-item" key={change.key}><strong>{change.key}</strong><span>{change.before}</span><span aria-hidden="true">→</span><span>{change.after}</span></div>)}</div>}</div></td></tr>}
          </Fragment>
        })}
      </tbody></DataTable>
      <TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} onPageChange={setPage} rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} nhật ký`} pageSize={pageSize} pageSizes={pageSizes} onPageSizeChange={(value) => { setPageSize(value as PageSize); setPage(1) }} />
    </SurfaceCard>
  </>
}
