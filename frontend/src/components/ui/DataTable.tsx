import type { ReactNode } from 'react'

interface DataTableProps {
  children: ReactNode
  className?: string
  fixedLayout?: boolean
}

interface EmptyTableRowProps {
  colSpan: number
  message: string
}

export function DataTable({ children, className = '', fixedLayout = false }: DataTableProps) {
  return <div className="table-wrap"><table className={fixedLayout ? `${className} table-fixed-layout` : className}>{children}</table></div>
}

export function EmptyTableRow({ colSpan, message }: EmptyTableRowProps) {
  return <tr className="table-empty-row"><td colSpan={colSpan}>{message}</td></tr>
}
