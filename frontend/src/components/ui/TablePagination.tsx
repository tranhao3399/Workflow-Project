import { FilterSelect } from './FilterSelect'

interface TablePaginationProps {
  currentPage: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
  rangeLabel: string
  pageSize: number
  pageSizes: readonly number[]
  onPageSizeChange: (pageSize: number) => void
}

export function TablePagination({ currentPage, totalPages, onPrevious, onNext, rangeLabel, pageSize, pageSizes, onPageSizeChange }: TablePaginationProps) {
  return <footer className="pagination-bar" aria-label="Phân trang"><div className="pagination-controls"><button className="secondary-button" type="button" disabled={currentPage === 1} onClick={onPrevious}>Trước</button><span className="page-number" aria-current="page">{currentPage}</span><span className="page-total">/ {totalPages}</span><button className="secondary-button" type="button" disabled={currentPage === totalPages} onClick={onNext}>Sau</button></div><div className="pagination-summary"><span>{rangeLabel}</span><label className="page-size-control"><span>Hiển thị</span><FilterSelect className="page-size-filter-select" ariaLabel="Chọn số bản ghi hiển thị" value={String(pageSize)} options={pageSizes.map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => onPageSizeChange(Number(value))} /></label></div></footer>
}
