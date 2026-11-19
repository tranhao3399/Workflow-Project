import type {
  FormCategory,
  FormDefinition,
  FormGroup,
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
  groupId: string
  category?: FormCategory
  description?: string
  fields: FormField[]
  settings?: FormSettings
}

export interface UpdateFormDefinitionInput {
  code?: string
  name?: string
  groupId?: string
  category?: FormCategory | null
  description?: string
  fields?: FormField[]
  settings?: FormSettings
}

export interface CloneFormDefinitionInput {
  name?: string
  description?: string
}

export interface DuplicateFormDefinitionInput {
  code: string
  name: string
}

export interface CreateFormGroupInput {
  code: string
  name: string
  description?: string
  isActive?: boolean
  sortOrder?: number
}

export type UpdateFormGroupInput = Partial<Omit<CreateFormGroupInput, 'code'>>

export function listFormDefinitions(filter: FormDefinitionFilter = {}): Promise<PaginatedResponse<FormDefinition>> {
  return apiClient(withQuery('/form-definitions', filter))
}

export async function listAllFormDefinitions(
  filter: Omit<FormDefinitionFilter, 'page' | 'limit'> = {},
): Promise<FormDefinition[]> {
  const firstPage = await listFormDefinitions({ ...filter, page: 1, limit: 100 })
  const definitions = [...firstPage.data]
  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const result = await listFormDefinitions({ ...filter, page, limit: 100 })
    definitions.push(...result.data)
  }
  return definitions
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

export async function duplicateFormDefinition(id: string, input: DuplicateFormDefinitionInput): Promise<FormDefinition> {
  return (await apiClient<ApiDataResponse<FormDefinition>>(`/form-definitions/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    body: JSON.stringify(input),
  })).data
}

export async function deleteFormDefinition(id: string): Promise<{ id: string }> {
  return (await apiClient<ApiDataResponse<{ id: string }>>(`/form-definitions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })).data
}

export async function assignFormDefinitionGroup(id: string, groupId: string): Promise<void> {
  await apiClient(`/form-definitions/${encodeURIComponent(id)}/group`, {
    method: 'PATCH',
    body: JSON.stringify({ groupId }),
  })
}

export async function listFormGroups(): Promise<FormGroup[]> {
  return (await apiClient<ApiDataResponse<FormGroup[]>>('/form-groups')).data
}

export async function createFormGroup(input: CreateFormGroupInput): Promise<FormGroup> {
  return (await apiClient<ApiDataResponse<FormGroup>>('/form-groups', {
    method: 'POST',
    body: JSON.stringify(input),
  })).data
}

export async function updateFormGroup(id: string, input: UpdateFormGroupInput): Promise<FormGroup> {
  return (await apiClient<ApiDataResponse<FormGroup>>(`/form-groups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })).data
}

export async function deleteFormGroup(id: string): Promise<{ id: string }> {
  return (await apiClient<ApiDataResponse<{ id: string }>>(`/form-groups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })).data
}
