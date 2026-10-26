import type { UserRole } from './auth'

export interface User {
  id: string
  fullName: string
  email: string
  department: string
  role: UserRole
  roles?: UserRole[]
  roleIds?: string[]
  employeeId?: string
  avatarUrl?: string
  isActive: boolean
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

export interface UserFormValues {
  employeeId: string
  email: string
  roleIds: string[]
  isActive: boolean
}

export type UserActivityAction = string

export interface UserActivityLog {
  id: string
  actorId: string
  occurredAt: string
  action: UserActivityAction
  resourceType: string
  resourceCode?: string
  outcome: 'SUCCESS' | 'FAILED'
  description: string
  actorName?: string
  actorEmployeeCode?: string
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> }
}

export const permissionModules = [
  'OVERVIEW',
  'REQUESTS',
  'APPROVALS',
  'FORM_BUILDER',
  'WORKFLOW_BUILDER',
  'USERS',
  'AUDIT_LOGS',
] as const

export type PermissionModule = (typeof permissionModules)[number]

export const permissionActions = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'PUBLISH', 'APPROVE', 'MANAGE'] as const

export type PermissionAction = (typeof permissionActions)[number]

export interface PermissionDefinition {
  module: PermissionModule
  action: PermissionAction
  label: string
}

export type PermissionMatrix = Record<string, Record<UserRole, boolean>>
