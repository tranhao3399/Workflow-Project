export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILED'
export type AuditModuleFilter = 'AUTH_ACCOUNT' | 'EMPLOYEE' | 'ORGANIZATION' | 'JOB_TITLE' | 'WORKSPACE' | 'WORKFLOW_FORM'
export type AuditActionGroup = 'LOGIN_LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVAL'

export interface AuditLogActor {
  userId?: string
  fullName?: string
  employeeCode?: string
  email?: string
  rolesAtTime?: string[]
}

export interface AuditActorOption {
  id: string
  fullName?: string
  employeeCode?: string
  email?: string
}

export interface AuditLogResource {
  type: string
  id?: string
  code?: string
  name?: string
}

export interface AuditLogRecord {
  _id: string
  occurredAt: string
  requestId: string
  actor: AuditLogActor
  action: string
  description: string
  resource: AuditLogResource
  outcome: AuditOutcome
  changes?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
  }
  context?: {
    ipAddress?: string
    userAgent?: string
    method?: string
    path?: string
  }
}

export interface AuditLogQuery {
  search?: string
  actorId?: string
  actorType?: 'SYSTEM'
  resourceType?: string
  module?: AuditModuleFilter | ''
  actionGroup?: AuditActionGroup | ''
  outcome?: AuditOutcome
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

export interface AuditLogPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}
