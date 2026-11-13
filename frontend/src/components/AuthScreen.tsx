import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useMotionTokens, useShouldReduceMotion } from '@animate-ui/react/utils/motion'
import { CircleAlert, Eye, EyeOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { ApiError } from '../services/api-client'
import { login, requestPasswordReset, resetForgottenPassword, verifyPasswordResetOtp } from '../services/auth.service'
import type { AuthUser } from '../types/auth'
import { passwordPolicyError } from '../utils/password-policy'
import { AuthLayout } from './ui/AuthLayout'

type AuthView = 'login' | 'request-reset' | 'verify-reset' | 'reset-password'

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void
  onPasswordReset: () => void
}

interface ResetPasswordErrors {
  newPassword?: string
  confirmPassword?: string
}

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof TypeError) return 'Không thể kết nối với máy chủ. Vui lòng thử lại.'
  return fallback
}

function formatCooldown(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  const separatorIndex = normalized.lastIndexOf('@')
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) return '***'
  const localPart = normalized.slice(0, separatorIndex)
  const domain = normalized.slice(separatorIndex)
  const visibleLength = Math.min(3, Math.max(1, localPart.length - 1))
  return `${localPart.slice(0, visibleLength)}***${domain}`
}

const EMPTY_OTP = ['', '', '', '', '', '']

function nextResendDeadline(retryAfterSeconds: number): number {
  return Date.now() + Math.max(0, retryAfterSeconds) * 1000
}

