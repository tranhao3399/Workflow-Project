import type { DashboardData, DashboardView } from '../types/erp'
import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'

export async function getDashboard(view?: DashboardView): Promise<DashboardData> {
  const query = view ? `?view=${encodeURIComponent(view)}` : ''
  return apiClient<ApiDataResponse<DashboardData>>(`/dashboard${query}`).then((response) => response.data)
}
