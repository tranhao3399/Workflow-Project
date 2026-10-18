import type { FileMetadata } from '../types/workflow'
import { apiErrorMessage } from '../utils/api-errors'
import { ApiError, apiBlobClient, apiClient, apiUploadClient } from './api-client'
import type { ApiDataResponse } from './api-client'

async function fileOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    if (error.code === 'FILE_NOT_ALLOWED' || error.code === 'FILE_ACCESS_DENIED') throw error
    if (error.status === 400 || error.status === 413) {
      throw new ApiError(apiErrorMessage('FILE_NOT_ALLOWED', error.message), error.status, error.field, 'FILE_NOT_ALLOWED')
    }
    if (error.status === 403 || error.status === 404) {
      throw new ApiError(apiErrorMessage('FILE_ACCESS_DENIED', error.message), error.status, error.field, 'FILE_ACCESS_DENIED')
    }
    throw error
  }
}

export async function uploadRequestFile(
  requestId: string,
  file: File,
  fieldKey: string,
  onProgress?: (progress: number) => void,
): Promise<FileMetadata> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('fieldKey', fieldKey)
  return fileOperation(async () => (await apiUploadClient<ApiDataResponse<FileMetadata>>(
    `/requests/${encodeURIComponent(requestId)}/files`,
    formData,
    onProgress,
  )).data)
}

export async function getFileMetadata(id: string): Promise<FileMetadata> {
  return fileOperation(async () => (await apiClient<ApiDataResponse<FileMetadata>>(`/files/${encodeURIComponent(id)}`)).data)
}

export function getFilePreviewBlob(id: string): Promise<Blob> {
  return fileOperation(() => apiBlobClient(`/files/${encodeURIComponent(id)}/preview`))
}

export async function createFilePreviewUrl(id: string): Promise<string> {
  return URL.createObjectURL(await getFilePreviewBlob(id))
}

export function revokeFilePreviewUrl(url: string): void {
  URL.revokeObjectURL(url)
}

export function getFileDownloadBlob(id: string): Promise<Blob> {
  return fileOperation(() => apiBlobClient(`/files/${encodeURIComponent(id)}/download`))
}

export async function downloadFile(id: string, filename: string): Promise<void> {
  const url = URL.createObjectURL(await getFileDownloadBlob(id))
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function deleteFile(id: string): Promise<{ id: string }> {
  return fileOperation(async () => (await apiClient<ApiDataResponse<{ id: string }>>(`/files/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })).data)
}
