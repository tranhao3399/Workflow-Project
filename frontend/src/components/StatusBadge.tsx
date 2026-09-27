import type { RequestStatus } from '../types/erp'
import { formatStatus } from '../utils/formatters'

interface StatusBadgeProps {
  status: RequestStatus
}

export function RequestStatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{formatStatus(status)}</span>
}

export const StatusBadge = RequestStatusBadge

export function ActivityStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={isActive ? 'status-badge account-status-active' : 'status-badge account-status-inactive'}>
      {isActive ? 'Hoạt động' : 'Ngưng hoạt động'}
    </span>
  )
}

export function WorkflowStatusBadge({ isPublished }: { isPublished: boolean }) {
  return <span className={isPublished ? 'status-badge workflow-status-published' : 'status-badge workflow-status-draft'}>{isPublished ? 'Đã xuất bản' : 'Bản nháp'}</span>
}

export function EmployeeStatusBadge({ isActive }: { isActive: boolean }) {
  return <span className={isActive ? 'status-badge employee-status-active' : 'status-badge employee-status-inactive'}>{isActive ? 'Đang làm việc' : 'Ngừng làm việc'}</span>
}
