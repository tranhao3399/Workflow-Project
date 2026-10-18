import type { UserRole } from './auth'
import type { RequestStatus } from './workflow'
export { requestStatuses } from './workflow'
export type { RequestStatus } from './workflow'
export type DashboardRole = Extract<UserRole, 'EMPLOYEE' | 'MANAGER' | 'ADMIN'>

export interface WorkflowRequest {
  id: string
  code: string
  title: string
  formName: string
  requester: string
  department: string
  status: RequestStatus
  submittedAt: string | null
  updatedAt: string
  amount?: number
}

export interface ApprovalTask {
  id: string
  request: WorkflowRequest
  currentStep: string
  dueAt: string
  ageInHours: number
}

export interface Metric {
  label: string
  value: string
  description: string
  tone: 'neutral' | 'warning' | 'success' | 'danger'
}

export interface DashboardData {
  role: DashboardRole
  greeting: string
  metrics: Metric[]
  requests: WorkflowRequest[]
  approvals: ApprovalTask[]
  activitySummary: Array<{ label: string; value: string; description: string }>
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
  | 'organization'
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
