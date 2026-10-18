import type { AuthUser, LoginInput, LoginResponse, RegisterInput } from '../types/auth'
import { apiClient, refreshAccessToken, resetSessionExpiryNotice } from './api-client'
import type { ApiDataResponse } from './api-client'
import { broadcastAuthEvent, clearAuthSession, setAuthSession } from './auth-session.store'

export async function login(input: LoginInput): Promise<AuthUser> {
  const payload = await apiClient<ApiDataResponse<LoginResponse> | LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) })
  const result = 'data' in payload ? payload.data : payload
  if (!result.accessToken || !result.accessTokenExpiresAt || !result.sessionExpiresAt || !result.user) throw new Error('Phản hồi đăng nhập không hợp lệ.')
  setAuthSession(result.accessToken, result.accessTokenExpiresAt, result.sessionExpiresAt)
  resetSessionExpiryNotice()
  return result.user
}

export async function restoreSession(): Promise<AuthUser> {
  return (await refreshAccessToken()).user
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  return apiClient<ApiDataResponse<AuthUser>>('/auth/register', { method: 'POST', body: JSON.stringify(input) }).then((response) => response.data)
}

interface MessageResponse { message: string }

export interface PasswordResetRequestResponse extends MessageResponse {
  retryAfterSeconds: number
  resendLocked: boolean
}

export async function changeOwnPassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<MessageResponse> {
  return apiClient<ApiDataResponse<MessageResponse>>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  }).then((response) => response.data)
}

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResponse> {
  return apiClient<ApiDataResponse<PasswordResetRequestResponse>>('/auth/forgot-password/request', { method: 'POST', body: JSON.stringify({ email }) }).then((response) => response.data)
}

export async function verifyPasswordResetOtp(email: string, code: string): Promise<{ resetToken: string }> {
  return apiClient<ApiDataResponse<{ resetToken: string }>>('/auth/forgot-password/verify', { method: 'POST', body: JSON.stringify({ email, code }) }).then((response) => response.data)
}

export async function resetForgottenPassword(resetToken: string, newPassword: string, confirmPassword: string): Promise<MessageResponse> {
  return apiClient<ApiDataResponse<MessageResponse>>('/auth/forgot-password/reset', { method: 'POST', body: JSON.stringify({ resetToken, newPassword, confirmPassword }) }).then((response) => response.data)
}

export async function getCurrentUser(): Promise<AuthUser> {
  return apiClient<ApiDataResponse<AuthUser>>('/auth/me').then((response) => response.data)
}

export function clearSession(): void { clearAuthSession() }

export async function logout(): Promise<void> {
  try {
    await apiClient<ApiDataResponse<{ message: string }>>('/auth/logout', { method: 'POST' })
  } catch (error) {
    if (!(error instanceof Error) || !('status' in error) || error.status !== 401) throw error
    await refreshAccessToken()
    await apiClient<ApiDataResponse<{ message: string }>>('/auth/logout', { method: 'POST' })
  } finally {
    clearAuthSession()
    broadcastAuthEvent('logout')
  }
}
