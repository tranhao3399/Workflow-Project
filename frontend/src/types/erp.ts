import type { UserRole } from './auth'

export const requestStatuses = [
  'DRAFT',
  'PENDING',
  'NEEDS_CHANGES',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const

export type RequestStatus = (typeof requestStatuses)[number]
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
  | 'approval-inbox'
  | 'form-builder'
  | 'workflow-builder'
  | 'employees'
  | 'organization'
  | 'departments'
  | 'new-department'
  | 'department-detail'
  | 'job-titles'
  | 'new-job-title'
  | 'edit-job-title'
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

export interface NavigationItem {
  key: NavigationKey
  label: string
  roles: UserRole[]
  section: 'workspace' | 'administration'
}
