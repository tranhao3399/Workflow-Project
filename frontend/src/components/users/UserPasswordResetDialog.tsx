import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { resetUserPassword } from '../../services/administration.service'
import type { User } from '../../types/administration'
import { passwordPolicyError } from '../../utils/password-policy'

interface UserPasswordResetDialogProps {
  userId: string
  email: string
  onClose: () => void
  onSuccess: (user: User) => void
}

interface PasswordResetForm {
  newPassword: string
  confirmPassword: string
}

interface PasswordResetErrors {
  newPassword?: string
  confirmPassword?: string
}

const emptyForm: PasswordResetForm = { newPassword: '', confirmPassword: '' }

export function UserPasswordResetDialog({ userId, email, onClose, onSuccess }: UserPasswordResetDialogProps) {
  const [form, setForm] = useState<PasswordResetForm>(emptyForm)
  const [errors, setErrors] = useState<PasswordResetErrors>({})
  const [requestError, setRequestError] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const newPasswordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    newPasswordRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isSubmitting, onClose])

  function validate(): PasswordResetErrors {
    const nextErrors: PasswordResetErrors = {}
    if (!form.newPassword) nextErrors.newPassword = 'Mật khẩu mới không được để trống.'
    else nextErrors.newPassword = passwordPolicyError(form.newPassword)
    if (!form.confirmPassword) nextErrors.confirmPassword = 'Xác nhận mật khẩu mới không được để trống.'
    else if (form.confirmPassword !== form.newPassword) nextErrors.confirmPassword = 'Xác nhận mật khẩu mới không khớp.'
    return nextErrors
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    const nextErrors = validate()
    if (nextErrors.newPassword || nextErrors.confirmPassword) {
      setErrors(nextErrors)
      window.requestAnimationFrame(() => {
        if (nextErrors.newPassword) newPasswordRef.current?.focus()
        else confirmPasswordRef.current?.focus()
      })
      return
    }

    setIsSubmitting(true)
    setRequestError('')
    try {
      onSuccess(await resetUserPassword(userId, form.newPassword))
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Không thể đặt lại mật khẩu. Vui lòng thử lại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onClose() }}>
    <section className="modal-panel my-account-password-modal user-password-reset-modal" role="dialog" aria-modal="true" aria-labelledby="reset-user-password-title">
      <header className="modal-header"><div><h2 id="reset-user-password-title">Đặt lại mật khẩu</h2><p>Đặt mật khẩu mới cho tài khoản {email}.</p></div><button className="icon-close" type="button" aria-label="Đóng" onClick={onClose} disabled={isSubmitting}>×</button></header>
      <form className="editor-form" onSubmit={(event) => void submit(event)} noValidate>
        <label>Mật khẩu mới<div className="password-input-control"><input ref={newPasswordRef} type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" value={form.newPassword} onChange={(event) => { const newPassword = event.target.value; setForm((current) => ({ ...current, newPassword })); setErrors((current) => ({ ...current, newPassword: undefined, ...(form.confirmPassword ? { confirmPassword: undefined } : {}) })); setRequestError('') }} onBlur={() => setErrors((current) => ({ ...current, newPassword: form.newPassword ? passwordPolicyError(form.newPassword) : 'Mật khẩu mới không được để trống.' }))} aria-invalid={Boolean(errors.newPassword)} aria-describedby={errors.newPassword ? 'reset-user-password-error' : undefined} disabled={isSubmitting} minLength={8} maxLength={128} required /><button className="password-visibility-button" type="button" aria-label={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'} title={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'} aria-pressed={showNewPassword} onClick={() => setShowNewPassword((shown) => !shown)} disabled={isSubmitting}>{showNewPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>{errors.newPassword && <small className="field-error" id="reset-user-password-error" role="alert">{errors.newPassword}</small>}</label>
        <label>Xác nhận mật khẩu mới<div className="password-input-control"><input ref={confirmPasswordRef} type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => { const confirmPassword = event.target.value; setForm((current) => ({ ...current, confirmPassword })); setErrors((current) => ({ ...current, confirmPassword: undefined })); setRequestError('') }} onBlur={() => setErrors((current) => ({ ...current, confirmPassword: !form.confirmPassword ? 'Xác nhận mật khẩu mới không được để trống.' : form.confirmPassword !== form.newPassword ? 'Xác nhận mật khẩu mới không khớp.' : undefined }))} aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'reset-user-confirm-password-error' : undefined} disabled={isSubmitting} minLength={8} maxLength={128} required /><button className="password-visibility-button" type="button" aria-label={showConfirmPassword ? 'Ẩn xác nhận mật khẩu mới' : 'Hiện xác nhận mật khẩu mới'} title={showConfirmPassword ? 'Ẩn xác nhận mật khẩu mới' : 'Hiện xác nhận mật khẩu mới'} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword((shown) => !shown)} disabled={isSubmitting}>{showConfirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>{errors.confirmPassword && <small className="field-error" id="reset-user-confirm-password-error" role="alert">{errors.confirmPassword}</small>}</label>
        {requestError && <p className="my-account-form-error" role="alert">{requestError}</p>}
        <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={isSubmitting}>Hủy</button><button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}</button></div>
      </form>
    </section>
  </div>
}
