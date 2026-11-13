import { useCallback, useEffect, useRef, useState } from 'react'
import { getUserPage } from '../services/administration.service'
import type { User } from '../types/administration'
import type { UserRole } from '../types/auth'
import { formatRole } from '../utils/formatters'
import { ActivityStatusBadge } from './StatusBadge'
import { ErrorState, LoadingState } from './DataStates'
import { AdvancedFilterPanel } from './ui/AdvancedFilterPanel'
import { DataTable, EmptyTableRow } from './ui/DataTable'
import { FilterSelect } from './ui/FilterSelect'
import { ListToolbar } from './ui/ListToolbar'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { SortableTableHeader } from './ui/SortableTableHeader'
import { TablePagination } from './ui/TablePagination'

interface UserCatalogPageProps { onOpenUser: (userId: string) => void; onCreateUser: () => void; canCreateUser: boolean }
type PageSize = 10 | 20 | 50
const pageSizes: PageSize[] = [10, 20, 50]

export function UserCatalogPage({ onOpenUser, onCreateUser, canCreateUser }: UserCatalogPageProps) {
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [role, setRole] = useState('ALL')
  const [activity, setActivity] = useState('ALL')
  const [openSelect, setOpenSelect] = useState<'role' | 'activity' | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const [sortBy, setSortBy] = useState<'createdAt' | 'email' | 'employeeCode' | 'fullName' | 'status'>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [hasUserSorted, setHasUserSorted] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    void reloadVersion
    try {
      const result = await getUserPage({
        search: searchQuery,
        role: role === 'ALL' ? undefined : role as UserRole,
        isActive: activity === 'ALL' ? undefined : activity === 'ACTIVE',
        sortBy,
        sortOrder,
        page,
        limit: pageSize,
      })
      if (result.pagination.totalPages > 0 && page > result.pagination.totalPages) {
        setPage(result.pagination.totalPages)
        return
      }
      setUsers(result.data)
      setTotal(result.pagination.total)
      setTotalPages(result.pagination.totalPages)
      setHasError(false)
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [activity, page, pageSize, reloadVersion, role, searchQuery, sortBy, sortOrder])

  // Đồng bộ dữ liệu khi đổi tiêu chí phân trang, lọc hoặc sắp xếp.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const currentPage = page
  const rangeStart = total ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(currentPage * pageSize, total)

  function refresh() {
    setIsRefreshing(true)
    setSearchInput('')
    setSearchQuery('')
    setRole('ALL')
    setActivity('ALL')
    setPage(1)
    setPageSize(10)
    setSortBy('createdAt')
    setSortOrder('desc')
    setHasUserSorted(false)
    setIsFilterOpen(false)
    setOpenSelect(null)
    setReloadVersion((value) => value + 1)
  }

  function changeSort(column: string) {
    const next = column as 'email' | 'employeeCode' | 'fullName' | 'status'
    setSortOrder((current) => sortBy === next ? (current === 'asc' ? 'desc' : 'asc') : 'asc')
    setSortBy(next)
    setHasUserSorted(true)
    setPage(1)
  }

  if (isLoading) return <LoadingState />
  if (hasError) return <ErrorState onRetry={() => { setIsRefreshing(true); setReloadVersion((value) => value + 1) }} />

  return <>
    <PageHeader className="user-catalog-header" title="Tài khoản người dùng" actions={canCreateUser ? <button className="primary-button compact-button" type="button" onClick={onCreateUser}>Thêm tài khoản</button> : undefined} />
    <SurfaceCard className="admin-section user-catalog-section">
      <ListToolbar><div className="catalog-toolbar-main"><div className="catalog-search-row"><label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input ref={inputRef} value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1) }} placeholder="Mã nhân viên hoặc email" />{searchInput && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); inputRef.current?.focus() }}>×</button>}</span></label><button className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'} type="button" onClick={() => { setIsFilterOpen((open) => !open); setOpenSelect(null) }} aria-expanded={isFilterOpen}>{isFilterOpen ? <svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg> : <svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z" /></svg>}<span>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span></button><button className="secondary-button catalog-refresh-button" type="button" disabled={isRefreshing} onClick={refresh}>↻ {isRefreshing ? 'Đang làm mới...' : 'Làm mới'}</button></div><AdvancedFilterPanel id="account-filters" label="Bộ lọc tài khoản" isOpen={isFilterOpen}><div className="advanced-filter-content"><div className="advanced-filter-fields"><label><span>Vai trò</span><FilterSelect ariaLabel="Lọc theo vai trò" value={role} options={[{ value: 'ALL', label: 'Tất cả vai trò' }, { value: 'ADMIN', label: 'Quản trị viên' }, { value: 'DIRECTOR', label: 'Giám đốc' }, { value: 'MANAGER', label: 'Quản lý' }, { value: 'ACCOUNTANT', label: 'Kế toán' }, { value: 'EMPLOYEE', label: 'Nhân viên' }]} onChange={(value) => { setRole(value); setPage(1) }} isOpen={openSelect === 'role'} onOpenChange={(open) => setOpenSelect(open ? 'role' : null)} /></label><label><span>Trạng thái tài khoản</span><FilterSelect ariaLabel="Lọc theo trạng thái tài khoản" value={activity} options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, { value: 'ACTIVE', label: 'Hoạt động' }, { value: 'INACTIVE', label: 'Ngưng hoạt động' }]} onChange={(value) => { setActivity(value); setPage(1) }} isOpen={openSelect === 'activity'} onOpenChange={(open) => setOpenSelect(open ? 'activity' : null)} /></label></div></div></AdvancedFilterPanel></div></ListToolbar>
      <DataTable className="admin-table user-catalog-table" fixedLayout><thead><tr>
        <SortableTableHeader column="email" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Email</SortableTableHeader>
        <SortableTableHeader column="employeeCode" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Mã nhân viên</SortableTableHeader>
        <SortableTableHeader column="fullName" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Họ và tên</SortableTableHeader>
        <th>Vai trò</th>
        <SortableTableHeader column="status" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Trạng thái</SortableTableHeader>
      </tr></thead><tbody>{users.length === 0 ? <EmptyTableRow colSpan={5} message="Không tìm thấy tài khoản phù hợp." /> : users.map((user) => <tr key={user.id}><td><button className="user-detail-link" type="button" onClick={() => onOpenUser(user.id)}>{user.email}</button></td><td><strong>{user.employeeCode ?? 'Chưa liên kết'}</strong></td><td><strong>{user.fullName || '—'}</strong></td><td><span className="role-chip-list">{(user.roles ?? [user.role]).map((item) => <span className="role-chip" key={item}>{formatRole(item)}</span>)}</span></td><td><ActivityStatusBadge isActive={user.isActive} /></td></tr>)}</tbody></DataTable>
      <TablePagination currentPage={currentPage} totalPages={Math.max(1, totalPages)} onPrevious={() => setPage(currentPage - 1)} onNext={() => setPage(currentPage + 1)} onPageChange={setPage} rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} tài khoản`} pageSize={pageSize} pageSizes={pageSizes} onPageSizeChange={(value) => { setPageSize(value as PageSize); setPage(1) }} />
    </SurfaceCard>
  </>
}
