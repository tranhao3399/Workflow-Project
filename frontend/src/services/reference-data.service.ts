import type { ReferenceData } from '../types/reference-data'
import { apiClient } from './api-client'

export async function getReferenceData(): Promise<{ data: ReferenceData; source: 'api' }> {
  return { data: await apiClient<ReferenceData>('/reference-data'), source: 'api' }
}
