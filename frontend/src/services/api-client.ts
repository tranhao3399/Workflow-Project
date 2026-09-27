import type { AuthUser } from '../types/auth'
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
}

export class ApiError extends Error {
  readonly status: number
  readonly field?: string
  readonly code?: string

  constructor(message: string, status: number, field?: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
    this.code = code
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

export function resolveApiAssetUrl(path: string): string { return new URL(path, API_URL).toString() }

async function request<T>(path: string, options: RequestInit, retried = false): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      ...options.headers,
    },
  })
  const payload = await readPayload(response)
  if (response.ok) return payload as T

  const error = toApiError(payload, response.status)
  if (error.status === 401 && !retried && canRefreshFor(path)) {
    await refreshAccessToken()
    return request<T>(path, options, true)
  }
  throw error
}

function canRefreshFor(path: string): boolean {
  return !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(path)
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
  const message = Array.isArray(messageSource) ? messageSource.join(', ') : typeof messageSource === 'string' ? messageSource : 'Không thể kết nối với máy chủ. Vui lòng thử lại.'
  return new ApiError(message, status, result.field ?? nested?.field, result.code ?? nested?.code)
}

function expireSession(): void {
  clearAuthSession()
  if (sessionExpiryNotified) return
  sessionExpiryNotified = true
  broadcastAuthEvent('expired')
  notifyAuthEvent('expired')
}