export function AuthScreen({ onAuthenticated, onPasswordReset }: AuthScreenProps) {
  const shouldReduceMotion = useShouldReduceMotion()
  const { transition } = useMotionTokens()
  const [view, setView] = useState<AuthView>('login')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [otpDigits, setOtpDigits] = useState<string[]>([...EMPTY_OTP])
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetPasswordErrors, setResetPasswordErrors] = useState<ResetPasswordErrors>({})
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [cooldownNow, setCooldownNow] = useState(0)
  const [resendLocked, setResendLocked] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const otpInputs = useRef<Array<HTMLInputElement | null>>([])
  const newPasswordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)
  const otpReady = otpDigits.every((digit) => /^[0-9]$/.test(digit))
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - cooldownNow) / 1000))

  useEffect(() => {
    if (!cooldownUntil) return
    const update = () => {
      const now = Date.now()
      setCooldownNow(now)
      if (now >= cooldownUntil) {
        setCooldownUntil(0)
        setResendLocked(false)
      }
    }
    const timer = window.setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [cooldownUntil])

  useEffect(() => {
    if (view === 'verify-reset') otpInputs.current[0]?.focus()
    if (view === 'reset-password') newPasswordRef.current?.focus()
  }, [view])

  useEffect(() => {
    if (view !== 'request-reset' || !error) return
    const timeoutId = window.setTimeout(() => setError(''), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [error, view])

  function beginSubmit(): boolean {
    if (submittingRef.current) return false
    submittingRef.current = true
    setIsSubmitting(true)
    return true
  }

  function endSubmit() {
    submittingRef.current = false
    setIsSubmitting(false)
  }

  function openPasswordReset() {
    setResetEmail(loginForm.email)
    setView('request-reset')
    setNotice('')
    setError('')
  }

  function returnToLogin() {
    setView('login')
    setOtpDigits([...EMPTY_OTP])
    setResetToken('')
    setNewPassword('')
    setConfirmPassword('')
    setResetPasswordErrors({})
    setShowNewPassword(false)
    setShowConfirmPassword(false)
    setNotice('')
    setError('')
  }

  function focusOtp(index: number) {
    otpInputs.current[index]?.focus()
    otpInputs.current[index]?.select()
  }

  function fillOtp(index: number, value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    if (!digits) return
    const start = digits.length === 6 ? 0 : index
    setOtpDigits((current) => {
      const next = [...current]
      for (let offset = 0; offset < digits.length && start + offset < 6; offset += 1) {
        next[start + offset] = digits[offset]
      }
      return next
    })
    setError('')
    focusOtp(Math.min(5, start + digits.length))
  }

  function handleOtpChange(index: number, value: string) {
    if (!value) {
      setOtpDigits((current) => current.map((digit, position) => position === index ? '' : digit))
      setError('')
      return
    }
    fillOtp(index, value)
  }

  function handleOtpKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
      event.preventDefault()
      focusOtp(index - 1)
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusOtp(index - 1)
    } else if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault()
      focusOtp(index + 1)
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!beginSubmit()) return
    setError('')
    try {
      onAuthenticated(await login(loginForm))
    } catch (requestError) {
      setError(messageFrom(requestError, 'Đăng nhập thất bại.'))
    } finally {
      endSubmit()
    }
  }

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!beginSubmit()) return
    setError('')
    try {
      const result = await requestPasswordReset(resetEmail.trim())
      setOtpDigits([...EMPTY_OTP])
      const deadline = nextResendDeadline(result.retryAfterSeconds)
      setCooldownNow(deadline - Math.max(0, result.retryAfterSeconds) * 1000)
      setCooldownUntil(deadline)
      setResendLocked(result.resendLocked)
      if (result.canVerifyOtp) {
        setNotice(result.message)
        setView('verify-reset')
      } else {
        setNotice('')
        setError(result.message)
      }
    } catch (requestError) {
      setError(messageFrom(requestError, 'Không thể gửi mã xác minh. Vui lòng thử lại.'))
    } finally {
      endSubmit()
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!otpReady || !beginSubmit()) return
    setError('')
    try {
      const result = await verifyPasswordResetOtp(resetEmail.trim(), otpDigits.join(''))
      setResetToken(result.resetToken)
      setNotice('')
      setView('reset-password')
    } catch (requestError) {
      setError(messageFrom(requestError, 'Mã xác minh không hợp lệ.'))
      focusOtp(0)
    } finally {
      endSubmit()
    }
  }

  async function resendOtp() {
    if (cooldown || !beginSubmit()) return
    setError('')
    setNotice('')
    try {
      const result = await requestPasswordReset(resetEmail.trim())
      setNotice(result.message)
      setOtpDigits([...EMPTY_OTP])
      const deadline = nextResendDeadline(result.retryAfterSeconds)
      setCooldownNow(deadline - Math.max(0, result.retryAfterSeconds) * 1000)
      setCooldownUntil(deadline)
      setResendLocked(result.resendLocked)
      if (!result.canVerifyOtp) {
        setNotice('')
        setError(result.message)
        setView('request-reset')
        return
      }
      focusOtp(0)
    } catch (requestError) {
      setError(messageFrom(requestError, 'Không thể gửi lại mã xác minh. Vui lòng thử lại.'))
    } finally {
      endSubmit()
    }
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: ResetPasswordErrors = {
      newPassword: newPassword ? passwordPolicyError(newPassword) : 'Mật khẩu mới không được để trống.',
      confirmPassword: !confirmPassword
        ? 'Xác nhận mật khẩu mới không được để trống.'
        : confirmPassword !== newPassword
          ? 'Xác nhận mật khẩu mới không khớp.'
          : undefined,
    }
    if (nextErrors.newPassword || nextErrors.confirmPassword) {
      setResetPasswordErrors(nextErrors)
      window.requestAnimationFrame(() => {
        if (nextErrors.newPassword) newPasswordRef.current?.focus()
        else confirmPasswordRef.current?.focus()
      })
      return
    }
    if (!resetToken) {
      setView('verify-reset')
      setError('Vui lòng xác minh mã trước khi đặt lại mật khẩu.')
      return
    }
    if (!beginSubmit()) return
    setError('')
    try {
      await resetForgottenPassword(resetToken, newPassword, confirmPassword)
      returnToLogin()
      onPasswordReset()
    } catch (requestError) {
      setError(messageFrom(requestError, 'Không thể đặt lại mật khẩu. Vui lòng thử lại.'))
    } finally {
      endSubmit()
    }
  }

  const heading = view === 'login'
    ? { title: 'Đăng nhập', description: null }
    : view === 'request-reset'
      ? { title: 'Khôi phục mật khẩu', description: 'Nhập email để nhận mã xác minh.' }
      : view === 'verify-reset'
        ? {
            title: 'Xác minh mã',
            description: <span className="auth-verification-description">Mã xác minh đã được gửi đến <em>{maskEmail(resetEmail)}</em>.</span>,
          }
        : { title: 'Đặt lại mật khẩu', description: 'Tạo mật khẩu mới để đăng nhập lại vào hệ thống.' }

  return <AuthLayout title={heading.title} description={heading.description}>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        className="auth-view-transition"
        key={view}
        initial={shouldReduceMotion ? false : { opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0, x: -6 }}
        transition={shouldReduceMotion ? { duration: 0 } : transition.fade}
      >
    {notice && view !== 'verify-reset' && <p className="feedback feedback-info" role="status">{notice}</p>}
    {error && view === 'reset-password' && <p className="feedback feedback-error" role="alert">{error}</p>}
    {error && view === 'request-reset' && <div className="auth-reset-alert" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></div>}

    {view === 'login' && <form className="auth-form" onSubmit={submitLogin}>
      <label htmlFor="auth-email">Email</label>
      <input id="auth-email" type="email" autoComplete="email" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} placeholder="name@company.com" required />
      <label htmlFor="auth-password">Mật khẩu</label>
      <div className="auth-password-field">
        <input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} placeholder="Nhập mật khẩu" minLength={8} required />
        <button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
      </div>
      <div className="auth-feedback-slot" aria-live="polite">{error && <p className="auth-inline-error" role="alert">{error}</p>}</div>
      <button className="auth-link-button auth-forgot-link" type="button" onClick={openPasswordReset} disabled={isSubmitting}>Quên mật khẩu?</button>
      <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
    </form>}

    {view === 'request-reset' && <form className="auth-form" onSubmit={sendOtp}>
      <label htmlFor="reset-email">Email</label>
      <input id="reset-email" type="email" autoComplete="email" value={resetEmail} onChange={(event) => { setResetEmail(event.target.value); setOtpDigits([...EMPTY_OTP]); setNotice(''); setError('') }} placeholder="name@company.com" required />
      <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang gửi...' : 'Gửi mã xác minh'}</button>
      <button className="auth-link-button auth-back-button" type="button" onClick={returnToLogin} disabled={isSubmitting}>Quay lại đăng nhập</button>
    </form>}

    {view === 'verify-reset' && <form className="auth-form" onSubmit={verifyOtp}>
      <div className="auth-otp-field" role="group" aria-labelledby="otp-label" aria-describedby="otp-error">
        <span id="otp-label" className="auth-field-label">Mã xác minh</span>
        <div className="auth-otp-inputs">
          {otpDigits.map((digit, index) => <input
            key={index}
            ref={(input) => { otpInputs.current[index] = input }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={6}
            value={digit}
            aria-label={`Chữ số ${index + 1} của mã xác minh`}
            aria-invalid={Boolean(error)}
            onFocus={(event) => event.target.select()}
            onChange={(event) => handleOtpChange(index, event.target.value)}
            onPaste={(event) => { event.preventDefault(); fillOtp(index, event.clipboardData.getData('text')) }}
            onKeyDown={(event) => handleOtpKeyDown(event, index)}
          />)}
        </div>
        <div id="otp-error" className="auth-feedback-slot" aria-live="polite">{error && <p className="auth-inline-error" role="alert">{error}</p>}</div>
      </div>
      <button className="primary-button auth-submit" type="submit" disabled={!otpReady || isSubmitting}>{isSubmitting ? 'Đang xác minh...' : 'Xác minh mã'}</button>
      <button className="auth-link-button auth-resend-button" type="button" onClick={() => void resendOtp()} disabled={Boolean(cooldown) || isSubmitting}>{cooldown ? `${resendLocked ? 'Yêu cầu mã mới' : 'Gửi lại mã'} sau ${formatCooldown(cooldown)}` : 'Gửi lại mã'}</button>
      <button className="auth-link-button auth-back-button" type="button" onClick={returnToLogin} disabled={isSubmitting}>Quay lại đăng nhập</button>
    </form>}

    {view === 'reset-password' && <form className="auth-form" onSubmit={submitNewPassword} noValidate>
      <label htmlFor="new-password">Mật khẩu mới</label>
      <div className="auth-password-field">
        <input ref={newPasswordRef} id="new-password" type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setResetPasswordErrors((current) => ({ ...current, newPassword: undefined, ...(confirmPassword ? { confirmPassword: undefined } : {}) })); setError('') }} onBlur={() => setResetPasswordErrors((current) => ({ ...current, newPassword: newPassword ? passwordPolicyError(newPassword) : 'Mật khẩu mới không được để trống.' }))} placeholder="Tối thiểu 8 ký tự" minLength={8} maxLength={128} aria-invalid={Boolean(resetPasswordErrors.newPassword)} aria-describedby={resetPasswordErrors.newPassword ? 'forgot-new-password-error' : undefined} required />
        <button type="button" className="auth-password-toggle" aria-label={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'} title={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'} aria-pressed={showNewPassword} onClick={() => setShowNewPassword((shown) => !shown)}>{showNewPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
      </div>
      {resetPasswordErrors.newPassword && <small className="field-error auth-password-error" id="forgot-new-password-error" role="alert">{resetPasswordErrors.newPassword}</small>}
      <label htmlFor="confirm-password">Xác nhận mật khẩu mới</label>
      <div className="auth-password-field">
        <input ref={confirmPasswordRef} id="confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setResetPasswordErrors((current) => ({ ...current, confirmPassword: undefined })); setError('') }} onBlur={() => setResetPasswordErrors((current) => ({ ...current, confirmPassword: !confirmPassword ? 'Xác nhận mật khẩu mới không được để trống.' : confirmPassword !== newPassword ? 'Xác nhận mật khẩu mới không khớp.' : undefined }))} placeholder="Nhập lại mật khẩu mới" minLength={8} maxLength={128} aria-invalid={Boolean(resetPasswordErrors.confirmPassword)} aria-describedby={resetPasswordErrors.confirmPassword ? 'forgot-confirm-password-error' : undefined} required />
        <button type="button" className="auth-password-toggle" aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'} title={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword((shown) => !shown)}>{showConfirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
      </div>
      {resetPasswordErrors.confirmPassword && <small className="field-error auth-password-error" id="forgot-confirm-password-error" role="alert">{resetPasswordErrors.confirmPassword}</small>}
      <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang lưu...' : 'Đặt lại mật khẩu'}</button>
      <button className="auth-link-button auth-back-button" type="button" onClick={returnToLogin} disabled={isSubmitting}>Hủy</button>
    </form>}
      </motion.div>
    </AnimatePresence>
  </AuthLayout>
}
