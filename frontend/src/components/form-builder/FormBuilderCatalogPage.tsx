import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CopyPlus, FolderOpen, Settings2 } from 'lucide-react'
import {
  cloneFormDefinition,
  listFormDefinitions,
  listFormGroups,
} from '../../services/form-definitions.service'
import {
  definitionStatuses,
  type DefinitionStatus,
  type FormDefinition,
  type FormDefinitionSortField,
  type FormGroup,
} from '../../types/workflow'
import { normalizeSearchText } from '../../utils/formatters'
import { DefinitionStatusBadge } from '../StatusBadge'
import { EmptyState, ErrorState, LoadingState } from '../DataStates'
import { AdvancedFilterPanel } from '../ui/AdvancedFilterPanel'
import { DataTable, EmptyTableRow } from '../ui/DataTable'
import { FilterSelect } from '../ui/FilterSelect'
import { ListToolbar } from '../ui/ListToolbar'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'
import { SortableTableHeader } from '../ui/SortableTableHeader'
import { TablePagination } from '../ui/TablePagination'
import { FormGroupManagerDialog } from './FormGroupManagerDialog'

interface FormBuilderCatalogPageProps {
  initialGroupId?: string
  canCreate: boolean
  canUpdate: boolean
  canDeleteDraft: boolean
  onCreate: (groupId?: string) => void
  onOpen: (id: string) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

const pageSizes = [10, 20, 50]
const statusOptions = [
  { value: '', label: 'Tất cả trạng thái' },
  ...definitionStatuses.map((status) => ({ value: status, label: statusLabel(status) })),
]
export function FormBuilderCatalogPage({
  initialGroupId,
  canCreate,
  canUpdate,
  canDeleteDraft,
  onCreate,
  onOpen,
  onNotify,
}: FormBuilderCatalogPageProps) {
  const [groups, setGroups] = useState<FormGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    initialGroupId && initialGroupId !== 'UNGROUPED' ? initialGroupId : null,
  )
  const [isManagingGroups, setIsManagingGroups] = useState(false)
  const [items, setItems] = useState<FormDefinition[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isStatusSelectOpen, setIsStatusSelectOpen] = useState(false)
  const [status, setStatus] = useState<DefinitionStatus | ''>('')
  const [sortBy, setSortBy] = useState<FormDefinitionSortField>('updatedAt')
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
  const [cloningId, setCloningId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null
  const hasActiveGroups = groups.some((group) => group.isActive)
  const normalizedGroupSearch = normalizeSearchText(searchInput.trim())
  const visibleGroups = normalizedGroupSearch
    ? groups.filter((group) => normalizeSearchText(`${group.code} ${group.name} ${group.description ?? ''}`).includes(normalizedGroupSearch))
    : groups

  const loadGroups = useCallback(async () => {
    setGroups(await listFormGroups())
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (selectedGroupId) {
        setSearch(searchInput.trim())
        setPage(1)
      }
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput, selectedGroupId])

  const load = useCallback(async (refreshVersion: number) => {
    if (refreshVersion < 0) return
    try {
      if (!selectedGroupId) {
        await loadGroups()
        setHasError(false)
        return
      }
      if (!groups.length) await loadGroups()
      const result = await listFormDefinitions({
        page,
        limit,
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        groupId: selectedGroupId,
        sortBy,
        sortOrder,
      })
      setItems(result.data)
      setTotal(result.pagination.total)
      const nextTotalPages = Math.max(1, result.pagination.totalPages)
      setTotalPages(nextTotalPages)
      setHasError(false)
      if (page > nextTotalPages) setPage(nextTotalPages)
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [groups.length, limit, loadGroups, page, search, selectedGroupId, sortBy, sortOrder, status])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(reloadVersion), 0)
    return () => window.clearTimeout(timeoutId)
  }, [load, reloadVersion])

  async function clone(item: FormDefinition) {
    setCloningId(item.id)
    try {
      const cloned = await cloneFormDefinition(item.id)
      onNotify(`Đã tạo phiên bản ${cloned.version} ở trạng thái nháp.`)
      onOpen(cloned.id)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể tạo phiên bản nháp mới.', 'error')
    } finally {
      setCloningId(null)
    }
  }

