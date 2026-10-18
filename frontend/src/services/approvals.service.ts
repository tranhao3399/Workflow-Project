import type { ApprovalTask, ApprovalTaskFilter, PaginatedResponse } from '../types/workflow'
import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'
import { withQuery } from './query-params'

export function listApprovalInbox(filter: ApprovalTaskFilter = {}): Promise<PaginatedResponse<ApprovalTask>> {
  return apiClient(withQuery('/approvals/inbox', filter))
}

export async function getApprovalTask(id: string): Promise<ApprovalTask> {
  return (await apiClient<ApiDataResponse<ApprovalTask>>(`/approvals/tasks/${encodeURIComponent(id)}`)).data
}

async function decideApprovalTask(
  id: string,
  action: 'approve' | 'reject' | 'request-revision',
  comment?: string,
): Promise<ApprovalTask> {
  return (await apiClient<ApiDataResponse<ApprovalTask>>(`/approvals/tasks/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    body: JSON.stringify(comment === undefined ? {} : { comment }),
  })).data
}

export const approveTask = (id: string, comment?: string) => decideApprovalTask(id, 'approve', comment)
export const rejectTask = (id: string, comment: string) => decideApprovalTask(id, 'reject', comment)
export const requestTaskRevision = (id: string, comment: string) => decideApprovalTask(id, 'request-revision', comment)

export async function reassignApprovalTask(id: string, newAssigneeUserId: string, reason: string): Promise<ApprovalTask> {
  return (await apiClient<ApiDataResponse<ApprovalTask>>(`/approvals/tasks/${encodeURIComponent(id)}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ newAssigneeUserId, reason }),
  })).data
}
