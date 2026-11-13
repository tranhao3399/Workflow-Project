import { useState } from 'react'
import { FilterSelect } from './FilterSelect'

interface TablePaginationProps {
  currentPage: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
  onPageChange: (page: number) => void
  rangeLabel: string
  pageSize: number
  pageSizes: readonly number[]
  onPageSizeChange: (pageSize: number) => void
}

export function TablePagination({ currentPage, totalPages, onPrevious, onNext, onPageChange, rangeLabel, pageSize, pageSizes, onPageSizeChange }: TablePaginationProps) {
  const safeTotalPages = Math.max(1, totalPages)
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages)
  const [pageDraft, setPageDraft] = useState<string | null>(null)
  const pageInput = pageDraft ?? String(safeCurrentPage)

  function commitPage() {
    if (!pageInput.trim()) {
      setPageDraft(null)
      return
    }
    const parsedPage = Number.parseInt(pageInput, 10)
    const correctedPage = Number.isFinite(parsedPage)
      ? Math.min(Math.max(1, parsedPage), safeTotalPages)
      : safeCurrentPage
    setPageDraft(null)
    if (correctedPage !== safeCurrentPage) onPageChange(correctedPage)
  }

  return <footer className="pagination-bar" aria-label="Phân trang"><div className="pagination-controls"><button className="secondary-button" type="button" disabled={safeCurrentPage === 1} onClick={onPrevious}>Trước</button><input className="page-number-input" type="number" inputMode="numeric" min={1} max={safeTotalPages} step={1} value={pageInput} aria-label={`Nhập số trang, từ 1 đến ${safeTotalPages}`} onChange={(event) => { const value = event.target.value; if (/^-?\d*$/.test(value)) setPageDraft(value) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitPage(); return } if (!event.ctrlKey && !event.metaKey && event.key.length === 1 && !/[\d-]/.test(event.key)) event.preventDefault() }} onBlur={commitPage} /><span className="page-total">/ {safeTotalPages}</span><button className="secondary-button" type="button" disabled={safeCurrentPage === safeTotalPages} onClick={onNext}>Sau</button></div><div className="pagination-summary"><span>{rangeLabel}</span><label className="page-size-control"><span>Hiển thị</span><FilterSelect className="page-size-filter-select" ariaLabel="Chọn số bản ghi hiển thị" value={String(pageSize)} options={pageSizes.map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => onPageSizeChange(Number(value))} menuPlacement="top" menuPortal /></label></div></footer>
}
