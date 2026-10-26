import { apiClient } from './api-client'

export interface EmployeeAuditLog {
  _id?: string
  id?: string
  occurredAt: string
  actor: { userId?: string; fullName?: string; employeeCode?: string; rolesAtTime?: string[] }
  action: string
  resource: { type: string; id: string; code?: string }
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> }
}

const relevantActions = new Set([
  'EMPLOYEE.CREATED', 'EMPLOYEE.UPDATED', 'EMPLOYEE.ACTIVATED', 'EMPLOYEE.DEACTIVATED', 'EMPLOYEE.AVATAR_UPDATED',
  'USER.EMPLOYEE_LINKED', 'USER.EMPLOYEE_UNLINKED', 'USER.CREATED', 'USER.UPDATED', 'USER.DEACTIVATED',
])

interface AuditResponse { data: EmployeeAuditLog[] }

export async function getEmployeeAuditLogs(employeeId: string, userId?: string): Promise<EmployeeAuditLog[]> {
  const requests = [apiClient<AuditResponse>(`/audit-logs?resourceType=EMPLOYEE&resourceId=${encodeURIComponent(employeeId)}&page=1&limit=100`)]
  if (userId) requests.push(apiClient<AuditResponse>(`/audit-logs?resourceType=USER&resourceId=${encodeURIComponent(userId)}&page=1&limit=100`))
  try {
    const responses = await Promise.all(requests)
    const seen = new Set<string>()
    return responses.flatMap((response) => response.data).filter((event) => relevantActions.has(event.action) && !seen.has(event._id ?? event.id ?? `${event.occurredAt}-${event.action}`) && Boolean(seen.add(event._id ?? event.id ?? `${event.occurredAt}-${event.action}`))).sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
  } catch {
    return []
  }
}
