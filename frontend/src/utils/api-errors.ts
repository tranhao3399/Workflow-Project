export const apiErrorCodes = [
  'FORM_NOT_EDITABLE',
  'WORKFLOW_INVALID',
  'NO_APPROVER_FOUND',
  'REQUEST_NOT_EDITABLE',
  'TASK_ALREADY_PROCESSED',
  'FILE_NOT_ALLOWED',
  'FILE_ACCESS_DENIED',
  'CONCURRENT_MODIFICATION',
  'DEFINITION_VERSION_OUTDATED',
] as const

export type ApiErrorCode = (typeof apiErrorCodes)[number]

const errorCodeAliases: Readonly<Record<string, ApiErrorCode>> = {
  FORM_NOT_DRAFT: 'FORM_NOT_EDITABLE',
  FORM_CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
  WORKFLOW_SNAPSHOT_INVALID: 'WORKFLOW_INVALID',
  WORKFLOW_NOT_EDITABLE: 'WORKFLOW_INVALID',
  DEFINITION_PACKAGE_VALIDATION_FAILED: 'WORKFLOW_INVALID',
  PUBLISHED_WORKFLOW_NOT_FOUND: 'WORKFLOW_INVALID',
  NO_APPROVER_FOUND: 'NO_APPROVER_FOUND',
  REQUEST_NOT_EDITABLE: 'REQUEST_NOT_EDITABLE',
  REQUEST_NOT_DRAFT: 'REQUEST_NOT_EDITABLE',
  REQUEST_NOT_REVISION_REQUESTED: 'REQUEST_NOT_EDITABLE',
  REQUEST_NOT_CANCELLABLE: 'REQUEST_NOT_EDITABLE',
  REQUEST_CANCELLATION_DISABLED: 'REQUEST_NOT_EDITABLE',
  REQUEST_NOT_VOIDABLE: 'REQUEST_NOT_EDITABLE',
  REQUEST_DELETE_NOT_ALLOWED: 'REQUEST_NOT_EDITABLE',
  TASK_ALREADY_PROCESSED: 'TASK_ALREADY_PROCESSED',
  FILE_POLICY_VIOLATION: 'FILE_NOT_ALLOWED',
  FILE_COUNT_EXCEEDED: 'FILE_NOT_ALLOWED',
  DUPLICATE_FILE_REFERENCE: 'FILE_NOT_ALLOWED',
  INVALID_FILE_REFERENCE: 'FILE_NOT_ALLOWED',
  FILE_REFERENCE_NOT_AVAILABLE: 'FILE_NOT_ALLOWED',
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
  DEFINITION_VERSION_OUTDATED: 'DEFINITION_VERSION_OUTDATED',
}

const errorMessages: Record<ApiErrorCode, string> = {
  FORM_NOT_EDITABLE: 'Biểu mẫu không còn ở trạng thái cho phép chỉnh sửa.',
  WORKFLOW_INVALID: 'Cấu hình quy trình chưa hợp lệ.',
  NO_APPROVER_FOUND: 'Không tìm thấy người phê duyệt phù hợp.',
  REQUEST_NOT_EDITABLE: 'Phiếu không còn ở trạng thái cho phép chỉnh sửa.',
  TASK_ALREADY_PROCESSED: 'Tác vụ đã được xử lý hoặc vừa thay đổi. Vui lòng tải lại dữ liệu.',
  FILE_NOT_ALLOWED: 'Tệp không đáp ứng điều kiện tải lên của biểu mẫu.',
  FILE_ACCESS_DENIED: 'Bạn không có quyền truy cập tệp này.',
  CONCURRENT_MODIFICATION: 'Dữ liệu vừa được thay đổi ở nơi khác. Vui lòng tải lại.',
  DEFINITION_VERSION_OUTDATED: 'Phiếu nháp đang dùng phiên bản Form–Workflow cũ. Hãy tạo phiếu mới từ phiên bản hiện hành.',
}

export function normalizeApiErrorCode(code?: string): string | undefined {
  if (!code) return undefined
  return errorCodeAliases[code] ?? code
}

export function apiErrorMessage(code: string | undefined, fallback: string): string {
  const normalized = normalizeApiErrorCode(code)
  return normalized && normalized in errorMessages ? errorMessages[normalized as ApiErrorCode] : fallback
}

export function isApiErrorCode(error: unknown, code: ApiErrorCode): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && normalizeApiErrorCode(typeof error.code === 'string' ? error.code : undefined) === code
}
