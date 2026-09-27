import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../services/api-client'
import { login, register } from '../services/auth.service'
import type { AuthUser, RegisterInput, UserRole } from '../types/auth'
import { formatRole } from '../utils/formatters'
import { FilterSelect } from './ui/FilterSelect'

type AuthMode = 'login' | 'register'

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void
}

const registrationDefaults: RegisterInput = {
  fullName: '',
  email: '',
  password: '',
  role: 'EMPLOYEE',
  department: '',
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registration, setRegistration] = useState(registrationDefaults)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      onAuthenticated(await login(loginForm))
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Đăng nhập thất bại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await register(registration)
      setLoginForm({ email: registration.email, password: registration.password })
      setRegistration(registrationDefaults)
      setMode('login')
      setNotice('Tài khoản đã được tạo. Hãy đăng nhập để tiếp tục.')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Đăng ký thất bại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro" aria-labelledby="auth-product-title">
        <div className="auth-brand"><span className="logo-mark">W</span><span>WorkFlow ERP</span></div>
        <div className="intro-copy">
          <p className="eyebrow">WORKFLOW OPERATIONS</p>
          <h1 id="auth-product-title">Mọi yêu cầu, đúng quy trình.</h1>
          <p>Không gian làm việc tập trung cho tạo phiếu, phê duyệt và vận hành nội bộ.</p>
        </div>
        <p className="auth-footer">Hệ thống vận hành nội bộ</p>
      </section>
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-form-wrap">
          <div className="mode-tabs" role="tablist" aria-label="Xác thực tài khoản">
            <button className={mode === 'login' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>Đăng nhập</button>
            <button className={mode === 'register' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>Đăng ký</button>
          </div>
          <div className="auth-heading">
            <h2 id="auth-title">{mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản'}</h2>
            <p>{mode === 'login' ? 'Sử dụng email công việc để tiếp tục.' : 'Thông tin sẽ được dùng để tạo tài khoản nhân viên.'}</p>
          </div>
          {notice && <p className="feedback feedback-success" role="status">{notice}</p>}
          {error && <p className="feedback feedback-error" role="alert">{error}</p>}
          {mode === 'login' ? (
            <form className="auth-form" onSubmit={submitLogin}>
              <label>Email công việc<input type="email" autoComplete="email" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} placeholder="name@company.com" required /></label>
              <label>Mật khẩu<input type="password" autoComplete="current-password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} placeholder="Tối thiểu 8 ký tự" minLength={8} required /></label>
              <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={submitRegistration}>
              <label>Họ và tên<input type="text" autoComplete="name" value={registration.fullName} onChange={(event) => setRegistration({ ...registration, fullName: event.target.value })} placeholder="Nguyễn Văn An" maxLength={100} required /></label>
              <label>Email công việc<input type="email" autoComplete="email" value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} placeholder="name@company.com" maxLength={255} required /></label>
              <label>Mật khẩu<input type="password" autoComplete="new-password" value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} placeholder="Tối thiểu 8 ký tự" minLength={8} maxLength={128} required /></label>
              <div className="auth-form-row">
                <label>Vai trò<FilterSelect ariaLabel="Chọn vai trò" value={registration.role} options={(['EMPLOYEE', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR', 'ADMIN'] as const).map((role) => ({ value: role, label: formatRole(role) }))} onChange={(role) => setRegistration({ ...registration, role: role as UserRole })} /></label>
                <label>Phòng ban<input type="text" value={registration.department} onChange={(event) => setRegistration({ ...registration, department: event.target.value })} placeholder="Khối Kỹ thuật" maxLength={100} required /></label>
              </div>
              <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}</button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
