import { useCallback, useEffect, useState } from 'react'
import { deleteWorkflowDefinition, listWorkflowDefinitions } from '../../services/workflow-definitions.service'
import { definitionStatuses, type DefinitionStatus, type WorkflowDefinition } from '../../types/workflow'
import { formatDate } from '../../utils/formatters'
import { DefinitionStatusBadge } from '../StatusBadge'
import { ErrorState, LoadingState } from '../DataStates'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DataTable, EmptyTableRow } from '../ui/DataTable'
import { FilterSelect } from '../ui/FilterSelect'
import { ListToolbar } from '../ui/ListToolbar'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'
import { TablePagination } from '../ui/TablePagination'

interface WorkflowBuilderCatalogPageProps {
  canCreate: boolean
  canDeleteDraft: boolean
  onCreate: () => void
  onOpen: (id: string) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

const statusOptions = [
  { value: '', label: 'Tất cả trạng thái' },
  ...definitionStatuses.map((status) => ({ value: status, label: ({ DRAFT: 'Nháp', PUBLISHED: 'Đã xuất bản', INACTIVE: 'Ngưng hoạt động', ARCHIVED: 'Đã lưu trữ' })[status] })),
]

export function WorkflowBuilderCatalogPage({ canCreate, canDeleteDraft, onCreate, onOpen, onNotify }: WorkflowBuilderCatalogPageProps) {
  const [items, setItems] = useState<WorkflowDefinition[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DefinitionStatus | ''>('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<WorkflowDefinition | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  const load = useCallback(async (refreshVersion: number) => {
    if (refreshVersion < 0) return
    try {
      const result = await listWorkflowDefinitions({ page, limit, ...(search ? { search } : {}), ...(status ? { status } : {}), sortBy: 'updatedAt', sortOrder: 'desc' })
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

  useEffect(() => { const id = window.setTimeout(() => { void load(reloadVersion) }, 0); return () => window.clearTimeout(id) }, [load, reloadVersion])

  async function remove() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteWorkflowDefinition(deleteTarget.id)
      setDeleteTarget(null)
      onNotify('Xóa Workflow nháp thành công.')
      setIsLoading(true)
      setReloadVersion((value) => value + 1)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể xóa Workflow nháp.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const rangeStart = total ? (page - 1) * limit + 1 : 0
  const rangeEnd = Math.min(page * limit, total)

  return <>
    <PageHeader title="Workflow Builder" description="Thiết kế luồng xử lý, nhánh điều kiện và người phê duyệt theo từng phiên bản Form." actions={canCreate ? <button className="primary-button compact-button" type="button" onClick={onCreate}>+ Tạo Workflow</button> : undefined} />
    <SurfaceCard className="admin-section workflow-builder-catalog">
      <ListToolbar><div className="form-builder-list-filters">
        <label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input value={searchInput} placeholder="Mã, tên Workflow hoặc Form" onChange={(event) => { setSearchInput(event.target.value); setIsLoading(true) }} />{searchInput && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={() => { setSearchInput(''); setIsLoading(true) }}>×</button>}</span></label>
        <label className="form-builder-status-filter"><span>Trạng thái</span><FilterSelect ariaLabel="Lọc trạng thái Workflow" value={status} options={statusOptions} onChange={(value) => { setStatus(value as DefinitionStatus | ''); setPage(1); setIsLoading(true) }} /></label>
        <button className="secondary-button catalog-refresh-button" type="button" disabled={isLoading} onClick={() => { setIsLoading(true); setReloadVersion((value) => value + 1) }}>↻ {isLoading ? 'Đang tải...' : 'Làm mới'}</button>
      </div></ListToolbar>
      {isLoading && !items.length ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setReloadVersion((value) => value + 1) }} /> : <>
        <DataTable className="admin-table workflow-builder-table" fixedLayout><thead><tr><th>Mã Workflow</th><th>Tên Workflow</th><th>Form</th><th>Form version</th><th>Workflow version</th><th>Trạng thái</th><th>Ngày cập nhật</th><th aria-label="Thao tác" /></tr></thead><tbody>{items.length === 0 ? <EmptyTableRow colSpan={8} message="Không tìm thấy Workflow phù hợp." /> : items.map((item) => <tr className="form-builder-row" key={item.id} onClick={() => onOpen(item.id)}>
          <td><button className="master-code-link" type="button" onClick={(event) => { event.stopPropagation(); onOpen(item.id) }}>{item.code}</button></td>
          <td><strong>{item.name}</strong></td>
          <td>{item.formDefinition ? <><strong>{item.formDefinition.name}</strong><small className="workflow-form-code">{item.formDefinition.code}</small></> : '—'}</td>
          <td>{item.formDefinition ? `v${item.formDefinition.version}` : '—'}</td>
          <td>v{item.version}</td>
          <td><DefinitionStatusBadge status={item.status} /></td>
          <td>{formatDateTime(item.updatedAt)}</td>
          <td><div className="form-builder-row-actions">{item.status === 'DRAFT' && canDeleteDraft && <button className="icon-action danger-icon-action" type="button" title="Xóa bản nháp" aria-label={`Xóa ${item.name}`} onClick={(event) => { event.stopPropagation(); setDeleteTarget(item) }}>×</button>}</div></td>
        </tr>)}</tbody></DataTable>
        <TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setIsLoading(true); setPage((value) => Math.max(1, value - 1)) }} onNext={() => { setIsLoading(true); setPage((value) => Math.min(totalPages, value + 1)) }} rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} Workflow`} pageSize={limit} pageSizes={[10, 20, 50]} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} />
      </>}
    </SurfaceCard>
    {deleteTarget && <ConfirmDialog title="Xóa Workflow nháp?" description={`${deleteTarget.code} phiên bản ${deleteTarget.version} sẽ bị xóa vĩnh viễn nếu chưa được phiếu tham chiếu.`} confirmLabel="Xóa bản nháp" tone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} isConfirming={isDeleting} confirmingLabel="Đang xóa..." />}
  </>
}

function formatDateTime(value: string): string { return `${formatDate(value)} ${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))}` }
