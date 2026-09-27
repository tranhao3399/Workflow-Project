import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'
import type { CreateRoleInput, PermissionDefinition, RoleAuditLog, RoleRecord, UpdateRoleInput } from '../types/roles'

export function getRolesFromApi(): Promise<RoleRecord[]> {
  return apiClient<RoleRecord[]>('/roles')
}

export function getRoleFromApi(id: string): Promise<RoleRecord> {
  return apiClient<ApiDataResponse<RoleRecord>>(`/roles/${id}`).then((response) => response.data)
}

export function getPermissionRegistryFromApi(): Promise<PermissionDefinition[]> {
  return apiClient<PermissionDefinition[]>('/roles/permission-registry')
}

export function createRoleFromApi(input: CreateRoleInput): Promise<RoleRecord> {
  return apiClient<ApiDataResponse<RoleRecord>>('/roles', { method: 'POST', body: JSON.stringify(input) }).then((response) => response.data)
}

export function updateRoleFromApi(id: string, input: UpdateRoleInput): Promise<RoleRecord> {
  return apiClient<ApiDataResponse<RoleRecord>>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((response) => response.data)
}

export function updateRoleStatusFromApi(id: string, isActive: boolean): Promise<RoleRecord> {
  return apiClient<ApiDataResponse<RoleRecord>>(`/roles/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }).then((response) => response.data)
}

interface AuditLogResponse {
  data: Array<{ _id: string; action: string; occurredAt: string; actor: { fullName?: string } }>
  pagination: { totalPages: number }
}

export async function getRoleAuditLogs(roleId: string, page = 1): Promise<{ items: RoleAuditLog[]; hasMore: boolean }> {
  const response = await apiClient<AuditLogResponse>(`/audit-logs?resourceType=ROLE&resourceId=${encodeURIComponent(roleId)}&page=${page}&limit=10`)
  return {
    items: response.data.map((item) => ({ id: item._id, actorName: item.actor.fullName ?? 'Người dùng hệ thống', action: item.action, occurredAt: item.occurredAt })),
    hasMore: page < response.pagination.totalPages,
  }
}
