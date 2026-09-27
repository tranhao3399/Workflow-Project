import { useEffect, useMemo, useRef, useState } from 'react'
import { getUsers } from '../services/administration.service'
import { getEmployees } from '../services/employees.service'
import type { User } from '../types/administration'
import { formatRole, normalizeSearchText } from '../utils/formatters'
import { ActivityStatusBadge } from './StatusBadge'
import { ErrorState, LoadingState } from './DataStates'
import { AdvancedFilterPanel } from './ui/AdvancedFilterPanel'
import { DataTable, EmptyTableRow } from './ui/DataTable'
import { FilterSelect } from './ui/FilterSelect'
import { ListToolbar } from './ui/ListToolbar'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { TablePagination } from './ui/TablePagination'

interface UserCatalogPageProps { onOpenUser: (userId: string) => void; onCreateUser: () => void; canCreateUser: boolean }
type PageSize = 5 | 10 | 20 | 50
const pageSizes: PageSize[] = [5, 10, 20, 50]
interface LinkedEmployee { employeeCode: string; fullName: string }

export function UserCatalogPage({ onOpenUser, onCreateUser, canCreateUser }: UserCatalogPageProps) {
  const [users, setUsers] = useState<User[]>([])
  const [employeesById, setEmployeesById] = useState<Map<string, LinkedEmployee>>(new Map())
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
  const inputRef = useRef<HTMLInputElement>(null)

  async function load(refresh = false) {
    if (refresh) setIsRefreshing(true)
    try {
      const [accountData, employees] = await Promise.all([getUsers(), getEmployees()])
      setUsers(accountData)
      setEmployeesById(new Map(employees.map((employee) => [employee.id, { employeeCode: employee.employeeCode, fullName: employee.fullName }])))
      setHasError(false)
    } catch { setHasError(true) } finally { setIsLoading(false); setIsRefreshing(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { const timer = window.setTimeout(() => setSearchQuery(searchInput), 300); return () => window.clearTimeout(timer) }, [searchInput])
  const filtered = useMemo(() => {
    const query = normalizeSearchText(searchQuery)
    return users.filter((user) => {
      const employee = user.employeeId ? employeesById.get(user.employeeId) : undefined
      return (!query || [user.email, employee?.employeeCode ?? '', employee?.fullName ?? ''].some((value) => normalizeSearchText(value).includes(query)))
        && (role === 'ALL' || (user.roles ?? [user.role]).includes(role as User['role']))
        && (activity === 'ALL' || (activity === 'ACTIVE' ? user.isActive : !user.isActive))
    })
  }, [activity, employeesById, role, searchQuery, users])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const rangeStart = filtered.length ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(currentPage * pageSize, filtered.length)
  function refresh() { setSearchInput(''); setSearchQuery(''); setRole('ALL'); setActivity('ALL'); setPage(1); setPageSize(10); setIsFilterOpen(false); setOpenSelect(null); void load(true) }
  if (isLoading) return <LoadingState />
  if (hasError) return <ErrorState onRetry={() => void load(true)} />
  return <>
    <PageHeader title="Tài khoản người dùng" description="Quản lý thông tin đăng nhập, vai trò và trạng thái truy cập." actions={canCreateUser ? <button className="primary-button compact-button" type="button" onClick={onCreateUser}>Thêm tài khoản</button> : undefined} />
    <SurfaceCard className="admin-section user-catalog-section"><ListToolbar><div className="catalog-toolbar-main"><div className="catalog-search-row"><label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input ref={inputRef} value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1) }} placeholder="Mã nhân viên hoặc email" />{searchInput && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); inputRef.current?.focus() }}>×</button>}</span></label><button className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'} type="button" onClick={() => { setIsFilterOpen((open) => !open); setOpenSelect(null) }} aria-expanded={isFilterOpen}>{isFilterOpen ? <svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg> : <svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z" /></svg>}<span>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span></button><button className="secondary-button catalog-refresh-button" type="button" disabled={isRefreshing} onClick={refresh}>↻ {isRefreshing ? 'Đang làm mới...' : 'Làm mới'}</button></div><AdvancedFilterPanel id="account-filters" label="Bộ lọc tài khoản" isOpen={isFilterOpen}><div className="advanced-filter-content"><div className="advanced-filter-fields"><label><span>Vai trò</span><FilterSelect ariaLabel="Lọc theo vai trò" value={role} options={[{ value: 'ALL', label: 'Tất cả vai trò' }, { value: 'ADMIN', label: 'Quản trị viên' }, { value: 'DIRECTOR', label: 'Giám đốc' }, { value: 'MANAGER', label: 'Quản lý' }, { value: 'ACCOUNTANT', label: 'Kế toán' }, { value: 'EMPLOYEE', label: 'Nhân viên' }]} onChange={(value) => { setRole(value); setPage(1) }} isOpen={openSelect === 'role'} onOpenChange={(open) => setOpenSelect(open ? 'role' : null)} /></label><label><span>Trạng thái tài khoản</span><FilterSelect ariaLabel="Lọc theo trạng thái tài khoản" value={activity} options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, { value: 'ACTIVE', label: 'Hoạt động' }, { value: 'INACTIVE', label: 'Ngưng hoạt động' }]} onChange={(value) => { setActivity(value); setPage(1) }} isOpen={openSelect === 'activity'} onOpenChange={(open) => setOpenSelect(open ? 'activity' : null)} /></label></div></div></AdvancedFilterPanel></div></ListToolbar>
      <DataTable className="admin-table user-catalog-table" fixedLayout><thead><tr><th>Email đăng nhập</th><th>Mã nhân viên</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái tài khoản</th></tr></thead><tbody>{rows.length === 0 ? <EmptyTableRow colSpan={5} message="Không tìm thấy tài khoản phù hợp." /> : rows.map((user) => { const employee = user.employeeId ? employeesById.get(user.employeeId) : undefined; return <tr key={user.id}><td><button className="user-detail-link" type="button" onClick={() => onOpenUser(user.id)}>{user.email}</button></td><td><strong>{employee?.employeeCode ?? 'Chưa liên kết'}</strong></td><td><strong>{employee?.fullName ?? '—'}</strong></td><td><span className="role-chip-list">{(user.roles ?? [user.role]).map((item) => <span className="role-chip" key={item}>{formatRole(item)}</span>)}</span></td><td><ActivityStatusBadge isActive={user.isActive} /></td></tr> })}</tbody></DataTable><TablePagination currentPage={currentPage} totalPages={totalPages} onPrevious={() => setPage(currentPage - 1)} onNext={() => setPage(currentPage + 1)} rangeLabel={`${rangeStart}–${rangeEnd} trên ${filtered.length} tài khoản`} pageSize={pageSize} pageSizes={pageSizes} onPageSizeChange={(value) => { setPageSize(value as PageSize); setPage(1) }} /></SurfaceCard>
  </>
}
