import type { UserRole } from './auth'

export const employmentTypes = ['FULL_TIME', 'CONTRACT', 'INTERN'] as const
export type EmploymentType = (typeof employmentTypes)[number]

export interface EmployeeAvatarMetadata {
  contentType: 'image/jpeg' | 'image/png'
  size: number
  updatedAt: string
}

export interface Employee {
  id: string
  employeeCode: string
  fullName: string
  workEmail: string
  department: string
  departmentId?: string
  position: string
  positionId?: string
  phone?: string
  address?: string
  dateOfBirth?: string
  hiredAt?: string
  employmentType?: EmploymentType
  managerId?: string
  isActive: boolean
  userId?: string
  avatarKey?: string
  avatarUrl?: string
  avatar?: EmployeeAvatarMetadata
  createdAt: string
  updatedAt: string
}

export interface EmployeeFormValues {
  employeeCode: string
  fullName: string
  workEmail: string
  department: string
  departmentId?: string
  position: string
  positionId?: string
  phone?: string
  address?: string
  dateOfBirth?: string
  hiredAt?: string
  employmentType: EmploymentType
  managerId?: string
  isActive: boolean
}

export interface AccountSummary {
  id: string
  email: string
  roles: UserRole[]
  isActive: boolean
}
