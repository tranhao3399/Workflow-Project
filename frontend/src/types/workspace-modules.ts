import type { UserRole } from './auth'

export type WorkspaceModuleGroup = 'WORKSPACE' | 'ADMIN'

export interface WorkspaceModule {
  moduleKey: string
  name: string
  path: string
  icon: string
  group: WorkspaceModuleGroup
  sortOrder: number
  isEnabled: boolean
  visibleToRoles: UserRole[]
  isCore: boolean
  createdAt?: string
  updatedAt?: string
}

export type WorkspaceModuleUpdate = Pick<WorkspaceModule, 'isEnabled'>
