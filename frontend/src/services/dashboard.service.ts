import type { DashboardData, DashboardRole } from '../types/erp'
import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'

export async function getDashboard(role: DashboardRole): Promise<DashboardData> {
  return apiClient<ApiDataResponse<DashboardData>>(`/dashboard?role=${encodeURIComponent(role)}`).then((response) => response.data)
}
