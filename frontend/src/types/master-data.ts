export interface DepartmentPreview {
  id: string
  name: string
  code: string
  managerName?: string
  employeeCount: number
  isActive: boolean
}

export interface CreateDepartmentInput {
  name: string
  code: string
  isActive: boolean
  positionIds?: string[]
}

export interface DepartmentApiResponse {
  id: string
  name: string
  code: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface JobTitlePreview {
  id: string
  name: string
  code: string
  level?: number
  canApprove?: boolean
  departmentCount: number
  isActive: boolean
}

export interface JobTitleInput {
  name: string
  code: string
  isActive: boolean
}

export interface JobTitleApiResponse extends JobTitleInput {
  id: string
}
