import type { AuthUser } from '../types/auth'
import { apiErrorMessage, normalizeApiErrorCode } from '../utils/api-errors'
import { broadcastAuthEvent, clearAuthSession, getAccessToken, notifyAuthEvent, setAuthSession } from './auth-session.store'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'
let refreshPromise: Promise<RefreshResponse> | null = null
let sessionExpiryNotified = false

export interface ApiDataResponse<T> { data: T }

export interface RefreshResponse {
  accessToken: string
  accessTokenExpiresAt: string
  sessionExpiresAt: string
  user: AuthUser
}

interface ErrorPayload {
  message?: string | string[]
  field?: string
  code?: string
  errors?: unknown[]
  details?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly field?: string
  readonly code?: string
  readonly errors?: unknown[]
  readonly details?: unknown

  constructor(message: string, status: number, field?: string, code?: string, errors?: unknown[], details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
    this.code = code
    this.errors = errors
    this.details = details
  }
}

export { getAccessToken }
export function resetSessionExpiryNotice(): void { sessionExpiryNotified = false }

export async function refreshAccessToken(): Promise<RefreshResponse> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }).then(async (response) => {
      const payload = await readPayload(response)
      if (!response.ok) {
        const error = toApiError(payload, response.status)
        expireSession()
        throw error
      }
      const result = unwrapData<RefreshResponse>(payload)
      if (!result.accessToken || !result.accessTokenExpiresAt || !result.sessionExpiresAt || !result.user) {
        expireSession()
        throw new ApiError('Phản hồi làm mới phiên không hợp lệ.', 401)
      }
      resetSessionExpiryNotice()
      setAuthSession(result.accessToken, result.accessTokenExpiresAt, result.sessionExpiresAt)
      return result
    }).finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export async function apiClient<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, options)
}

export async function apiFormDataClient<T>(path: string, method: 'POST' | 'PATCH', body: FormData): Promise<T> {
  return request<T>(path, { method, body })
}

export async function apiUploadClient<T>(
  path: string,
  body: FormData,
  onProgress?: (progress: number) => void,
): Promise<T> {
  return uploadRequest<T>(path, body, onProgress)
}

export async function apiBlobClient(path: string, options: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(options.headers)
  if (!headers.has('Accept')) headers.set('Accept', '*/*')
  return (await authorizedFetch(path, { ...options, headers })).blob()
}

export function resolveApiAssetUrl(path: string): string { return new URL(path, API_URL).toString() }

async function request<T>(path: string, options: RequestInit, retried = false): Promise<T> {
  const response = await authorizedFetch(path, options, retried)
  return readPayload(response) as Promise<T>
}

async function authorizedFetch(path: string, options: RequestInit, retried = false): Promise<Response> {
  const headers = new Headers(options.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const accessToken = getAccessToken()
  if (accessToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })
  if (response.ok) return response

  const payload = await readPayload(response)
  const error = toApiError(payload, response.status)
  if (error.status === 401 && !retried && canRefreshFor(path)) {
    await refreshAccessToken()
    return authorizedFetch(path, options, true)
  }
  throw error
}

async function uploadRequest<T>(
  path: string,
  body: FormData,
  onProgress?: (progress: number) => void,
  retried = false,
): Promise<T> {
  const response = await new Promise<{ status: number; payload: unknown }>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `${API_URL}${path}`)
    request.withCredentials = true
    request.setRequestHeader('Accept', 'application/json')
    const accessToken = getAccessToken()
    if (accessToken) request.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    })
    request.addEventListener('load', () => {
      let payload: unknown = null
      try {
        payload = request.responseText ? JSON.parse(request.responseText) : null
      } catch {
        payload = null
      }
      resolve({ status: request.status, payload })
    })
    request.addEventListener('error', () => reject(new ApiError('Không thể kết nối với máy chủ. Vui lòng thử lại.', 0)))
    request.addEventListener('abort', () => reject(new ApiError('Quá trình tải tệp đã bị hủy.', 0)))
    request.send(body)
  })

  if (response.status >= 200 && response.status < 300) {
    onProgress?.(100)
    return response.payload as T
  }
  const error = toApiError(response.payload, response.status)
  if (error.status === 401 && !retried && canRefreshFor(path)) {
    await refreshAccessToken()
    return uploadRequest<T>(path, body, onProgress, true)
  }
  throw error
}

function canRefreshFor(path: string): boolean {
  return !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/change-password', '/auth/forgot-password/request', '/auth/forgot-password/verify', '/auth/forgot-password/reset'].includes(path)
}

async function readPayload(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

function unwrapData<T>(payload: unknown): T {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) return (payload as ApiDataResponse<T>).data
  return payload as T
}

function toApiError(payload: unknown, status: number): ApiError {
  const result = (payload && typeof payload === 'object' ? payload : {}) as ErrorPayload
  const nested = result.message && typeof result.message === 'object' && !Array.isArray(result.message)
    ? result.message as unknown as ErrorPayload
    : undefined
  const messageSource = nested?.message ?? result.message
  const fallback = Array.isArray(messageSource) ? messageSource.join(', ') : typeof messageSource === 'string' ? messageSource : 'Không thể kết nối với máy chủ. Vui lòng thử lại.'
  const code = normalizeApiErrorCode(result.code ?? nested?.code)
  return new ApiError(
    apiErrorMessage(code, fallback),
    status,
    result.field ?? nested?.field,
    code,
    result.errors ?? nested?.errors,
    result.details ?? nested?.details,
  )
}

function expireSession(): void {
  clearAuthSession()
  if (sessionExpiryNotified) return
  sessionExpiryNotified = true
  broadcastAuthEvent('expired')
  notifyAuthEvent('expired')
}
