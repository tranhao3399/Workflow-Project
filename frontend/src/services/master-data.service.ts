import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'
import type { CreateDepartmentInput, DepartmentApiResponse, DepartmentPreview, JobTitleApiResponse, JobTitleInput, JobTitlePreview } from '../types/master-data'

interface DepartmentApiRecord {
  _id: string
  code: string
  name: string
  managerEmployeeId?: string
  isActive: boolean
  sortOrder: number
}

interface EmployeeApiRecord {
  _id?: string
  id?: string
  fullName: string
  department?: string
  departmentId?: string | { _id?: string; name?: string }
}

interface JobTitleApiRecord {
  id: string
  code: string
  name: string
  isActive: boolean
}

type JobTitleListPayload = JobTitleApiRecord[] | ApiDataResponse<JobTitleApiRecord[]>

function jobTitleRecords(payload: JobTitleListPayload): JobTitleApiRecord[] {
  return Array.isArray(payload) ? payload : payload.data
}

interface DepartmentPositionApiRecord {
  _id: string
  jobTitleId: {
    _id: string
    code: string
    name: string
    isActive: boolean
  } | null
}

function relationId(value?: string | { _id?: string }): string | undefined {
  return typeof value === 'string' ? value : value?._id
}

export async function getDepartmentsFromApi(): Promise<DepartmentPreview[]> {
  const [departmentRecords, employeeResponse] = await Promise.all([
    apiClient<{ data: DepartmentApiRecord[] }>('/departments?page=1&limit=100').then((response) => response.data),
    apiClient<{ data: EmployeeApiRecord[] }>('/employees?page=1&limit=100'),
  ])
  const employees = employeeResponse.data
  const employeesById = new Map(employees.map((employee) => [employee._id ?? employee.id ?? '', employee]))
  const departmentCounts = new Map<string, number>()
  for (const employee of employees) {
    const departmentId = relationId(employee.departmentId)
    const department = departmentId ?? employee.department
    if (department) departmentCounts.set(department, (departmentCounts.get(department) ?? 0) + 1)
  }

  return departmentRecords.map((department) => ({
    id: department._id,
    name: department.name,
    code: department.code,
    managerName: department.managerEmployeeId ? employeesById.get(department.managerEmployeeId)?.fullName : undefined,
    employeeCount: departmentCounts.get(department._id) ?? departmentCounts.get(department.name) ?? 0,
    isActive: department.isActive,
  }))
}

export async function createDepartmentFromApi(input: CreateDepartmentInput): Promise<DepartmentApiResponse> {
  return apiClient<ApiDataResponse<DepartmentApiResponse>>('/departments', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      isActive: input.isActive,
      ...(input.positionIds?.length ? { positionIds: input.positionIds } : {}),
    }),
  }).then((response) => response.data)
}

export async function getDepartmentByIdFromApi(departmentId: string): Promise<DepartmentPreview> {
  const [department, employeeResponse] = await Promise.all([
    apiClient<ApiDataResponse<DepartmentApiRecord>>(`/departments/${encodeURIComponent(departmentId)}`).then((response) => response.data),
    apiClient<{ data: EmployeeApiRecord[] }>('/employees?page=1&limit=100'),
  ])
  const manager = department.managerEmployeeId
    ? employeeResponse.data.find((employee) => (employee._id ?? employee.id) === department.managerEmployeeId)
    : undefined
  const employeeCount = employeeResponse.data.filter((employee) => {
    const relation = relationId(employee.departmentId)
    return relation === department._id || (!relation && employee.department === department.name)
  }).length
  return {
    id: department._id,
    name: department.name,
    code: department.code,
    managerName: manager?.fullName,
    employeeCount,
    isActive: department.isActive,
  }
}

export async function getDepartmentBasicByIdFromApi(departmentId: string): Promise<DepartmentPreview> {
  const department = (await apiClient<ApiDataResponse<DepartmentApiRecord>>(`/departments/${encodeURIComponent(departmentId)}`)).data
  return { id: department._id, name: department.name, code: department.code, isActive: department.isActive, employeeCount: 0 }
}

export async function getJobTitlesFromApi(): Promise<JobTitlePreview[]> {
  const records = jobTitleRecords(await apiClient<JobTitleListPayload>('/job-titles'))
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    code: record.code,
    departmentCount: 0,
    isActive: record.isActive,
  }))
}

export async function getJobTitleByIdFromApi(jobTitleId: string): Promise<JobTitleApiResponse> {
  return apiClient<ApiDataResponse<JobTitleApiResponse>>(`/job-titles/${encodeURIComponent(jobTitleId)}`).then((response) => response.data)
}

export async function createJobTitleFromApi(input: JobTitleInput): Promise<JobTitleApiResponse> {
  return apiClient<ApiDataResponse<JobTitleApiResponse>>('/job-titles', {
    method: 'POST',
    body: JSON.stringify({ name: input.name.trim(), code: input.code.trim().toUpperCase(), isActive: input.isActive }),
  }).then((response) => response.data)
}

