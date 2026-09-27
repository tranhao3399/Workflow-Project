export const userRoles = ['EMPLOYEE', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR', 'ADMIN'] as const

export type UserRole = (typeof userRoles)[number]

export interface AuthUser {
  id: string
  fullName: string
  email: string
  role: UserRole
  department: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  permissionKeys?: string[]
}

export interface LoginResponse {
  accessToken: string
  accessTokenExpiresAt: string
  sessionExpiresAt: string
  user: AuthUser
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput extends LoginInput {
  fullName: string
  role: UserRole
  department: string
}
