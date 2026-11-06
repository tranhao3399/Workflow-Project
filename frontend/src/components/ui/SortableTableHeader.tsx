import type { ReactNode } from 'react'

interface SortableTableHeaderProps {
  column: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  showIndicator?: boolean
  onSort: (column: string) => void
  children: ReactNode
}

export function SortableTableHeader({ column, sortBy, sortOrder, showIndicator = false, onSort, children }: SortableTableHeaderProps) {
  const isActive = showIndicator && sortBy === column
  return (
    <th aria-sort={isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        className={isActive ? 'sortable-table-header is-active' : 'sortable-table-header'}
        type="button"
        onClick={() => onSort(column)}
        title={isActive ? `Đảo thứ tự ${sortOrder === 'asc' ? 'giảm dần' : 'tăng dần'}` : 'Sắp xếp theo cột này'}
      >
        <span>{children}</span>
        {isActive && <span className="sortable-table-header-icon" aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
}
