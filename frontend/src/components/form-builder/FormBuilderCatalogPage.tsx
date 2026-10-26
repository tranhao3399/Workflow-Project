import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../services/api-client'
import { cloneFormDefinition, deleteFormDefinition, listFormDefinitions } from '../../services/form-definitions.service'
import { definitionStatuses, type DefinitionStatus, type FormDefinition } from '../../types/workflow'
import { formatDateTime } from '../../utils/formatters'
import { DefinitionStatusBadge } from '../StatusBadge'
import { ErrorState, LoadingState } from '../DataStates'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DataTable, EmptyTableRow } from '../ui/DataTable'
import { FilterSelect } from '../ui/FilterSelect'
import { ListToolbar } from '../ui/ListToolbar'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'
import { TablePagination } from '../ui/TablePagination'

interface FormBuilderCatalogPageProps {
  canCreate: boolean
  canDeleteDraft: boolean
  onCreate: () => void
  onOpen: (id: string) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

const pageSizes = [10, 20, 50]
const statusOptions = [
  { value: '', label: 'Tất cả trạng thái' },
  ...definitionStatuses.map((status) => ({ value: status, label: statusLabel(status) })),
]

export function FormBuilderCatalogPage({ canCreate, canDeleteDraft, onCreate, onOpen, onNotify }: FormBuilderCatalogPageProps) {
  const [items, setItems] = useState<FormDefinition[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DefinitionStatus | ''>('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<FormDefinition | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [cloningId, setCloningId] = useState<string | null>(null)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const load = useCallback(async (refreshVersion: number) => {
    if (refreshVersion < 0) return
    try {
      const result = await listFormDefinitions({
        page,
        limit,
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        sortBy: 'updatedAt',
        sortOrder: 'desc',
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
  }, [limit, page, search, status])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void load(reloadVersion) }, 0)
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

  async function remove() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteFormDefinition(deleteTarget.id)
      onNotify('Xóa biểu mẫu nháp thành công.')
      setDeleteTarget(null)
      setReloadVersion((value) => value + 1)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Không thể xóa biểu mẫu nháp.'
      onNotify(message, 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const rangeStart = total ? (page - 1) * limit + 1 : 0
  const rangeEnd = Math.min(page * limit, total)

  return <>
    <PageHeader
      title="Form Builder"
      description="Thiết kế biểu mẫu dùng chung và quản lý từng phiên bản trước khi cấu hình quy trình."
      actions={canCreate ? <button className="primary-button compact-button" type="button" onClick={onCreate}>+ Tạo biểu mẫu</button> : undefined}
    />
    <SurfaceCard className="admin-section form-builder-catalog">
      <ListToolbar>
        <div className="form-builder-list-filters">
          <label className="catalog-search">
            <span>Tìm kiếm</span>
            <span className="catalog-search-input">
              <input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setIsLoading(true) }} placeholder="Mã hoặc tên biểu mẫu" />
              {searchInput && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={() => { setSearchInput(''); setIsLoading(true) }}>×</button>}
            </span>
          </label>
          <label className="form-builder-status-filter">
            <span>Trạng thái</span>
            <FilterSelect ariaLabel="Lọc trạng thái biểu mẫu" value={status} options={statusOptions} onChange={(value) => { setStatus(value as DefinitionStatus | ''); setPage(1); setIsLoading(true) }} />
          </label>
          <button className="secondary-button catalog-refresh-button" type="button" disabled={isLoading} onClick={() => { setIsLoading(true); setReloadVersion((value) => value + 1) }}>↻ {isLoading ? 'Đang tải...' : 'Làm mới'}</button>
        </div>
      </ListToolbar>
      {isLoading && !items.length ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setReloadVersion((value) => value + 1) }} /> : <>
        <DataTable className="admin-table form-builder-table" fixedLayout>
          <thead><tr><th>Mã biểu mẫu</th><th>Tên biểu mẫu</th><th>Version</th><th>Trạng thái</th><th>Người cập nhật</th><th>Cập nhật lúc</th><th aria-label="Thao tác" /></tr></thead>
          <tbody>{items.length === 0 ? <EmptyTableRow colSpan={7} message="Không tìm thấy biểu mẫu phù hợp." /> : items.map((item) => <tr className="form-builder-row" key={item.id} onClick={() => onOpen(item.id)}>
            <td><button className="master-code-link" type="button" onClick={(event) => { event.stopPropagation(); onOpen(item.id) }}>{item.code}</button></td>
            <td><strong>{item.name}</strong></td>
            <td>v{item.version}</td>
            <td><DefinitionStatusBadge status={item.status} /></td>
            <td>{item.updatedBy?.name ?? '—'}</td>
            <td>{formatDateTime(item.updatedAt, 'date-first')}</td>
            <td><div className="form-builder-row-actions">
              {item.status !== 'DRAFT' && canCreate && <button className="secondary-button" type="button" disabled={cloningId === item.id} onClick={(event) => { event.stopPropagation(); void clone(item) }}>{cloningId === item.id ? 'Đang tạo...' : 'Tạo bản nháp'}</button>}
              {item.status === 'DRAFT' && canDeleteDraft && <button className="icon-action danger-icon-action" type="button" title="Xóa bản nháp" aria-label={`Xóa ${item.name}`} onClick={(event) => { event.stopPropagation(); setDeleteTarget(item) }}>×</button>}
            </div></td>
          </tr>)}</tbody>
        </DataTable>
        <TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setIsLoading(true); setPage((value) => Math.max(1, value - 1)) }} onNext={() => { setIsLoading(true); setPage((value) => Math.min(totalPages, value + 1)) }} rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} biểu mẫu`} pageSize={limit} pageSizes={pageSizes} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} />
      </>}
    </SurfaceCard>
    {deleteTarget && <ConfirmDialog title="Xóa biểu mẫu nháp" description={`Bạn có chắc chắn muốn xóa biểu mẫu ${deleteTarget.code} phiên bản ${deleteTarget.version}?`} confirmLabel="Xóa" tone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} isConfirming={isDeleting} confirmingLabel="Đang xóa..." compact />}
  </>
}

function statusLabel(status: DefinitionStatus): string {
  return ({ DRAFT: 'Nháp', PUBLISHED: 'Đã xuất bản', INACTIVE: 'Ngưng hoạt động', ARCHIVED: 'Đã lưu trữ' })[status]
}
