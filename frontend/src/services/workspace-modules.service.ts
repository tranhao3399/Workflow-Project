import { apiClient } from './api-client'
import type { WorkspaceModule, WorkspaceModuleUpdate } from '../types/workspace-modules'

export async function getMyWorkspaceModules(): Promise<WorkspaceModule[]> { return apiClient<WorkspaceModule[]>('/workspace-modules/me') }
export async function getWorkspaceModules(): Promise<WorkspaceModule[]> { return apiClient<WorkspaceModule[]>('/workspace-modules') }
export async function updateWorkspaceModule(moduleKey: string, update: WorkspaceModuleUpdate): Promise<WorkspaceModule> {
  return apiClient<WorkspaceModule>(`/workspace-modules/${moduleKey}`, { method: 'PATCH', body: JSON.stringify(update) })
}
