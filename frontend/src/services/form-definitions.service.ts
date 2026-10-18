import type {
  FormDefinition,
  FormDefinitionFilter,
  DynamicFormValidationResult,
  FormField,
  FormSettings,
  PaginatedResponse,
} from '../types/workflow'
import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'
import { withQuery } from './query-params'

export interface CreateFormDefinitionInput {
  code: string
  name: string
  description?: string
  fields: FormField[]
  settings?: FormSettings
}

export interface UpdateFormDefinitionInput {
  name?: string
  description?: string
  fields?: FormField[]
  settings?: FormSettings
}

export interface CloneFormDefinitionInput {
  name?: string
  description?: string
}

export function listFormDefinitions(filter: FormDefinitionFilter = {}): Promise<PaginatedResponse<FormDefinition>> {
  return apiClient(withQuery('/form-definitions', filter))
}

export async function getFormDefinition(id: string): Promise<FormDefinition> {
  return (await apiClient<ApiDataResponse<FormDefinition>>(`/form-definitions/${encodeURIComponent(id)}`)).data
}

export async function createFormDefinition(input: CreateFormDefinitionInput): Promise<FormDefinition> {
  return (await apiClient<ApiDataResponse<FormDefinition>>('/form-definitions', {
    method: 'POST',
    body: JSON.stringify(input),
  })).data
}

export async function updateFormDefinition(id: string, input: UpdateFormDefinitionInput): Promise<FormDefinition> {
  return (await apiClient<ApiDataResponse<FormDefinition>>(`/form-definitions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })).data
}

export async function validateDynamicForm(id: string, formData: Record<string, unknown>): Promise<DynamicFormValidationResult> {
  return (await apiClient<ApiDataResponse<DynamicFormValidationResult>>(`/form-definitions/${encodeURIComponent(id)}/validate`, {
    method: 'POST',
    body: JSON.stringify({ formData }),
  })).data
}

export async function cloneFormDefinition(id: string, input: CloneFormDefinitionInput = {}): Promise<FormDefinition> {
  return (await apiClient<ApiDataResponse<FormDefinition>>(`/form-definitions/${encodeURIComponent(id)}/clone`, {
    method: 'POST',
    body: JSON.stringify(input),
  })).data
}

export async function deleteFormDefinition(id: string): Promise<{ id: string }> {
  return (await apiClient<ApiDataResponse<{ id: string }>>(`/form-definitions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })).data
}
