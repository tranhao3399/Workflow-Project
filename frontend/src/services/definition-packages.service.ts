import type { DefinitionPackage, DefinitionPackageInput, PublishDefinitionPackageInput } from '../types/workflow'
import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'

export type DefinitionPackageAction = 'publish' | 'deactivate' | 'reactivate' | 'archive'

async function updateDefinitionPackage(action: DefinitionPackageAction, input: DefinitionPackageInput): Promise<DefinitionPackage> {
  return (await apiClient<ApiDataResponse<DefinitionPackage>>(`/definition-packages/${action}`, {
    method: 'POST',
    body: JSON.stringify(input),
  })).data
}

export const publishDefinitionPackage = (input: PublishDefinitionPackageInput) => updateDefinitionPackage('publish', input)
export const deactivateDefinitionPackage = (input: DefinitionPackageInput) => updateDefinitionPackage('deactivate', input)
export const reactivateDefinitionPackage = (input: DefinitionPackageInput) => updateDefinitionPackage('reactivate', input)
export const archiveDefinitionPackage = (input: DefinitionPackageInput) => updateDefinitionPackage('archive', input)
