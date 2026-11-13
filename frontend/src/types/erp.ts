import type { RequestStatus } from './workflow'
export { requestStatuses } from './workflow'
export type { RequestStatus } from './workflow'

export type DashboardView = 'MY_WORK' | 'HR' | 'SYSTEM'

export interface DashboardRequest {
  id: string
  requestNo: string
  title: string
  requester: string
  department: string
  status: RequestStatus
  submittedAt?: string
  updatedAt: string
}

export interface DashboardApprovalTask {
  id: string
  requestId: string
  requestNo: string
  title: string
  requester: string
  department: string
  stepName: string
  assignedAt: string
  dueAt?: string
  isOverdue: boolean
}

export interface DashboardMetric {
  key: string
  label: string
  value: number
  description: string
  tone: 'neutral' | 'warning' | 'success' | 'danger'
  target?: NavigationKey
}

export interface DashboardEmployee {
  id: string
  employeeCode: string
  fullName: string
  department: string
  position: string
  employmentType?: string
  isActive?: boolean
  hiredAt?: string
}

export interface DashboardQuickForm {
  id: string
  code: string
  name: string
  category?: string
}

export interface DashboardSecurityEvent {
  id: string
  action: string
  description: string
  actor: string
  outcome: string
  occurredAt: string
  ipAddress?: string
}

export interface DashboardWorkspaceModule {
  key: string
  name: string
  isEnabled: boolean
  group: string
}

export interface DashboardAnalytics {
  key: string
  label: string
  items: Array<{ key: string; label: string; value: number }>
}

export interface DashboardData {
  profile: {
    fullName: string
    position?: string
    department?: string
    employeeCode?: string
  }
  availableViews: DashboardView[]
  activeView: DashboardView
  canCreateRequest: boolean
  scopeLabel: string
  metrics: DashboardMetric[]
  recentRequests: DashboardRequest[]
  approvalQueue: DashboardApprovalTask[]
  quickForms: DashboardQuickForm[]
  directReports: DashboardEmployee[]
  recentEmployees: DashboardEmployee[]
  securityEvents: DashboardSecurityEvent[]
  workspaceModules: DashboardWorkspaceModule[]
  analytics: DashboardAnalytics[]
}

export type NavigationKey =
  | 'overview'
  | 'my-requests'
  | 'new-request'
  | 'request-detail'
  | 'approval-inbox'
  | 'notifications'
  | 'form-builder'
  | 'new-form-definition'
  | 'form-definition-detail'
  | 'workflow-builder'
  | 'new-workflow-definition'
  | 'workflow-definition-detail'
  | 'employees'
  | 'departments'
  | 'new-department'
  | 'department-detail'
  | 'job-titles'
  | 'new-job-title'
  | 'job-title-detail'
  | 'new-employee'
  | 'employee-detail'
  | 'users'
  | 'new-user'
  | 'user-detail'
  | 'permissions'
  | 'new-role'
  | 'role-detail'
  | 'audit-logs'
  | 'workspace-modules'
  | 'my-account'

export interface NavigationItem {
  key: NavigationKey
  label: string
  section: 'workspace' | 'administration'
}
