import type { User, UserActivityLog, UserFormValues } from '../types/administration'
import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'
import type { UserRole } from '../types/auth'

interface AuditLogApiRecord {
  _id: string
  occurredAt: string
  action: string
  outcome: 'SUCCESS' | 'FAILED'
  resource: { type: string; code?: string }
  actor: { userId?: string; fullName?: string; employeeCode?: string }
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> }
}

export interface UserRoleOption {
  id: string
  key: UserRole
  name: string
  isActive: boolean
}

export interface UserEmployeeOption {
  id: string
  employeeCode: string
  fullName: string
  department: string
  isActive: boolean
  userId?: string
}

export async function getUsers(): Promise<User[]> {
  return apiClient<{ data: User[] }>('/users?page=1&limit=100').then((response) => response.data)
}

export async function getUserEmployeeOptions(options: { availableOnly?: boolean; includeEmployeeId?: string } = {}): Promise<UserEmployeeOption[]> {
  const query = new URLSearchParams()
  if (options.availableOnly) query.set('availableOnly', 'true')
  if (options.includeEmployeeId) query.set('includeEmployeeId', options.includeEmployeeId)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return apiClient<ApiDataResponse<UserEmployeeOption[]>>(`/users/employee-options${suffix}`).then((response) => response.data)
}

export async function getUserById(userId: string): Promise<User | null> {
  try { return (await apiClient<ApiDataResponse<User>>(`/users/${encodeURIComponent(userId)}`)).data }
  catch (error) { if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) return null; throw error }
}

export async function createUser(values: UserFormValues & { temporaryPassword: string }): Promise<User> {
  const { employeeId, ...payload } = values
  return apiClient<ApiDataResponse<User>>('/users', {
    method: 'POST',
    body: JSON.stringify({ ...payload, ...(employeeId ? { employeeId } : {}) }),
  }).then((response) => response.data)
}

type UpdateUserValues = Omit<UserFormValues, 'roleIds'> & { roleIds?: string[]; newPassword?: string }

export async function updateUser(userId: string, values: UpdateUserValues): Promise<User> {
  return apiClient<ApiDataResponse<User>>(`/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ email: values.email.trim().toLowerCase(), ...(values.roleIds !== undefined ? { roleIds: values.roleIds } : {}), isActive: values.isActive, ...(values.newPassword ? { newPassword: values.newPassword } : {}) }),
  }).then((response) => response.data)
}

export async function linkUserEmployee(userId: string, employeeId: string): Promise<User> {
  return apiClient<ApiDataResponse<User>>(`/users/${encodeURIComponent(userId)}/employee`, { method: 'PATCH', body: JSON.stringify({ employeeId }) }).then((response) => response.data)
}

export async function unlinkUserEmployee(userId: string): Promise<User> {
  return apiClient<ApiDataResponse<User>>(`/users/${encodeURIComponent(userId)}/employee`, { method: 'DELETE' }).then((response) => response.data)
}

export async function getActiveUserRoles(): Promise<UserRoleOption[]> {
  const roles = await apiClient<Array<{ id: string; _id?: string; key: UserRole; name: string; isActive: boolean }>>('/roles?active=true')
  return roles.map((role) => ({ id: role.id ?? role._id ?? '', key: role.key, name: role.name, isActive: role.isActive }))
}

export async function addUserRoles(userId: string, roleIds: string[]): Promise<User> {
  return apiClient<ApiDataResponse<User>>(`/users/${encodeURIComponent(userId)}/roles`, { method: 'POST', body: JSON.stringify({ roleIds }) }).then((response) => response.data)
}

export async function removeUserRoles(userId: string, roleIds: string[]): Promise<User> {
  return apiClient<ApiDataResponse<User>>(`/users/${encodeURIComponent(userId)}/roles`, { method: 'DELETE', body: JSON.stringify({ roleIds }) }).then((response) => response.data)
}

export async function getUserActivity(userId: string): Promise<UserActivityLog[]> {
  const response = await apiClient<{ data: AuditLogApiRecord[] }>(`/audit-logs?resourceType=USER&resourceId=${encodeURIComponent(userId)}&page=1&limit=100`)
  return response.data.map((item) => ({
    id: item._id,
    actorId: item.actor.userId ?? '',
    occurredAt: item.occurredAt,
    action: item.action,
    resourceType: item.resource.type,
    resourceCode: item.resource.code,
    outcome: item.outcome,
    description: item.actor.fullName ?? 'Người dùng hệ thống',
    actorName: item.actor.fullName
      ? item.actor.employeeCode ? `${item.actor.fullName} (${item.actor.employeeCode})` : item.actor.fullName
      : undefined,
    actorEmployeeCode: item.actor.employeeCode,
    changes: item.changes,
  }))
}
