import { useEffect, useMemo, useState } from 'react'
import { createRequest, getAvailableForms } from '../../services/requests.service'
import type { AvailableFormDefinition } from '../../types/workflow'
import { normalizeSearchText } from '../../utils/formatters'
import { notifyRequestMutation } from '../../utils/request-events'
import { EmptyState, ErrorState, LoadingState } from '../DataStates'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'

interface RequestFormsPageProps {
  onBack: () => void
  onOpenRequest: (id: string, replace?: boolean) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

export function RequestFormsPage({ onBack, onOpenRequest, onNotify }: RequestFormsPageProps) {
  const [forms, setForms] = useState<AvailableFormDefinition[]>([])
  const [search, setSearch] = useState('')
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

  const filteredForms = useMemo(() => {
    const query = normalizeSearchText(search.trim())
    if (!query) return forms
    return forms.filter((form) => normalizeSearchText(`${form.code} ${form.name} ${form.description ?? ''} ${form.category ?? ''}`).includes(query))
  }, [forms, search])

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
    <PageHeader title="Tạo phiếu" description="Chọn biểu mẫu đang được phát hành để bắt đầu." actions={<button className="secondary-button" type="button" onClick={onBack}>← Quay lại</button>} />
    <SurfaceCard className="request-form-catalog">
      <div className="request-form-toolbar"><label className="catalog-search"><span>Tìm kiếm</span><span className="catalog-search-input"><input value={search} placeholder="Tên hoặc mã biểu mẫu" onChange={(event) => setSearch(event.target.value)} />{search && <button className="clear-search-button" type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch('')}>×</button>}</span></label></div>
      {isLoading ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((value) => value + 1) }} /> : forms.length === 0 ? <EmptyState title="Chưa có biểu mẫu khả dụng" description="Hiện chưa có gói Form-Workflow nào đang được phát hành." /> : filteredForms.length === 0 ? <EmptyState title="Không tìm thấy biểu mẫu" description="Thử lại với từ khóa khác." /> : <div className="request-form-grid">{filteredForms.map((form) => <article className="request-form-card" key={form.id}>
        <div className="request-form-card-heading"><span className="request-form-symbol" aria-hidden="true">{form.icon || form.name.trim().charAt(0).toUpperCase()}</span><div><strong>{form.name}</strong><span>{form.code} · v{form.version}</span></div></div>
        {form.category && <span className="request-form-category">{form.category}</span>}
        <p>{form.description || 'Biểu mẫu yêu cầu nội bộ.'}</p>
        <footer><span>{form.fields.length} trường thông tin</span><button className="primary-button compact-button" type="button" disabled={creatingFormId !== null} onClick={() => void create(form)}>{creatingFormId === form.id ? 'Đang tạo...' : 'Tạo phiếu'}</button></footer>
      </article>)}</div>}
    </SurfaceCard>
  </>
}
