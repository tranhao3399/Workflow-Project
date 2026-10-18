import { useEffect, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { ErrorState, LoadingState } from './components/DataStates'
import { Workspace } from './components/Workspace'
import { ApiError } from './services/api-client'
import { clearSession, logout, restoreSession } from './services/auth.service'
import { broadcastAuthEvent, clearAuthSession, getSessionExpiresAt, notifyAuthEvent } from './services/auth-session.store'
import type { AuthUser } from './types/auth'
import './App.css'

type SessionState = 'checking' | 'anonymous' | 'authenticated' | 'error'
const SESSION_EXPIRED_MESSAGE = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'

function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [sessionReloadVersion, setSessionReloadVersion] = useState(0)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [sessionNotice, setSessionNotice] = useState('')

  useEffect(() => {
    function onAuthEvent(event: Event) {
      const detail = (event as CustomEvent<{ type?: string }>).detail
      clearAuthSession()
      setUser(null)
      setSessionState('anonymous')
      if (detail?.type === 'expired' && (user || sessionState === 'authenticated')) setSessionNotice(SESSION_EXPIRED_MESSAGE)
    }
    window.addEventListener('workflow:auth-event', onAuthEvent)
    return () => window.removeEventListener('workflow:auth-event', onAuthEvent)
  }, [sessionState, user])

  useEffect(() => {
    let isCurrent = true
    async function loadSession() {
      try {
        const currentUser = await restoreSession()
        if (!isCurrent) return
        setUser(currentUser)
        setSessionState('authenticated')
      } catch (error) {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) {
          clearSession()
          setSessionState('anonymous')
          return
        }
        setSessionState('error')
      }
    }
    // Restoring the external auth session deliberately enters a loading state first.
    // oxlint-disable-next-line react/set-state-in-effect
    setSessionState('checking')
    void loadSession()
    return () => { isCurrent = false }
  }, [sessionReloadVersion])

  useEffect(() => {
    if (!user) return
    function expireIfNeeded() {
      const expiresAt = getSessionExpiresAt()
      if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
        clearAuthSession()
        broadcastAuthEvent('expired')
        notifyAuthEvent('expired')
      }
    }
    expireIfNeeded()
    const expiresAt = getSessionExpiresAt()
    const delay = expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0
    const timer = window.setTimeout(expireIfNeeded, delay)
    window.addEventListener('visibilitychange', expireIfNeeded)
    return () => { window.clearTimeout(timer); window.removeEventListener('visibilitychange', expireIfNeeded) }
  }, [user])

  useEffect(() => {
    if (!sessionNotice) return
    const timer = window.setTimeout(() => setSessionNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [sessionNotice])

  function handleAuthenticated(authenticatedUser: AuthUser) {
    setUser(authenticatedUser)
    setSessionNotice('')
    setSessionState('authenticated')
  }

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try { await logout() } finally {
      setUser(null)
      setSessionState('anonymous')
      setIsLoggingOut(false)
    }
  }

  function handlePasswordChanged(message: string) {
    clearSession()
    setUser(null)
    setSessionNotice(message)
    setSessionState('anonymous')
  }

  if (sessionState === 'checking') return <LoadingState />
  if (sessionState === 'error') return <ErrorState onRetry={() => setSessionReloadVersion((version) => version + 1)} />
  if (sessionState === 'anonymous' || !user) return <>{sessionNotice && <div className="toast-message" role="status">{sessionNotice}</div>}<AuthScreen onAuthenticated={handleAuthenticated} onPasswordReset={() => setSessionNotice('Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.')} /></>
  return <><Workspace user={user} onLogout={handleLogout} isLoggingOut={isLoggingOut} onCurrentUserUpdated={setUser} onPasswordChanged={handlePasswordChanged} />{sessionNotice && <div className="toast-message" role="status">{sessionNotice}</div>}</>
}

export default App
