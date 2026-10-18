import type {
  PaginatedResponse,
  WorkflowBuilderReferenceData,
  WorkflowDefinition,
  WorkflowDefinitionFilter,
  WorkflowGraphValidationResult,
} from '../types/workflow'
import { apiClient, type ApiDataResponse } from './api-client'
import { withQuery } from './query-params'

export interface CreateWorkflowDefinitionInput {
  code: string
  name: string
  description?: string
  formDefinitionId: string
  bpmnXml: string
}

export interface UpdateWorkflowDefinitionInput {
  expectedRevision: number
  name?: string
  description?: string
  bpmnXml?: string
}

export interface CloneWorkflowDefinitionInput {
  name?: string
  description?: string
  formDefinitionId?: string
}

export function listWorkflowDefinitions(filter: WorkflowDefinitionFilter = {}): Promise<PaginatedResponse<WorkflowDefinition>> {
  return apiClient(withQuery('/workflow-definitions', filter))
}

export async function getWorkflowDefinition(id: string): Promise<WorkflowDefinition> {
  return (await apiClient<ApiDataResponse<WorkflowDefinition>>(`/workflow-definitions/${encodeURIComponent(id)}`)).data
}

export function getWorkflowBuilderReferenceData(): Promise<WorkflowBuilderReferenceData> {
  return apiClient('/workflow-definitions/reference-data')
}

export async function createWorkflowDefinition(input: CreateWorkflowDefinitionInput): Promise<WorkflowDefinition> {
  return (await apiClient<ApiDataResponse<WorkflowDefinition>>('/workflow-definitions', { method: 'POST', body: JSON.stringify(input) })).data
}

export async function updateWorkflowDefinition(id: string, input: UpdateWorkflowDefinitionInput): Promise<WorkflowDefinition> {
  return (await apiClient<ApiDataResponse<WorkflowDefinition>>(`/workflow-definitions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })).data
}

export async function validateWorkflowDefinition(id: string, bpmnXml?: string): Promise<WorkflowGraphValidationResult> {
  return (await apiClient<ApiDataResponse<WorkflowGraphValidationResult>>(`/workflow-definitions/${encodeURIComponent(id)}/validate`, {
    method: 'POST',
    ...(bpmnXml === undefined ? {} : { body: JSON.stringify({ bpmnXml }) }),
  })).data
}

export async function cloneWorkflowDefinition(id: string, input: CloneWorkflowDefinitionInput = {}): Promise<WorkflowDefinition> {
  return (await apiClient<ApiDataResponse<WorkflowDefinition>>(`/workflow-definitions/${encodeURIComponent(id)}/clone`, { method: 'POST', body: JSON.stringify(input) })).data
}

export async function deleteWorkflowDefinition(id: string): Promise<{ id: string }> {
  return (await apiClient<ApiDataResponse<{ id: string }>>(`/workflow-definitions/${encodeURIComponent(id)}`, { method: 'DELETE' })).data
}
