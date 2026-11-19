export interface AuditActorDisplay {
  userId?: string
  fullName?: string
  employeeCode?: string
  rolesAtTime?: string[]
}

export interface AuditChangesDisplay {
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export interface AuditFieldDisplay {
  key: string
  label: string
  format?: (value: unknown) => string
}

export interface AuditSentenceInput {
  action: string
  resourceType: string
  resourceName: string
  actor?: AuditActorDisplay
  actorLabel?: string
  currentUserId?: string
}

const auditActionPhrases: Record<string, string> = {
  'AUTH.PASSWORD_RESET_SUCCEEDED': 'đã đặt lại mật khẩu của',
  'DEPARTMENT.POSITIONS_ADDED': 'đã gán chức danh cho',
  'DEPARTMENT.POSITION_ASSIGNED': 'đã gán chức danh cho',
  'DEPARTMENT.POSITIONS_ASSIGNED': 'đã gán chức danh cho',
  'DEPARTMENT.POSITIONS_APPLIED': 'đã gán chức danh cho',
  'DEPARTMENT.POSITIONS_DELETED': 'đã gỡ chức danh khỏi',
  'DEPARTMENT.POSITION_DELETED': 'đã gỡ chức danh khỏi',
  'DEPARTMENT.POSITION_REMOVED': 'đã gỡ chức danh khỏi',
  'EMPLOYEE.AVATAR_UPDATED': 'đã cập nhật ảnh đại diện của',
  'EMPLOYEE.AVATAR_REMOVED': 'đã xóa ảnh đại diện của',
  'ROLE.PERMISSIONS_UPDATED': 'đã cập nhật phân quyền của',
  'ROLE.STATUS_CHANGED': 'đã thay đổi trạng thái',
  'USER.PASSWORD_CHANGED': 'đã thay đổi mật khẩu của',
  'USER.STATUS_CHANGED': 'đã thay đổi trạng thái',
  'USER.EMPLOYEE_LINKED': 'đã liên kết hồ sơ nhân viên với',
  'USER.EMPLOYEE_UNLINKED': 'đã gỡ liên kết hồ sơ nhân viên khỏi',
  'USER.ROLES_ADDED': 'đã thêm vai trò cho',
  'USER.ROLES_REMOVED': 'đã gỡ vai trò khỏi',
  CREATED: 'đã tạo',
  UPDATED: 'đã cập nhật',
  DELETED: 'đã xóa',
  ACTIVATED: 'đã kích hoạt',
  DEACTIVATED: 'đã ngưng hoạt động',
  SUBMITTED: 'đã gửi',
  ASSIGNED: 'đã giao phê duyệt cho',
  CONDITION_EVALUATED: 'đã đánh giá điều kiện của',
  ACTION_EXECUTED: 'đã thực thi bước tự động trên',
  APPROVED: 'đã phê duyệt',
  REJECTED: 'đã từ chối',
  REVISION_REQUESTED: 'đã yêu cầu bổ sung',
  REASSIGNED: 'đã chuyển người phê duyệt của',
  RESUBMITTED: 'đã gửi lại',
  CANCELLED: 'đã hủy',
  VOIDED: 'đã vô hiệu hóa',
  COMMENTED: 'đã bình luận trên',
  'REQUEST.COMMENTED': 'đã bình luận trên',
  AUTO_SKIPPED: 'đã tự động bỏ qua bước của',
  COMPLETED: 'đã hoàn tất quy trình của',
  CLONED: 'đã tạo phiên bản mới từ',
  DUPLICATED: 'đã tạo bản sao của',
  GROUP_CHANGED: 'đã chuyển nhóm cho',
  STATUS_CHANGED: 'đã thay đổi trạng thái',
  PASSWORD_CHANGED: 'đã thay đổi mật khẩu của',
  PASSWORD_RESET_SUCCEEDED: 'đã đặt lại mật khẩu của',
  EMPLOYEE_LINKED: 'đã liên kết hồ sơ nhân viên với',
  EMPLOYEE_UNLINKED: 'đã gỡ liên kết hồ sơ nhân viên khỏi',
  ROLES_ADDED: 'đã thêm vai trò cho',
  ROLES_REMOVED: 'đã gỡ vai trò khỏi',
  AVATAR_UPDATED: 'đã cập nhật ảnh đại diện của',
  AVATAR_REMOVED: 'đã xóa ảnh đại diện của',
}

const auditResourceLabels: Record<string, string> = {
  APPROVAL_TASK: 'nhiệm vụ phê duyệt',
  AUTH_SESSION: 'phiên đăng nhập',
  DEPARTMENT: 'phòng ban',
  EMPLOYEE: 'nhân viên',
  FILE: 'tệp',
  FORM_DEFINITION: 'biểu mẫu',
  FORM_GROUP: 'nhóm biểu mẫu',
  NOTIFICATION: 'thông báo',
  POSITION: 'chức danh',
  REQUEST: 'phiếu',
  ROLE: 'vai trò',
  USER: 'tài khoản',
  USER_SESSION: 'phiên đăng nhập',
  WORKFLOW_DEFINITION: 'workflow',
  WORKSPACE_MODULE: 'phân hệ',
}

const auditModuleLabels: Record<string, string> = {
  APPROVAL_TASK: 'Quy trình & Biểu mẫu',
  AUTH_SESSION: 'Xác thực & Tài khoản',
  DEPARTMENT: 'Cơ cấu tổ chức',
  EMPLOYEE: 'Nhân viên',
  FILE: 'Quy trình & Biểu mẫu',
  FORM_DEFINITION: 'Quy trình & Biểu mẫu',
  FORM_GROUP: 'Quy trình & Biểu mẫu',
  NOTIFICATION: 'Thông báo',
  POSITION: 'Chức danh',
  REQUEST: 'Quy trình & Biểu mẫu',
  ROLE: 'Xác thực & Tài khoản',
  USER: 'Xác thực & Tài khoản',
  USER_SESSION: 'Xác thực & Tài khoản',
  WORKFLOW_DEFINITION: 'Quy trình & Biểu mẫu',
  WORKSPACE_MODULE: 'Không gian làm việc',
}

const workspaceModuleLabels: Record<string, string> = {
  APPROVAL_INBOX: 'Hộp thư phê duyệt',
  AUDIT_LOGS: 'Nhật ký hệ thống',
  DASHBOARD: 'Tổng quan',
  DEPARTMENTS: 'Cơ cấu tổ chức',
  EMPLOYEES: 'Nhân viên',
  FORM_BUILDER: 'Trình tạo biểu mẫu',
  JOB_TITLES: 'Chức danh',
  NOTIFICATIONS: 'Thông báo',
  REQUESTS: 'Phiếu yêu cầu',
  ROLES: 'Vai trò & phân quyền',
  USERS: 'Tài khoản người dùng',
  WORKFLOW_BUILDER: 'Thiết lập quy trình',
  WORKSPACE_MODULES: 'Không gian làm việc',
}

export function auditObjectName(resourceType: string, value: string): string {
  if (resourceType.trim().toUpperCase() !== 'WORKSPACE_MODULE') return value
  return value.replace(/[A-Z][A-Z0-9_]*/g, (code) => workspaceModuleLabels[code] ?? code)
}

export function auditResourceLabel(resourceType: string): string {
  const normalized = resourceType.trim().toUpperCase()
  return auditResourceLabels[normalized]
    ?? (normalized.toLocaleLowerCase('vi-VN') || 'đối tượng')
}

export function auditModuleLabel(action: string, resourceType: string): string {
  const normalizedAction = action.trim().toUpperCase()
  if (/^(AUTH\.|USER\.(LOGIN|LOGOUT|SESSION|PASSWORD))/.test(normalizedAction)) return 'Xác thực & Tài khoản'
  return auditModuleLabels[resourceType.trim().toUpperCase()] ?? 'Hệ thống'
}

export function auditActorLabel(actor: AuditActorDisplay, currentUserId: string): string {
  if (actor.userId && actor.userId === currentUserId) return 'Bạn'
  if (actor.fullName) return actor.employeeCode ? `${actor.fullName} (${actor.employeeCode})` : actor.fullName
  return actor.rolesAtTime?.includes('ADMIN')
    ? 'Quản trị viên'
    : actor.userId
      ? 'Người dùng hệ thống'
      : 'Hệ thống'
}

export function formatAuditSentence({
  action,
  resourceType,
  resourceName,
  actor,
  actorLabel,
  currentUserId = '',
}: AuditSentenceInput): string {
  const normalizedAction = action.trim().toUpperCase()
  const operation = normalizedAction.split('.').at(-1) ?? normalizedAction
  const phrase = auditActionPhrases[normalizedAction]
    ?? auditActionPhrases[operation]
    ?? 'đã thực hiện thao tác với'
  const performer = actorLabel?.trim()
    || (actor ? auditActorLabel(actor, currentUserId) : 'Hệ thống')
  if (normalizedAction === 'USER.LOGIN_SUCCEEDED') return `${performer} đã đăng nhập vào hệ thống.`
  if (normalizedAction === 'USER.LOGOUT') return `${performer} đã đăng xuất khỏi hệ thống.`
  if (normalizedAction === 'USER.LOGIN_FAILED') {
    return actor?.fullName
      ? `${performer} đã đăng nhập thất bại.`
      : 'Phát hiện nỗ lực đăng nhập thất bại.'
  }
  if (normalizedAction === 'USER.LOGIN_LOCKED') return `Tài khoản của ${performer} đã bị khóa tạm thời do đăng nhập thất bại nhiều lần.`
  if (normalizedAction === 'USER.SESSION_REVOKED') return `Hệ thống đã thu hồi phiên đăng nhập của ${performer}.`
  if (normalizedAction === 'USER.SESSION_EXPIRED') return `Phiên đăng nhập của ${performer} đã hết hạn.`

  const objectName = resourceName.trim()
  const isTechnicalIdentifier = !objectName
    || objectName.toLowerCase() === 'unknown'
    || /^[a-f\d]{24}$/i.test(objectName)
    || /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(objectName)
    || (/^[A-Za-z0-9_-]+$/.test(objectName) && objectName.length > 32)
  const objectLabel = auditResourceLabel(resourceType)
  return isTechnicalIdentifier
    ? `${performer} ${phrase} ${objectLabel}.`
    : `${performer} ${phrase} ${objectLabel} "${objectName.replaceAll('"', "'")}".`
}

export function auditValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Chưa cập nhật'
  if (typeof value === 'string') return `“${value}”`
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  return 'Đã cập nhật'
}

export function auditChangeDetails(changes: AuditChangesDisplay | undefined, fields: AuditFieldDisplay[]): string[] {
  if (!changes?.before || !changes.after) return []
  return fields.flatMap((field) => {
    const before = changes.before?.[field.key]
    const after = changes.after?.[field.key]
    if (Object.is(before, after)) return []
    const format = field.format ?? auditValue
    return [`${field.label}: ${format(before)} → ${format(after)}`]
  })
}
