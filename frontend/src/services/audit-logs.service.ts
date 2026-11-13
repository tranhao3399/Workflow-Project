import type { AuditActorOption, AuditLogPagination, AuditLogQuery, AuditLogRecord } from '../types/audit-logs'
import { apiClient } from './api-client'

function dateBoundary(value: string, endOfDay: boolean): string {
  const time = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'
  return new Date(`${value}${time}`).toISOString()
}

export async function listAuditLogs(query: AuditLogQuery = {}): Promise<{
  data: AuditLogRecord[]
  pagination: AuditLogPagination
}> {
  const parameters = new URLSearchParams()
  if (query.search?.trim()) parameters.set('search', query.search.trim())
  if (query.actorId) parameters.set('actorId', query.actorId)
  if (query.actorType) parameters.set('actorType', query.actorType)
  if (query.resourceType) parameters.set('resourceType', query.resourceType)
  if (query.module) parameters.set('module', query.module)
  if (query.actionGroup) parameters.set('actionGroup', query.actionGroup)
  if (query.outcome) parameters.set('outcome', query.outcome)
  if (query.startDate) parameters.set('startDate', dateBoundary(query.startDate, false))
  if (query.endDate) parameters.set('endDate', dateBoundary(query.endDate, true))
  parameters.set('page', String(query.page ?? 1))
  parameters.set('limit', String(query.limit ?? 20))
  return apiClient(`/audit-logs?${parameters.toString()}`)
}

export async function listAuditActorOptions(search = ''): Promise<AuditActorOption[]> {
  const parameters = new URLSearchParams({ limit: '30' })
  if (search.trim()) parameters.set('search', search.trim())
  const response = await apiClient<{ data: AuditActorOption[] }>(`/audit-logs/actor-options?${parameters.toString()}`)
  return response.data
}
