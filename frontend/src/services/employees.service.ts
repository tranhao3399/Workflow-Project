import type { Employee, EmployeeFormValues } from '../types/employees'
import { apiClient, apiFormDataClient } from './api-client'
import type { ApiDataResponse } from './api-client'

interface EmployeeApiResponse extends Omit<Employee, 'id'> { _id?: string; id?: string }
type CreateEmployeeValues = Omit<EmployeeFormValues, 'employeeCode'>

function fromApi(value: EmployeeApiResponse): Employee { return { ...value, id: value.id ?? value._id ?? '' } }

export async function getEmployees(): Promise<Employee[]> {
  const result = await apiClient<{ data: EmployeeApiResponse[] }>('/employees?page=1&limit=100')
  return result.data.map(fromApi)
}

export async function getEmployeeById(employeeId: string): Promise<Employee | null> {
  try { return fromApi((await apiClient<ApiDataResponse<EmployeeApiResponse>>(`/employees/${encodeURIComponent(employeeId)}`)).data) }
  catch (error) { if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) return null; throw error }
}

export async function getNextEmployeeCode(): Promise<string> {
  return (await apiClient<ApiDataResponse<string>>('/employees/next-code')).data
}

export async function createEmployee(values: CreateEmployeeValues): Promise<Employee> {
  return fromApi((await apiClient<ApiDataResponse<EmployeeApiResponse>>('/employees', { method: 'POST', body: JSON.stringify(values) })).data)
}

export async function getActiveEmployeeOptions(): Promise<Employee[]> {
  const result = await apiClient<{ data: EmployeeApiResponse[] }>('/employees?isActive=true&page=1&limit=100')
  return result.data.map(fromApi)
}

export async function uploadEmployeeAvatar(employeeId: string, file: File): Promise<Employee> {
  const formData = new FormData(); formData.append('file', file)
  return fromApi((await apiFormDataClient<ApiDataResponse<EmployeeApiResponse>>(`/employees/${encodeURIComponent(employeeId)}/avatar`, 'POST', formData)).data)
}

export async function removeEmployeeAvatar(employeeId: string): Promise<Employee> {
  return fromApi((await apiClient<ApiDataResponse<EmployeeApiResponse>>(`/employees/${encodeURIComponent(employeeId)}/avatar`, { method: 'DELETE' })).data)
}

export async function updateEmployee(employeeId: string, values: Partial<EmployeeFormValues>): Promise<Employee> {
  const { employeeCode: _employeeCode, ...payload } = values
  return fromApi((await apiClient<ApiDataResponse<EmployeeApiResponse>>(`/employees/${encodeURIComponent(employeeId)}`, { method: 'PATCH', body: JSON.stringify(payload) })).data)
}
