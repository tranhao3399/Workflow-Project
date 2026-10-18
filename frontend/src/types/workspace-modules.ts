export type WorkspaceModuleGroup = 'WORKSPACE' | 'ADMIN'

export interface WorkspaceModule {
  moduleKey: string
  name: string
  path: string
  icon: string
  groupKey: WorkspaceModuleGroup
  sortOrder: number
  isEnabled: boolean
  requiredPermission: string
  isCore: boolean
  createdAt?: string
  updatedAt?: string
}

export type WorkspaceModuleUpdate = Pick<WorkspaceModule, 'isEnabled'>
