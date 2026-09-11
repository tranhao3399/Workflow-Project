import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

const roles = ['EMPLOYEE', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR', 'ADMIN'] as const
type Role = (typeof roles)[number]

type User = {
  id: string
  fullName: string
  email: string
  role: Role
  department: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type AuthResponse = { accessToken: string; user: User }
type Mode = 'login' | 'register'

const initialRegistration = {
  fullName: '',
  email: '',
  password: '',
  role: 'EMPLOYEE' as Role,
  department: '',
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null

  if (!response.ok) {
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : body?.message ?? 'Không thể kết nối với máy chủ. Vui lòng thử lại.'
    throw new Error(message)
  }

  return body as T
}

function App() {
  const [mode, setMode] = useState<Mode>('login')
  const [login, setLogin] = useState({ email: '', password: '' })
  const [registration, setRegistration] = useState(initialRegistration)
  const [user, setUser] = useState<User | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(
    () => Boolean(localStorage.getItem('accessToken')),
  )

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken')
    if (!accessToken) {
      return
    }

    apiRequest<User>('/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(setUser)
      .catch(() => localStorage.removeItem('accessToken'))
      .finally(() => setIsCheckingSession(false))
  }, [])

  function clearFeedback() {
    setError('')
    setMessage('')
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode)
    clearFeedback()
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedback()
    setIsSubmitting(true)

    try {
      const result = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(login),
      })
      localStorage.setItem('accessToken', result.accessToken)
      setUser(result.user)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Đăng nhập thất bại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedback()
    setIsSubmitting(true)

    try {
      await apiRequest<User>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(registration),
      })
      setLogin({ email: registration.email, password: registration.password })
      setRegistration(initialRegistration)
      setMode('login')
      setMessage('Tài khoản đã được tạo. Hãy đăng nhập để tiếp tục.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Đăng ký thất bại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function logout() {
    localStorage.removeItem('accessToken')
    setUser(null)
    setLogin({ email: '', password: '' })
    setMessage('Bạn đã đăng xuất.')
  }

  if (isCheckingSession) {
    return <main className="page-loading">Đang kiểm tra phiên đăng nhập...</main>
  }

  if (user) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <a className="brand" href="/" aria-label="WorkFlow">
            <span className="brand-mark">W</span><span>WorkFlow</span>
          </a>
          <button className="text-button" type="button" onClick={logout}>Đăng xuất</button>
        </header>
        <section className="welcome" aria-labelledby="welcome-title">
          <p className="eyebrow">PHIÊN LÀM VIỆC</p>
          <h1 id="welcome-title">Chào, {user.fullName}</h1>
          <p>Đăng nhập thành công. Tài khoản của bạn đã sẵn sàng để sử dụng hệ thống.</p>
        </section>
        <section className="profile" aria-labelledby="profile-title">
          <div className="profile-heading">
            <span className="avatar" aria-hidden="true">{user.fullName.charAt(0).toUpperCase()}</span>
            <div><h2 id="profile-title">Thông tin tài khoản</h2><p>{user.email}</p></div>
          </div>
          <dl>
            <div><dt>Vai trò</dt><dd>{user.role}</dd></div>
            <div><dt>Phòng ban</dt><dd>{user.department}</dd></div>
            <div><dt>Trạng thái</dt><dd><span className="status">Đang hoạt động</span></dd></div>
          </dl>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro" aria-labelledby="product-title">
        <a className="brand brand-light" href="/" aria-label="WorkFlow"><span className="brand-mark">W</span><span>WorkFlow</span></a>
        <div className="intro-content">
          <p className="eyebrow">WORKFLOW MANAGEMENT</p>
          <h1 id="product-title">Làm việc rõ ràng, theo đúng quy trình.</h1>
          <p>Quản lý công việc và phê duyệt tập trung cho toàn bộ tổ chức.</p>
        </div>
        <p className="intro-footer">Nền tảng nội bộ</p>
      </section>
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-card">
          <div className="mode-switch" role="tablist" aria-label="Xác thực tài khoản">
            <button className={mode === 'login' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>Đăng nhập</button>
            <button className={mode === 'register' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>Đăng ký</button>
          </div>
          <div className="auth-heading">
            <h2 id="auth-title">{mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản'}</h2>
            <p>{mode === 'login' ? 'Đăng nhập để tiếp tục vào không gian làm việc của bạn.' : 'Điền thông tin để tạo tài khoản nhân viên.'}</p>
          </div>
          {message && <p className="feedback success" role="status">{message}</p>}
          {error && <p className="feedback error" role="alert">{error}</p>}
          {mode === 'login' ? (
            <form onSubmit={submitLogin}>
              <label>Email công việc<input type="email" autoComplete="email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} placeholder="name@company.com" required /></label>
              <label>Mật khẩu<input type="password" autoComplete="current-password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} placeholder="Tối thiểu 8 ký tự" minLength={8} required /></label>
              <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
            </form>
          ) : (
            <form onSubmit={submitRegistration}>
              <label>Họ và tên<input type="text" autoComplete="name" value={registration.fullName} onChange={(event) => setRegistration({ ...registration, fullName: event.target.value })} placeholder="Nguyen Van A" maxLength={100} required /></label>
              <label>Email công việc<input type="email" autoComplete="email" value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} placeholder="name@company.com" maxLength={255} required /></label>
              <label>Mật khẩu<input type="password" autoComplete="new-password" value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} placeholder="Tối thiểu 8 ký tự" minLength={8} maxLength={128} required /></label>
              <div className="form-row">
                <label>Vai trò<select value={registration.role} onChange={(event) => setRegistration({ ...registration, role: event.target.value as Role })}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                <label>Phòng ban<input type="text" value={registration.department} onChange={(event) => setRegistration({ ...registration, department: event.target.value })} placeholder="Kỹ thuật" maxLength={100} required /></label>
              </div>
              <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}</button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
