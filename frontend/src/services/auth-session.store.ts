let accessToken: string | null = null
let accessTokenExpiresAt: string | null = null
let sessionExpiresAt: string | null = null

type AuthEventType = 'logout' | 'expired'
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('workflow-auth')

function dispatch(type: AuthEventType, remote = false) {
  window.dispatchEvent(new CustomEvent('workflow:auth-event', { detail: { type, remote } }))
}

channel?.addEventListener('message', (event: MessageEvent<AuthEventType>) => {
  if (event.data !== 'logout' && event.data !== 'expired') return
  clearAuthSession()
  dispatch(event.data, true)
})

export function setAuthSession(nextToken: string, nextAccessTokenExpiresAt: string, nextSessionExpiresAt: string): void {
  accessToken = nextToken
  accessTokenExpiresAt = nextAccessTokenExpiresAt
  sessionExpiresAt = nextSessionExpiresAt
}

export function getAccessToken(): string | null { return accessToken }
export function getSessionExpiresAt(): string | null { return sessionExpiresAt }
export function getAccessTokenExpiresAt(): string | null { return accessTokenExpiresAt }

export function clearAuthSession(): void {
  accessToken = null
  accessTokenExpiresAt = null
  sessionExpiresAt = null
}

export function broadcastAuthEvent(type: AuthEventType): void {
  channel?.postMessage(type)
}

export function notifyAuthEvent(type: AuthEventType): void {
  dispatch(type)
}
