import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { createRequest, getAvailableForms } from '../../services/requests.service'
import type { AvailableFormDefinition } from '../../types/workflow'
import { normalizeSearchText } from '../../utils/formatters'
import { notifyRequestMutation } from '../../utils/request-events'
import { EmptyState, ErrorState, LoadingState } from '../DataStates'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'

interface RequestFormsPageProps {
  initialFormId?: string
  initialSearch?: string
  onBack: () => void
  onOpenRequest: (id: string, replace?: boolean) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

interface RequestFormGroup {
  id: string
  code: string
  name: string
  sortOrder: number
  forms: AvailableFormDefinition[]
}

const ungroupedId = 'UNGROUPED'

export function RequestFormsPage({ initialFormId, initialSearch, onBack, onOpenRequest, onNotify }: RequestFormsPageProps) {
  const [forms, setForms] = useState<AvailableFormDefinition[]>([])
  const [search, setSearch] = useState(initialSearch ?? '')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [creatingFormId, setCreatingFormId] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void getAvailableForms()
      .then((items) => { if (current) { setForms(items); setHasError(false) } })
      .catch(() => { if (current) setHasError(true) })
      .finally(() => { if (current) setIsLoading(false) })
    return () => { current = false }
  }, [reloadVersion])

  const groups = useMemo<RequestFormGroup[]>(() => {
    const byId = new Map<string, RequestFormGroup>()
    for (const form of forms) {
      const id = form.group?.id ?? ungroupedId
      const current = byId.get(id) ?? {
        id,
        code: form.group?.code ?? ungroupedId,
        name: form.group?.name ?? 'Chưa phân nhóm',
        sortOrder: form.group?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        forms: [],
      }
      current.forms.push(form)
      byId.set(id, current)
    }
    return [...byId.values()].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'vi'))
  }, [forms])

  const query = normalizeSearchText(search.trim())
  const searchResults = query
    ? forms.filter((form) => normalizeSearchText(`${form.code} ${form.name} ${form.description ?? ''} ${form.group?.name ?? ''}`).includes(query))
    : initialFormId
      ? forms.filter((form) => form.id === initialFormId)
      : []
  const selectedGroup = groups.find((group) => group.id === selectedGroupId)
  const visibleForms = query || initialFormId ? searchResults : selectedGroup?.forms ?? []

  async function create(form: AvailableFormDefinition) {
    if (creatingFormId) return
    setCreatingFormId(form.id)
    try {
      const request = await createRequest(form.id)
      notifyRequestMutation(request.id)
      onNotify('Tạo phiếu nháp thành công.')
      onOpenRequest(request.id, true)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể tạo phiếu nháp.', 'error')
    } finally {
      setCreatingFormId(null)
    }
  }

  return <>
    <PageHeader title={selectedGroup && !query ? selectedGroup.name : 'Tạo phiếu'} actions={<div className="page-header-actions">
      {selectedGroup && !query && <button className="secondary-button" type="button" onClick={() => setSelectedGroupId(null)}><ArrowLeft size={14} /> Quay lại nhóm</button>}
      <button className="secondary-button" type="button" onClick={onBack}>← Quay lại</button>
    </div>} />
    <SurfaceCard className="request-form-catalog">
      <div className="request-form-toolbar">
        <label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input">
          <input value={search} placeholder="Tên, mã biểu mẫu hoặc nhóm biểu mẫu" onChange={(event) => setSearch(event.target.value)} />
          {search && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch('')}>×</button>}
        </span></label>
      </div>
      {isLoading ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((value) => value + 1) }} /> : forms.length === 0 ? <EmptyState title="Chưa có biểu mẫu khả dụng" description="Hiện chưa có gói Form-Workflow nào đang được phát hành." /> : query || initialFormId || selectedGroup ? (
        visibleForms.length === 0 ? <EmptyState title="Không tìm thấy biểu mẫu" description="Thử lại với từ khóa hoặc nhóm biểu mẫu khác." /> : <div className="request-form-grid">{visibleForms.map((form) => <article className="request-form-card" key={form.id}>
          <div className="request-form-card-heading"><span className="request-form-symbol" aria-hidden="true">{form.icon || form.name.trim().charAt(0).toUpperCase()}</span><div><strong>{form.name}</strong><span>{form.code} · v{form.version}</span></div></div>
          {form.group && <span className="request-form-category">{form.group.name}</span>}
          <p>{form.description || 'Biểu mẫu yêu cầu nội bộ.'}</p>
          <footer><span>{form.fields.length} trường thông tin</span><button className="primary-button compact-button" type="button" disabled={creatingFormId !== null} onClick={() => void create(form)}>{creatingFormId === form.id ? 'Đang tạo...' : 'Tạo phiếu'}</button></footer>
        </article>)}</div>
      ) : <div className="request-form-group-grid">{groups.map((group) => <button className="request-form-group-card" type="button" key={group.id} onClick={() => setSelectedGroupId(group.id)}>
        <span className="request-form-group-icon"><FolderOpen size={22} /></span><span><strong>{group.name}</strong><small>{group.code}</small></span><b>{group.forms.length} biểu mẫu</b>
      </button>)}</div>}
    </SurfaceCard>
  </>
}
