import { useEffect, useMemo, useRef, useState } from 'react'
import { getEmployees } from '../services/employees.service'
import { resolveApiAssetUrl } from '../services/api-client'
import type { Employee } from '../types/employees'
import { normalizeSearchText } from '../utils/formatters'
import { EmployeeStatusBadge } from './StatusBadge'
import { ErrorState, LoadingState } from './DataStates'
import { AdvancedFilterPanel } from './ui/AdvancedFilterPanel'
import { DataTable, EmptyTableRow } from './ui/DataTable'
import { FilterSelect } from './ui/FilterSelect'
import { ListToolbar } from './ui/ListToolbar'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { TablePagination } from './ui/TablePagination'

interface EmployeeCatalogPageProps { onOpenEmployee: (employeeId: string) => void; onCreateEmployee: () => void; canCreateEmployee: boolean }
type FilterKey = 'department' | 'status'
type PageSize = 5 | 10 | 20 | 50
const pageSizes: PageSize[] = [5, 10, 20, 50]

function EmployeeRowAvatar({ employee }: { employee: Employee }) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = employee.fullName.trim().charAt(0).toUpperCase() || 'N'
  if (employee.avatarUrl && !imageFailed) return <img className="employee-row-avatar" src={resolveApiAssetUrl(employee.avatarUrl)} alt="" onError={() => setImageFailed(true)} />
  return <span className="employee-row-avatar employee-row-avatar-fallback" aria-hidden="true">{initial}</span>
}

export function EmployeeCatalogPage({ onOpenEmployee, onCreateEmployee, canCreateEmployee }: EmployeeCatalogPageProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [openSelect, setOpenSelect] = useState<FilterKey | null>(null)
  const [department, setDepartment] = useState('ALL')
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const inputRef = useRef<HTMLInputElement>(null)

  async function load(showRefresh = false) {
    if (showRefresh) setIsRefreshing(true)
    try { setEmployees(await getEmployees()); setHasError(false) }
    catch { setHasError(true) } finally { setIsLoading(false); setIsRefreshing(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { const timer = window.setTimeout(() => setSearchQuery(searchInput), 300); return () => window.clearTimeout(timer) }, [searchInput])
  const departments = useMemo(() => [...new Set(employees.map((employee) => employee.department))].sort(), [employees])
  const filtered = useMemo(() => {
    const query = normalizeSearchText(searchQuery)
    return employees.filter((employee) => (!query || [employee.employeeCode, employee.fullName, employee.workEmail, employee.position].some((value) => normalizeSearchText(value).includes(query))) && (department === 'ALL' || employee.department === department) && (status === 'ALL' || (status === 'ACTIVE' ? employee.isActive : !employee.isActive)))
  }, [department, employees, searchQuery, status])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, totalPages); const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize); const rangeStart = filtered.length ? (currentPage - 1) * pageSize + 1 : 0; const rangeEnd = Math.min(currentPage * pageSize, filtered.length)
  function resetAndRefresh() { setSearchInput(''); setSearchQuery(''); setDepartment('ALL'); setStatus('ALL'); setPage(1); setPageSize(10); setIsFilterOpen(false); setOpenSelect(null); void load(true) }
  function clearSearch() { setSearchInput(''); setSearchQuery(''); setPage(1); window.requestAnimationFrame(() => inputRef.current?.focus()) }

  if (isLoading) return <LoadingState />
  if (hasError) return <ErrorState onRetry={() => void load(true)} />
  return <><PageHeader title="Nhân viên" description="Quản lý hồ sơ nhân sự và trạng thái làm việc trong tổ chức." actions={canCreateEmployee ? <button className="primary-button compact-button" type="button" onClick={onCreateEmployee}>Thêm nhân viên</button> : undefined} />
    <SurfaceCard className="admin-section user-catalog-section"><ListToolbar><div className="catalog-toolbar-main"><div className="catalog-search-row"><label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input ref={inputRef} value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1) }} placeholder="Mã, họ tên hoặc email" />{searchInput && <button className="clear-search-button" type="button" onClick={clearSearch} aria-label="Xóa nội dung tìm kiếm">×</button>}</span></label><button className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'} type="button" onClick={() => { setIsFilterOpen((open) => !open); setOpenSelect(null) }} aria-expanded={isFilterOpen}>{isFilterOpen ? <svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg> : <svg className="filter-trigger-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z" /></svg>}<span>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span></button><button className="secondary-button catalog-refresh-button" type="button" onClick={resetAndRefresh} disabled={isRefreshing}><span className={isRefreshing ? 'refresh-icon is-spinning' : 'refresh-icon'}>↻</span>{isRefreshing ? 'Đang làm mới...' : 'Làm mới'}</button></div><AdvancedFilterPanel id="employee-filters" label="Bộ lọc nhân viên" isOpen={isFilterOpen}><div className="advanced-filter-content"><div className="advanced-filter-fields"><label><span>Phòng ban</span><FilterSelect ariaLabel="Lọc theo phòng ban" value={department} options={[{ value: 'ALL', label: 'Tất cả phòng ban' }, ...departments.map((value) => ({ value, label: value }))]} onChange={(value) => { setDepartment(value); setPage(1) }} isOpen={openSelect === 'department'} onOpenChange={(open) => setOpenSelect(open ? 'department' : null)} /></label><label><span>Trạng thái làm việc</span><FilterSelect ariaLabel="Lọc theo trạng thái làm việc" value={status} options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, { value: 'ACTIVE', label: 'Đang làm việc' }, { value: 'INACTIVE', label: 'Ngừng làm việc' }]} onChange={(value) => { setStatus(value as 'ALL' | 'ACTIVE' | 'INACTIVE'); setPage(1) }} isOpen={openSelect === 'status'} onOpenChange={(open) => setOpenSelect(open ? 'status' : null)} /></label></div></div></AdvancedFilterPanel></div></ListToolbar>
      <DataTable className="admin-table" fixedLayout><thead><tr><th>Nhân viên</th><th>Email</th><th>Phòng ban</th><th>Chức danh</th><th>Trạng thái làm việc</th></tr></thead><tbody>{rows.length === 0 ? <EmptyTableRow colSpan={5} message="Không tìm thấy nhân viên phù hợp." /> : rows.map((employee) => <tr key={employee.id}><td><button className="employee-identity-cell user-detail-link" type="button" onClick={() => onOpenEmployee(employee.id)}><EmployeeRowAvatar employee={employee} /><span className="employee-identity-text"><strong>{employee.fullName}</strong><span aria-hidden="true">·</span><small>{employee.employeeCode}</small></span></button></td><td><span className="employee-work-email">{employee.workEmail}</span></td><td>{employee.department}</td><td>{employee.position}</td><td><EmployeeStatusBadge isActive={employee.isActive} /></td></tr>)}</tbody></DataTable><TablePagination currentPage={currentPage} totalPages={totalPages} onPrevious={() => setPage(currentPage - 1)} onNext={() => setPage(currentPage + 1)} rangeLabel={`${rangeStart}–${rangeEnd} trên ${filtered.length} nhân viên`} pageSize={pageSize} pageSizes={pageSizes} onPageSizeChange={(value) => { setPageSize(value as PageSize); setPage(1) }} />
    </SurfaceCard></>
}
