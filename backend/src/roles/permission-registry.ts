export type PermissionMatrixColumn = 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SPECIAL';

export interface PermissionDefinition {
  key: string;
  module: string;
  moduleLabel: string;
  label: string;
  matrixColumn: PermissionMatrixColumn;
  displayOrder: number;
}

export const PERMISSION_REGISTRY = [
  { key: 'DASHBOARD.VIEW', module: 'DASHBOARD', moduleLabel: 'Tổng quan', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'NOTIFICATION.VIEW', module: 'NOTIFICATION', moduleLabel: 'Thông báo', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'NOTIFICATION.CREATE', module: 'NOTIFICATION', moduleLabel: 'Thông báo', label: 'Tạo thông báo', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'USER.VIEW', module: 'USER', moduleLabel: 'Tài khoản người dùng', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'USER.CREATE', module: 'USER', moduleLabel: 'Tài khoản người dùng', label: 'Tạo tài khoản', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'USER.UPDATE', module: 'USER', moduleLabel: 'Tài khoản người dùng', label: 'Chỉnh sửa', matrixColumn: 'UPDATE', displayOrder: 30 },
  { key: 'USER.CHANGE_STATUS', module: 'USER', moduleLabel: 'Tài khoản người dùng', label: 'Đổi trạng thái', matrixColumn: 'SPECIAL', displayOrder: 50 },
  { key: 'USER.RESET_PASSWORD', module: 'USER', moduleLabel: 'Tài khoản người dùng', label: 'Đặt lại mật khẩu', matrixColumn: 'SPECIAL', displayOrder: 60 },
  { key: 'USER.LINK_EMPLOYEE', module: 'USER', moduleLabel: 'Tài khoản người dùng', label: 'Liên kết nhân viên', matrixColumn: 'SPECIAL', displayOrder: 70 },
  { key: 'USER.MANAGE_ROLES', module: 'USER', moduleLabel: 'Tài khoản người dùng', label: 'Quản lý vai trò', matrixColumn: 'SPECIAL', displayOrder: 80 },
  { key: 'EMPLOYEE.VIEW', module: 'EMPLOYEE', moduleLabel: 'Nhân viên', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'EMPLOYEE.CREATE', module: 'EMPLOYEE', moduleLabel: 'Nhân viên', label: 'Tạo', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'EMPLOYEE.UPDATE', module: 'EMPLOYEE', moduleLabel: 'Nhân viên', label: 'Chỉnh sửa', matrixColumn: 'UPDATE', displayOrder: 30 },
  { key: 'EMPLOYEE.CHANGE_STATUS', module: 'EMPLOYEE', moduleLabel: 'Nhân viên', label: 'Đổi trạng thái', matrixColumn: 'SPECIAL', displayOrder: 50 },
  { key: 'EMPLOYEE.UPLOAD_AVATAR', module: 'EMPLOYEE', moduleLabel: 'Nhân viên', label: 'Cập nhật ảnh đại diện', matrixColumn: 'SPECIAL', displayOrder: 60 },
  { key: 'DEPARTMENT.VIEW', module: 'DEPARTMENT', moduleLabel: 'Phòng ban', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'DEPARTMENT.CREATE', module: 'DEPARTMENT', moduleLabel: 'Phòng ban', label: 'Tạo', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'DEPARTMENT.UPDATE', module: 'DEPARTMENT', moduleLabel: 'Phòng ban', label: 'Chỉnh sửa', matrixColumn: 'UPDATE', displayOrder: 30 },
  { key: 'DEPARTMENT.DELETE', module: 'DEPARTMENT', moduleLabel: 'Phòng ban', label: 'Xóa', matrixColumn: 'DELETE', displayOrder: 40 },
  { key: 'DEPARTMENT.MANAGE_POSITIONS', module: 'DEPARTMENT', moduleLabel: 'Phòng ban', label: 'Quản lý vị trí', matrixColumn: 'SPECIAL', displayOrder: 50 },
  { key: 'JOB_TITLE.VIEW', module: 'JOB_TITLE', moduleLabel: 'Chức danh', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'JOB_TITLE.CREATE', module: 'JOB_TITLE', moduleLabel: 'Chức danh', label: 'Tạo', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'JOB_TITLE.UPDATE', module: 'JOB_TITLE', moduleLabel: 'Chức danh', label: 'Chỉnh sửa', matrixColumn: 'UPDATE', displayOrder: 30 },
  { key: 'JOB_TITLE.DELETE', module: 'JOB_TITLE', moduleLabel: 'Chức danh', label: 'Xóa', matrixColumn: 'DELETE', displayOrder: 40 },
  { key: 'JOB_TITLE.CHANGE_STATUS', module: 'JOB_TITLE', moduleLabel: 'Chức danh', label: 'Đổi trạng thái', matrixColumn: 'SPECIAL', displayOrder: 50 },
  { key: 'POSITION.VIEW', module: 'POSITION', moduleLabel: 'Vị trí', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'POSITION.CREATE', module: 'POSITION', moduleLabel: 'Vị trí', label: 'Tạo', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'POSITION.UPDATE', module: 'POSITION', moduleLabel: 'Vị trí', label: 'Chỉnh sửa', matrixColumn: 'UPDATE', displayOrder: 30 },
  { key: 'REQUESTS.VIEW_OWN', module: 'REQUESTS', moduleLabel: 'Phiếu của tôi', label: 'Xem phiếu của mình', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'REQUESTS.CREATE', module: 'REQUESTS', moduleLabel: 'Phiếu của tôi', label: 'Tạo phiếu', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'REQUESTS.UPDATE_OWN_DRAFT', module: 'REQUESTS', moduleLabel: 'Phiếu của tôi', label: 'Sửa bản nháp của mình', matrixColumn: 'UPDATE', displayOrder: 30 },
  { key: 'REQUESTS.DELETE_OWN_DRAFT', module: 'REQUESTS', moduleLabel: 'Phiếu của tôi', label: 'Xóa bản nháp của mình', matrixColumn: 'DELETE', displayOrder: 40 },
  { key: 'REQUESTS.SUBMIT', module: 'REQUESTS', moduleLabel: 'Phiếu của tôi', label: 'Gửi phiếu', matrixColumn: 'SPECIAL', displayOrder: 50 },
  { key: 'REQUESTS.CANCEL_OWN', module: 'REQUESTS', moduleLabel: 'Phiếu của tôi', label: 'Hủy phiếu của mình', matrixColumn: 'SPECIAL', displayOrder: 60 },
  { key: 'REQUESTS.VIEW_ALL', module: 'REQUESTS', moduleLabel: 'Phiếu của tôi', label: 'Xem tất cả phiếu', matrixColumn: 'SPECIAL', displayOrder: 70 },
  { key: 'REQUESTS.VOID', module: 'REQUESTS', moduleLabel: 'Phiếu của tôi', label: 'Vô hiệu hóa phiếu', matrixColumn: 'SPECIAL', displayOrder: 80 },
  { key: 'FORM_BUILDER.VIEW', module: 'FORM_BUILDER', moduleLabel: 'Form Builder', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'FORM_BUILDER.CREATE', module: 'FORM_BUILDER', moduleLabel: 'Form Builder', label: 'Tạo biểu mẫu', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'FORM_BUILDER.UPDATE', module: 'FORM_BUILDER', moduleLabel: 'Form Builder', label: 'Chỉnh sửa', matrixColumn: 'UPDATE', displayOrder: 30 },
  { key: 'FORM_BUILDER.DELETE_DRAFT', module: 'FORM_BUILDER', moduleLabel: 'Form Builder', label: 'Xóa bản nháp', matrixColumn: 'DELETE', displayOrder: 40 },
  { key: 'FORM_BUILDER.PUBLISH', module: 'FORM_BUILDER', moduleLabel: 'Form Builder', label: 'Xuất bản', matrixColumn: 'SPECIAL', displayOrder: 50 },
  { key: 'FORM_BUILDER.CHANGE_STATUS', module: 'FORM_BUILDER', moduleLabel: 'Form Builder', label: 'Đổi trạng thái', matrixColumn: 'SPECIAL', displayOrder: 60 },
  { key: 'WORKFLOW_BUILDER.VIEW', module: 'WORKFLOW_BUILDER', moduleLabel: 'Workflow Builder', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'WORKFLOW_BUILDER.CREATE', module: 'WORKFLOW_BUILDER', moduleLabel: 'Workflow Builder', label: 'Tạo quy trình', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'WORKFLOW_BUILDER.UPDATE', module: 'WORKFLOW_BUILDER', moduleLabel: 'Workflow Builder', label: 'Chỉnh sửa', matrixColumn: 'UPDATE', displayOrder: 30 },
  { key: 'WORKFLOW_BUILDER.DELETE_DRAFT', module: 'WORKFLOW_BUILDER', moduleLabel: 'Workflow Builder', label: 'Xóa bản nháp', matrixColumn: 'DELETE', displayOrder: 40 },
  { key: 'WORKFLOW_BUILDER.PUBLISH', module: 'WORKFLOW_BUILDER', moduleLabel: 'Workflow Builder', label: 'Xuất bản', matrixColumn: 'SPECIAL', displayOrder: 50 },
  { key: 'WORKFLOW_BUILDER.CHANGE_STATUS', module: 'WORKFLOW_BUILDER', moduleLabel: 'Workflow Builder', label: 'Đổi trạng thái', matrixColumn: 'SPECIAL', displayOrder: 60 },
  { key: 'APPROVALS.VIEW_ASSIGNED', module: 'APPROVALS', moduleLabel: 'Chờ phê duyệt', label: 'Xem phiếu được giao', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'APPROVALS.APPROVE_ASSIGNED', module: 'APPROVALS', moduleLabel: 'Chờ phê duyệt', label: 'Phê duyệt, từ chối hoặc yêu cầu chỉnh sửa', matrixColumn: 'SPECIAL', displayOrder: 50 },
  { key: 'APPROVALS.REASSIGN', module: 'APPROVALS', moduleLabel: 'Chờ phê duyệt', label: 'Chuyển người phê duyệt', matrixColumn: 'SPECIAL', displayOrder: 60 },
  { key: 'ROLE.VIEW', module: 'ROLE', moduleLabel: 'Vai trò & phân quyền', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'ROLE.CREATE', module: 'ROLE', moduleLabel: 'Vai trò & phân quyền', label: 'Tạo', matrixColumn: 'CREATE', displayOrder: 20 },
  { key: 'ROLE.UPDATE', module: 'ROLE', moduleLabel: 'Vai trò & phân quyền', label: 'Chỉnh sửa', matrixColumn: 'UPDATE', displayOrder: 30 },
  { key: 'ROLE.DELETE', module: 'ROLE', moduleLabel: 'Vai trò & phân quyền', label: 'Xóa', matrixColumn: 'DELETE', displayOrder: 40 },
  { key: 'ROLE.MANAGE_PERMISSIONS', module: 'ROLE', moduleLabel: 'Vai trò & phân quyền', label: 'Quản lý quyền', matrixColumn: 'SPECIAL', displayOrder: 50 },
  { key: 'ROLE.CHANGE_STATUS', module: 'ROLE', moduleLabel: 'Vai trò & phân quyền', label: 'Đổi trạng thái', matrixColumn: 'SPECIAL', displayOrder: 60 },
  { key: 'AUDIT_LOG.VIEW', module: 'AUDIT_LOG', moduleLabel: 'Nhật ký hệ thống', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'WORKSPACE_MODULE.VIEW', module: 'WORKSPACE_MODULE', moduleLabel: 'Không gian làm việc', label: 'Xem', matrixColumn: 'VIEW', displayOrder: 10 },
  { key: 'WORKSPACE_MODULE.UPDATE', module: 'WORKSPACE_MODULE', moduleLabel: 'Không gian làm việc', label: 'Chỉnh sửa', matrixColumn: 'UPDATE', displayOrder: 30 },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSION_REGISTRY)[number]['key'];
export const PERMISSION_KEYS = new Set<string>(PERMISSION_REGISTRY.map((permission) => permission.key));
export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_REGISTRY.map((permission) => permission.key);
