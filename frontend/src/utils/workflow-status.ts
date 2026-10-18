import type {
  ApprovalTaskStatus,
  DefinitionStatus,
  FileScanStatus,
  FileStatus,
  RequestStatus,
} from '../types/workflow'

export type WorkflowEntityStatus = DefinitionStatus | RequestStatus | ApprovalTaskStatus | FileStatus | FileScanStatus

const labels: Record<WorkflowEntityStatus, string> = {
  DRAFT: 'Nháp',
  PUBLISHED: 'Đã xuất bản',
  INACTIVE: 'Ngưng hoạt động',
  ARCHIVED: 'Đã lưu trữ',
  IN_PROGRESS: 'Đang xử lý',
  REVISION_REQUESTED: 'Yêu cầu bổ sung',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  VOIDED: 'Đã vô hiệu hóa',
  PENDING: 'Đang chờ',
  SKIPPED: 'Đã bỏ qua',
  EXPIRED: 'Quá hạn',
  TEMPORARY: 'Tạm thời',
  ATTACHED: 'Đã đính kèm',
  DELETED: 'Đã xóa',
  CLEAN: 'An toàn',
  INFECTED: 'Phát hiện nguy cơ',
  FAILED: 'Kiểm tra thất bại',
}

export function workflowStatusLabel(status: WorkflowEntityStatus): string {
  return labels[status]
}

export function workflowStatusClass(status: WorkflowEntityStatus): string {
  return `status-${status.toLowerCase()}`
}
