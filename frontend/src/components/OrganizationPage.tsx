import { useEffect, useMemo, useRef, useState } from 'react'
import { getReferenceData } from '../services/reference-data.service'
import type { DepartmentOption, PositionOption, ReferenceData } from '../types/reference-data'
import { normalizeSearchText } from '../utils/formatters'
import { ErrorState, LoadingState } from './DataStates'
import { DataTable, EmptyTableRow } from './ui/DataTable'
import { ListToolbar } from './ui/ListToolbar'
import { ActiveStatusBadge } from './ui/MasterDataStatusBadge'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { TablePagination } from './ui/TablePagination'

type OrganizationTab = 'DEPARTMENTS' | 'POSITIONS'
type PageSize = 10 | 20 | 50
const pageSizes: PageSize[] = [10, 20, 50]

export function OrganizationPage() {
  const [data, setData] = useState<ReferenceData | null>(null)
  const [tab, setTab] = useState<OrganizationTab>('DEPARTMENTS')
  const [error, setError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const searchInputRef = useRef<HTMLInputElement>(null)

  async function loadData(refresh = false) {
    if (refresh) setIsRefreshing(true)
    try {
      const result = await getReferenceData()
      setData(result.data)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  // Initial server synchronization for organization reference catalog.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadData() }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  function handleTabChange(nextTab: OrganizationTab) {
    setTab(nextTab)
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
  }

  function handleRefresh() {
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
    void loadData(true)
  }

  const filteredDepartments = useMemo<DepartmentOption[]>(() => {
    if (!data?.departments) return []
    const query = normalizeSearchText(searchQuery)
    if (!query) return data.departments
    return data.departments.filter((item) =>
      normalizeSearchText(item.code).includes(query) || normalizeSearchText(item.name).includes(query),
    )
  }, [data, searchQuery])

  const filteredPositions = useMemo<PositionOption[]>(() => {
    if (!data?.positions) return []
    const query = normalizeSearchText(searchQuery)
    if (!query) return data.positions
    return data.positions.filter((item) => {
      const deptName = typeof item.departmentId === 'object' ? item.departmentId.name : 'Dùng chung'
      return (
        normalizeSearchText(item.code).includes(query) ||
        normalizeSearchText(item.name).includes(query) ||
        normalizeSearchText(deptName).includes(query)
      )
    })
  }, [data, searchQuery])

  if (error) return <ErrorState onRetry={() => { setIsLoading(true); void loadData() }} />
  if (isLoading || !data) return <LoadingState />

  const currentList = tab === 'DEPARTMENTS' ? filteredDepartments : filteredPositions
  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = currentList.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const rangeStart = currentList.length ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(currentPage * pageSize, currentList.length)

  return (
    <>
      <PageHeader
        title="Cơ cấu tổ chức"
        description="Danh mục phòng ban và chức danh dùng chung cho hồ sơ nhân viên và quy trình."
      />
      <SurfaceCard className="admin-section organization-section">
        <div className="detail-tabs" role="tablist" aria-label="Danh mục cơ cấu tổ chức">
          <button
            className={tab === 'DEPARTMENTS' ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={tab === 'DEPARTMENTS'}
            onClick={() => handleTabChange('DEPARTMENTS')}
          >
            Phòng ban ({data.departments.length})
          </button>
          <button
            className={tab === 'POSITIONS' ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={tab === 'POSITIONS'}
            onClick={() => handleTabChange('POSITIONS')}
          >
            Chức danh ({data.positions.length})
          </button>
        </div>
        <ListToolbar>
          <div className="catalog-toolbar-main">
            <div className="catalog-search-row">
              <label className="catalog-search">
                <span>Tìm kiếm</span>
                <span className="catalog-search-input">
                  <input
                    ref={searchInputRef}
                    value={searchInput}
                    onChange={(event) => { setSearchInput(event.target.value); setPage(1) }}
                    placeholder={tab === 'DEPARTMENTS' ? 'Mã hoặc tên phòng ban' : 'Mã, tên chức danh hoặc phòng ban'}
                  />
                  {searchInput && (
                    <button
                      className="clear-search-button"
                      type="button"
                      onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); searchInputRef.current?.focus() }}
                      aria-label="Xóa nội dung tìm kiếm"
                    >
                      ×
                    </button>
                  )}
                </span>
              </label>
              <button
                className="secondary-button catalog-refresh-button"
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <span className={isRefreshing ? 'refresh-icon is-spinning' : 'refresh-icon'}>↻</span>
                {isRefreshing ? 'Đang làm mới...' : 'Làm mới'}
              </button>
            </div>
          </div>
        </ListToolbar>
        {tab === 'DEPARTMENTS' ? (
          <DataTable className="admin-table master-data-table" fixedLayout>
            <thead>
              <tr>
                <th>Mã phòng ban</th>
                <th>Tên phòng ban</th>
                <th>Thứ tự</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyTableRow colSpan={4} message="Không tìm thấy phòng ban phù hợp." />
              ) : (
                rows.map((item) => {
                  const dept = item as DepartmentOption
                  return (
                    <tr key={dept._id}>
                      <td><strong className="master-secondary-text">{dept.code}</strong></td>
                      <td><strong className="master-primary-text">{dept.name}</strong></td>
                      <td>{dept.sortOrder}</td>
                      <td><ActiveStatusBadge isActive={dept.isActive} /></td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </DataTable>
        ) : (
          <DataTable className="admin-table master-data-table" fixedLayout>
            <thead>
              <tr>
                <th>Mã chức danh</th>
                <th>Tên chức danh</th>
                <th>Phòng ban trực thuộc</th>
                <th>Thứ tự</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyTableRow colSpan={5} message="Không tìm thấy chức danh phù hợp." />
              ) : (
                rows.map((item) => {
                  const position = item as PositionOption
                  return (
                    <tr key={position._id}>
                      <td><strong className="master-secondary-text">{position.code}</strong></td>
                      <td><strong className="master-primary-text">{position.name}</strong></td>
                      <td>{typeof position.departmentId === 'object' ? position.departmentId.name : 'Dùng chung'}</td>
                      <td>{position.sortOrder}</td>
                      <td><ActiveStatusBadge isActive={position.isActive} /></td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </DataTable>
        )}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevious={() => setPage(currentPage - 1)}
          onNext={() => setPage(currentPage + 1)}
          rangeLabel={`${rangeStart}–${rangeEnd} trên ${currentList.length} ${tab === 'DEPARTMENTS' ? 'phòng ban' : 'chức danh'}`}
          pageSize={pageSize}
          pageSizes={pageSizes}
          onPageSizeChange={(value) => { setPageSize(value as PageSize); setPage(1) }}
        />
      </SurfaceCard>
    </>
  )
}
