import type { RequestStatus } from '../types/erp'
import type { ApprovalTaskStatus, DefinitionStatus, FileStatus } from '../types/workflow'
import { workflowStatusClass, workflowStatusLabel, type WorkflowEntityStatus } from '../utils/workflow-status'

interface StatusBadgeProps {
  status: RequestStatus
}

export function RequestStatusBadge({ status }: StatusBadgeProps) {
  return <WorkflowEntityStatusBadge status={status} />
}

export const StatusBadge = RequestStatusBadge

export function WorkflowEntityStatusBadge({ status }: { status: WorkflowEntityStatus }) {
  return <span className={`status-badge ${workflowStatusClass(status)}`}>{workflowStatusLabel(status)}</span>
}

export function DefinitionStatusBadge({ status }: { status: DefinitionStatus }) {
  return <WorkflowEntityStatusBadge status={status} />
}

export function ApprovalTaskStatusBadge({ status }: { status: ApprovalTaskStatus }) {
  return <WorkflowEntityStatusBadge status={status} />
}

export function FileStatusBadge({ status }: { status: FileStatus }) {
  return <WorkflowEntityStatusBadge status={status} />
}

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
