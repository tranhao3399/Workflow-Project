import type {
  ApprovalHistory,
  AvailableFormDefinition,
  PaginatedResponse,
  Request as RequestRecord,
  RequestFilter,
  RecreateDraftResult,
  RequestSummary,
} from '../types/workflow'
import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'
import { withQuery } from './query-params'

export interface UpdateRequestInput {
  title?: string
  formData?: Record<string, unknown>
}

export async function getAvailableForms(): Promise<AvailableFormDefinition[]> {
  return (await apiClient<ApiDataResponse<AvailableFormDefinition[]>>('/requests/available-forms')).data
}

export function listOwnRequests(filter: RequestFilter = {}): Promise<PaginatedResponse<RequestSummary>> {
  return apiClient(withQuery('/requests', filter))
}

export function listAllRequests(filter: RequestFilter = {}): Promise<PaginatedResponse<RequestSummary>> {
  return apiClient(withQuery('/requests/all', filter))
}

export async function getRequest(id: string): Promise<RequestRecord> {
  return (await apiClient<ApiDataResponse<RequestRecord>>(`/requests/${encodeURIComponent(id)}`)).data
}

export async function getRequestHistory(id: string): Promise<ApprovalHistory[]> {
  return (await apiClient<ApiDataResponse<ApprovalHistory[]>>(`/requests/${encodeURIComponent(id)}/history`)).data
}

export async function createRequest(formDefinitionId: string): Promise<RequestRecord> {
  return (await apiClient<ApiDataResponse<RequestRecord>>('/requests', {
    method: 'POST',
    body: JSON.stringify({ formDefinitionId }),
  })).data
}

export async function updateRequest(id: string, input: UpdateRequestInput): Promise<RequestRecord> {
  return (await apiClient<ApiDataResponse<RequestRecord>>(`/requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })).data
}

export async function recreateRequestFromDraft(id: string): Promise<RecreateDraftResult> {
  return (await apiClient<ApiDataResponse<RecreateDraftResult>>(`/requests/${encodeURIComponent(id)}/recreate`, {
    method: 'POST',
  })).data
}

async function transitionRequest(id: string, action: 'submit' | 'resubmit'): Promise<RequestRecord> {
  return (await apiClient<ApiDataResponse<RequestRecord>>(`/requests/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
  })).data
}

export const submitRequest = (id: string) => transitionRequest(id, 'submit')
export const resubmitRequest = (id: string) => transitionRequest(id, 'resubmit')

async function closeRequest(id: string, action: 'cancel' | 'void', reason: string): Promise<RequestRecord> {
  return (await apiClient<ApiDataResponse<RequestRecord>>(`/requests/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })).data
}

export const cancelRequest = (id: string, reason: string) => closeRequest(id, 'cancel', reason)
export const voidRequest = (id: string, reason: string) => closeRequest(id, 'void', reason)

export async function deleteRequest(id: string): Promise<{ id: string }> {
  return (await apiClient<ApiDataResponse<{ id: string }>>(`/requests/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })).data
}
