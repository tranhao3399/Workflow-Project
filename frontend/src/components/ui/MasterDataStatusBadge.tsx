interface ActiveStatusBadgeProps {
  isActive: boolean
}

export function ActiveStatusBadge({ isActive }: ActiveStatusBadgeProps) {
  return <span className={isActive ? 'master-status-badge is-active' : 'master-status-badge is-inactive'}>{isActive ? 'Hoạt động' : 'Ngưng hoạt động'}</span>
}

export const DepartmentStatusBadge = ActiveStatusBadge
export const JobTitleStatusBadge = ActiveStatusBadge

export function ApprovalBadge() {
  return <span className="master-approval-badge">Có quyền phê duyệt</span>
}