  function openGroup(group: FormGroup) {
    setSelectedGroupId(group.id)
    setSearchInput('')
    setSearch('')
    setStatus('')
    setSortBy('updatedAt')
    setSortOrder('desc')
    setHasUserSorted(false)
    setPage(1)
    setIsLoading(true)
    window.history.replaceState(null, '', `/form-builder?groupId=${encodeURIComponent(group.id)}`)
  }

  function backToGroups() {
    setSelectedGroupId(null)
    setSearchInput('')
    setSearch('')
    setStatus('')
    setPage(1)
    setIsLoading(true)
    window.history.replaceState(null, '', '/form-builder')
  }

  function clearSearch() {
    setSearchInput('')
    setIsLoading(Boolean(selectedGroupId))
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
    setPage(1)
    setIsRefreshing(true)
    setIsLoading(true)
    setReloadVersion((value) => value + 1)
  }

  const activeFilterCount = Number(status !== '')
  const rangeStart = total ? (page - 1) * limit + 1 : 0
  const rangeEnd = Math.min(page * limit, total)

  function changeSort(column: string) {
    const nextColumn = column as FormDefinitionSortField
    setSortOrder((currentOrder) => sortBy === nextColumn
      ? (currentOrder === 'asc' ? 'desc' : 'asc')
      : (nextColumn === 'updatedAt' || nextColumn === 'version' ? 'desc' : 'asc'))
    setSortBy(nextColumn)
    setHasUserSorted(true)
    setPage(1)
    setIsLoading(true)
  }

  return <>
    {selectedGroup && (
      <nav className="detail-breadcrumb" aria-label="Điều hướng quản lý biểu mẫu">
        <button className="breadcrumb-link" type="button" onClick={backToGroups}>
          Quản lý biểu mẫu
        </button>
        <span aria-hidden="true">/</span>
        <strong>Nhóm: {selectedGroup.name}</strong>
      </nav>
    )}

    <PageHeader
      className="catalog-page-header"
      title={selectedGroup ? selectedGroup.name : 'Quản lý biểu mẫu'}
      actions={<div className="page-header-actions">
        {selectedGroup && <button className="secondary-button compact-button" type="button" onClick={backToGroups}><ArrowLeft size={14} /> Quay lại nhóm</button>}
        {!selectedGroup && <button className="secondary-button compact-button" type="button" onClick={() => setIsManagingGroups(true)}><Settings2 size={14} /> Quản lý nhóm</button>}
        {canCreate && (selectedGroup ? selectedGroup.isActive : hasActiveGroups) && <button className="primary-button compact-button" type="button" onClick={() => onCreate(selectedGroup?.id)}>Tạo biểu mẫu</button>}
      </div>}
    />

    <SurfaceCard className="master-data-section form-builder-catalog">
      <ListToolbar>
        <div className="catalog-toolbar-main">
          <div className="catalog-search-row">
            <label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input">
              <input ref={searchRef} value={searchInput} onChange={(event) => { setSearchInput(event.target.value); if (selectedGroupId) setIsLoading(true) }} placeholder={selectedGroup ? 'Mã hoặc tên biểu mẫu' : 'Mã hoặc tên nhóm biểu mẫu'} />
              {searchInput && <button className="clear-search-button" type="button" aria-label="Xóa nội dung tìm kiếm" onClick={clearSearch}>×</button>}
            </span></label>
            {selectedGroup && <button className={isFilterOpen ? 'secondary-button filter-trigger is-active' : 'secondary-button filter-trigger'} type="button" aria-expanded={isFilterOpen} onClick={() => setIsFilterOpen((open) => !open)}>
              <span>Bộ lọc</span>{activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}
            </button>}
            <button className="secondary-button catalog-refresh-button" type="button" disabled={isLoading || isRefreshing} onClick={refresh}><span className={isRefreshing ? 'refresh-icon is-spinning' : 'refresh-icon'}>↻</span>{isRefreshing ? 'Đang làm mới...' : 'Làm mới'}</button>
          </div>
          {selectedGroup && <AdvancedFilterPanel id="form-builder-filters" label="Bộ lọc danh sách biểu mẫu" isOpen={isFilterOpen}>
            <div className="advanced-filter-content master-filter-content form-builder-filter-content">
              <div><span className="form-builder-filter-label">Trạng thái</span><FilterSelect ariaLabel="Lọc trạng thái biểu mẫu" value={status} options={statusOptions} isOpen={isStatusSelectOpen} onOpenChange={setIsStatusSelectOpen} onChange={(value) => { setStatus(value as DefinitionStatus | ''); setPage(1); setIsLoading(true) }} /></div>
              {activeFilterCount > 0 && <button className="secondary-button compact-button form-builder-reset-filter-btn" type="button" onClick={resetFilters}>Xóa bộ lọc</button>}
            </div>
          </AdvancedFilterPanel>}
        </div>
      </ListToolbar>