export async function updateJobTitleFromApi(jobTitleId: string, input: Pick<JobTitleInput, 'code' | 'name'> & Partial<Pick<JobTitleInput, 'isActive'>>): Promise<JobTitleApiResponse> {
  return apiClient<ApiDataResponse<JobTitleApiResponse>>(`/job-titles/${encodeURIComponent(jobTitleId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ code: input.code.trim().toUpperCase(), name: input.name.trim(), ...(input.isActive === undefined ? {} : { isActive: input.isActive }) }),
  }).then((response) => response.data)
}

export async function deleteJobTitleFromApi(jobTitleId: string): Promise<void> {
  await apiClient<ApiDataResponse<{ id: string; deleted: boolean }>>(`/job-titles/${encodeURIComponent(jobTitleId)}`, { method: 'DELETE' })
}

export async function getDepartmentPositionsFromApi(departmentId: string): Promise<JobTitlePreview[]> {
  const records = await apiClient<DepartmentPositionApiRecord[]>(`/departments/${encodeURIComponent(departmentId)}/positions`)
  return records.flatMap((record) => record.jobTitleId ? [{ id: record.jobTitleId._id, name: record.jobTitleId.name, code: record.jobTitleId.code, departmentCount: 1, isActive: record.jobTitleId.isActive }] : [])
}

interface ApplyDepartmentJobTitlesResponse {
  addedCount: number
  assignments: Array<{ id: string }>
}

export async function applyDepartmentJobTitlesFromApi(departmentId: string, jobTitleIds: string[]): Promise<ApplyDepartmentJobTitlesResponse> {
  return apiClient<ApiDataResponse<ApplyDepartmentJobTitlesResponse>>(`/departments/${encodeURIComponent(departmentId)}/positions`, {
    method: 'POST',
    body: JSON.stringify({ jobTitleIds }),
  }).then((response) => response.data)
}

export async function removeDepartmentPositionFromApi(departmentId: string, assignmentId: string): Promise<void> {
  await apiClient<ApiDataResponse<unknown>>(`/departments/${encodeURIComponent(departmentId)}/positions/${encodeURIComponent(assignmentId)}`, { method: 'DELETE' })
}

export async function removeDepartmentPositionsFromApi(departmentId: string, assignmentIds: string[]): Promise<void> {
  await apiClient<ApiDataResponse<unknown>>(`/departments/${encodeURIComponent(departmentId)}/positions`, {
    method: 'DELETE',
    body: JSON.stringify({ assignmentIds }),
  })
}

export async function getActivePositionCatalogFromApi(): Promise<JobTitlePreview[]> {
  const records = jobTitleRecords(await apiClient<JobTitleListPayload>('/job-titles?isActive=true'))
  return records.map((record) => ({ id: record.id, name: record.name, code: record.code, departmentCount: 0, isActive: record.isActive }))
}

export async function updateDepartmentFromApi(departmentId: string, input: { code?: string; name?: string; isActive?: boolean }): Promise<void> {
  await apiClient(`/departments/${encodeURIComponent(departmentId)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export async function deleteDepartmentFromApi(departmentId: string): Promise<void> {
  await apiClient<ApiDataResponse<{ id: string; deleted: boolean }>>(`/departments/${encodeURIComponent(departmentId)}`, { method: 'DELETE' })
}

export interface DepartmentAuditLog {
  _id?: string
  id?: string
  occurredAt: string
  actor: { userId?: string; fullName?: string; employeeCode?: string; rolesAtTime?: string[] }
  action: string
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> }
}

export interface JobTitleAuditLog {
  _id?: string
  id?: string
  occurredAt: string
  actor: { userId?: string; fullName?: string; employeeCode?: string; rolesAtTime?: string[] }
  action: string
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> }
}

export async function getJobTitleAuditLogs(jobTitleId: string): Promise<JobTitleAuditLog[]> {
  const response = await apiClient<{ data: JobTitleAuditLog[] }>(`/audit-logs?resourceType=POSITION&resourceId=${encodeURIComponent(jobTitleId)}&page=1&limit=100`)
  return response.data.filter((event) => ['POSITION.CREATED', 'POSITION.UPDATED', 'POSITION.DEACTIVATED'].includes(event.action)).sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
}

export async function getDepartmentAuditLogs(departmentId: string): Promise<DepartmentAuditLog[]> {
  const response = await apiClient<{ data: DepartmentAuditLog[] }>(`/audit-logs?resourceType=DEPARTMENT&resourceId=${encodeURIComponent(departmentId)}&page=1&limit=100`)
  return response.data.filter((event) => ['DEPARTMENT.CREATED', 'DEPARTMENT.UPDATED', 'DEPARTMENT.DEACTIVATED', 'DEPARTMENT.POSITION_ASSIGNED', 'DEPARTMENT.POSITIONS_ASSIGNED', 'DEPARTMENT.POSITIONS_APPLIED', 'DEPARTMENT.POSITIONS_ADDED', 'DEPARTMENT.POSITION_REMOVED', 'DEPARTMENT.POSITION_DELETED', 'DEPARTMENT.POSITIONS_DELETED'].includes(event.action)).sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
}
