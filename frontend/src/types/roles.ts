export interface PermissionDefinition {
  key: string
  module: string
  moduleLabel: string
  label: string
  matrixColumn: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SPECIAL'
  displayOrder: number
}

export interface RoleRecord {
  id: string
  key: string
  name: string
  description?: string
  permissionKeys: string[]
  isSystem: boolean
  isActive: boolean
  assignedUserCount: number
  createdAt?: string
  updatedAt?: string
}

export interface CreateRoleInput {
  key: string
  name: string
  permissionKeys: string[]
  isActive: boolean
}

export interface UpdateRoleInput {
  key?: string
  name?: string
  permissionKeys?: string[]
  isActive?: boolean
}

export interface RoleAuditLog {
  id: string
  actorName: string
  action: string
  occurredAt: string
}