      {isLoading && (!selectedGroup || !items.length) ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setReloadVersion((value) => value + 1) }} /> : !selectedGroup ? (
        visibleGroups.length === 0 ? <EmptyState title={groups.length === 0 ? 'Chưa có nhóm biểu mẫu' : 'Không tìm thấy nhóm biểu mẫu'} description={groups.length === 0 ? 'Vui lòng tạo nhóm biểu mẫu trước khi tạo biểu mẫu mới.' : 'Thử lại với từ khóa khác.'} /> : <div className="form-group-card-grid">
          {visibleGroups.map((group) => <button className="form-group-card" type="button" key={group.id} onClick={() => openGroup(group)}>
            <span className="form-group-card-icon"><FolderOpen size={22} /></span>
            <span className="form-group-card-content"><span className="form-group-card-title"><strong>{group.name}</strong><span className={group.isActive ? 'status-badge status-active' : 'status-badge status-inactive'}>{group.isActive ? 'Hoạt động' : 'Ngưng hoạt động'}</span></span><small>{group.code}</small><span>{group.description || 'Nhóm biểu mẫu nội bộ.'}</span></span>
            <span className="form-group-card-count"><strong>{group.formCount}</strong><span>biểu mẫu</span></span>
          </button>)}
        </div>
      ) : <>
        <DataTable className="admin-table master-data-table form-builder-table" fixedLayout>
          <thead><tr>
            <SortableTableHeader column="code" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Mã biểu mẫu</SortableTableHeader>
            <SortableTableHeader column="name" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Tên biểu mẫu</SortableTableHeader>
            <SortableTableHeader column="version" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Phiên bản</SortableTableHeader>
            <SortableTableHeader column="status" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Trạng thái</SortableTableHeader>
            <th>Người tạo</th>
            <th aria-label="Thao tác" />
          </tr></thead>
          <tbody>{items.length === 0 ? <EmptyTableRow colSpan={6} message="Không tìm thấy biểu mẫu phù hợp." /> : items.map((item) => <tr className="form-builder-row" key={item.id}>
            <td><button className="master-code-link" type="button" onClick={() => onOpen(item.id)}>{item.code}</button></td>
            <td><div className="form-builder-catalog-title"><strong>{item.name}</strong></div></td>
            <td><span className="form-builder-version-text">v{item.version}</span></td>
            <td><DefinitionStatusBadge status={item.status} /></td>
            <td>{item.createdBy?.name ?? item.updatedBy?.name ?? '—'}</td>
            <td><div className="form-builder-row-actions">
              {item.status !== 'DRAFT' && canCreate && <button className="secondary-button form-builder-clone-btn" type="button" disabled={cloningId === item.id} onClick={() => void clone(item)}><CopyPlus size={13} /><span>{cloningId === item.id ? 'Đang tạo...' : 'Tạo bản nháp'}</span></button>}
            </div></td>
          </tr>)}</tbody>
        </DataTable>
        <TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setIsLoading(true); setPage((value) => Math.max(1, value - 1)) }} onNext={() => { setIsLoading(true); setPage((value) => Math.min(totalPages, value + 1)) }} onPageChange={(value) => { setIsLoading(true); setPage(value) }} rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} biểu mẫu`} pageSize={limit} pageSizes={pageSizes} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} />
      </>}
    </SurfaceCard>

    {isManagingGroups && <FormGroupManagerDialog groups={groups} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDeleteDraft} onClose={() => setIsManagingGroups(false)} onChanged={async () => { await loadGroups(); setReloadVersion((value) => value + 1) }} onNotify={onNotify} />}
  </>
}

function statusLabel(status: DefinitionStatus): string {
  return { DRAFT: 'Nháp', PUBLISHED: 'Đã xuất bản', INACTIVE: 'Ngưng hoạt động', ARCHIVED: 'Đã lưu trữ' }[status]
}
