import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { changeOwnPassword } from '../services/auth.service'
import { resolveApiAssetUrl } from '../services/api-client'
import type { AuthUser } from '../types/auth'
import { formatRole } from '../utils/formatters'
import { ActiveStatusBadge } from './ui/MasterDataStatusBadge'
import { ProfileField } from './ui/ProfileField'
import { SurfaceCard } from './ui/SurfaceCard'
import { passwordPolicyError } from '../utils/password-policy'

interface Props {
  user: AuthUser
  onBack: () => void
  onPasswordChanged: (message: string) => void
}

interface PasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

interface PasswordFormErrors {
  currentPassword?: string
  newPassword?: string
  confirmPassword?: string
}

const emptyPasswordForm: PasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

function currentPasswordError(password: string): string | undefined {
  if (!password) return 'Mật khẩu hiện tại không được để trống.'
  if (password.length < 8 || password.length > 128) return 'Mật khẩu hiện tại phải có từ 8 đến 128 ký tự.'
  return undefined
}

function confirmPasswordError(confirmPassword: string, newPassword: string): string | undefined {
  if (!confirmPassword) return 'Xác nhận mật khẩu mới không được để trống.'
  if (confirmPassword !== newPassword) return 'Xác nhận mật khẩu mới không khớp.'
  return undefined
}

function firstInitial(fullName: string): string {
  return fullName.trim().charAt(0).toUpperCase() || 'U'
}

interface PasswordVisibilityButtonProps {
  disabled: boolean
  isVisible: boolean
  onToggle: () => void
  passwordLabel: string
}

function PasswordVisibilityButton({ disabled, isVisible, onToggle, passwordLabel }: PasswordVisibilityButtonProps) {
  const action = isVisible ? 'Ẩn' : 'Hiện'

  return <button
    className="password-visibility-button"
    type="button"
    aria-label={`${action} ${passwordLabel}`}
    title={`${action} ${passwordLabel}`}
    aria-pressed={isVisible}
    onClick={onToggle}
    disabled={disabled}
  >
    {isVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
  </button>
}

export function MyAccountPage({ user, onBack, onPasswordChanged }: Props) {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [form, setForm] = useState<PasswordForm>(emptyPasswordForm)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<PasswordFormErrors>({})
  const [requestError, setRequestError] = useState('')
  const currentPasswordRef = useRef<HTMLInputElement>(null)
  const newPasswordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isPasswordDialogOpen) return
    currentPasswordRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        setIsPasswordDialogOpen(false)
        setForm(emptyPasswordForm)
        setErrors({})
        setRequestError('')
        setShowCurrentPassword(false)
        setShowNewPassword(false)
        setShowConfirmPassword(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isPasswordDialogOpen, isSaving])

  function closePasswordDialog() {
    if (isSaving) return
    setIsPasswordDialogOpen(false)
    setForm(emptyPasswordForm)
    setErrors({})
    setRequestError('')
    setShowCurrentPassword(false)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  function updateField(key: keyof PasswordForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({
      ...current,
      [key]: undefined,
      ...(key === 'newPassword' && form.confirmPassword ? { confirmPassword: undefined } : {}),
    }))
    setRequestError('')
  }

  function validatePasswordForm(): PasswordFormErrors {
    return {
      currentPassword: currentPasswordError(form.currentPassword),
      newPassword: form.newPassword ? passwordPolicyError(form.newPassword) : 'Mật khẩu mới không được để trống.',
      confirmPassword: confirmPasswordError(form.confirmPassword, form.newPassword),
    }
  }

  async function submitPasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    const nextErrors = validatePasswordForm()
    if (nextErrors.currentPassword || nextErrors.newPassword || nextErrors.confirmPassword) {
      setErrors(nextErrors)
      window.requestAnimationFrame(() => {
        if (nextErrors.currentPassword) currentPasswordRef.current?.focus()
        else if (nextErrors.newPassword) newPasswordRef.current?.focus()
        else confirmPasswordRef.current?.focus()
      })
      return
    }

    setIsSaving(true)
    setRequestError('')
    try {
      const result = await changeOwnPassword(form.currentPassword, form.newPassword, form.confirmPassword)
      onPasswordChanged(result.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể đổi mật khẩu. Vui lòng thử lại.'
      if (message.toLocaleLowerCase('vi').includes('mật khẩu hiện tại')) {
        setErrors((current) => ({ ...current, currentPassword: message }))
        window.requestAnimationFrame(() => currentPasswordRef.current?.focus())
      } else if (message.toLocaleLowerCase('vi').includes('mật khẩu mới')) {
        setErrors((current) => ({ ...current, newPassword: message }))
        window.requestAnimationFrame(() => newPasswordRef.current?.focus())
      } else {
        setRequestError(message)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const roles = user.roles?.length ? user.roles : [user.role]
  const avatar = user.avatarUrl
    ? <img className="my-account-avatar" src={resolveApiAssetUrl(user.avatarUrl)} alt={`Ảnh đại diện ${user.fullName}`} />
    : <span className="my-account-avatar my-account-avatar-fallback" aria-hidden="true">{firstInitial(user.fullName)}</span>

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng tài khoản"><button className="breadcrumb-link" type="button" onClick={onBack}>Tổng quan</button><span aria-hidden="true">/</span><strong>Tài khoản của tôi</strong></nav>
    <section className="my-account-summary">
      <div className="my-account-summary-main">{avatar}<div><h1>{user.fullName}</h1><p>{user.email}</p></div></div>
      <button className="secondary-button" type="button" onClick={onBack}>← Quay lại</button>
    </section>
    <SurfaceCard className="my-account-information-card">
      <div className="my-account-card-heading"><h2>Thông tin tài khoản</h2></div>
      <div className="profile-field-grid">
        <ProfileField label="Email đăng nhập" value={user.email} isEditing={false} />
        <ProfileField label="Mã nhân viên" value={user.employeeCode ?? 'Chưa liên kết'} isEditing={false} />
        <ProfileField label="Họ và tên" value={user.fullName} isEditing={false} />
        <ProfileField label="Phòng ban" value={user.department || 'Chưa thiết lập'} isEditing={false} />
        <ProfileField label="Chức danh" value={user.position ?? 'Chưa thiết lập'} isEditing={false} />
        <ProfileField label="Vai trò" value={<span className="role-chip-list">{roles.map((role) => <span className="role-chip" key={role}>{formatRole(role)}</span>)}</span>} isEditing={false} />
        <ProfileField label="Trạng thái" value={<ActiveStatusBadge isActive={user.isActive} />} isEditing={false} />
      </div>
    </SurfaceCard>
    <SurfaceCard className="my-account-security-card">
      <div className="my-account-security-heading"><div><h2>Bảo mật</h2><p>Mật khẩu được bảo vệ và không hiển thị trong hệ thống.</p></div><button className="secondary-button" type="button" onClick={() => setIsPasswordDialogOpen(true)}>Đổi mật khẩu</button></div>
    </SurfaceCard>
    {isPasswordDialogOpen && <div className="modal-backdrop" role="presentation"><section className="modal-panel my-account-password-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title"><header className="modal-header"><div><h2 id="change-password-title">Đổi mật khẩu</h2></div><button className="icon-close" type="button" aria-label="Đóng" onClick={closePasswordDialog} disabled={isSaving}>×</button></header><form className="editor-form" onSubmit={(event) => void submitPasswordChange(event)} noValidate>
      <label>Mật khẩu hiện tại<div className="password-input-control"><input ref={currentPasswordRef} type={showCurrentPassword ? 'text' : 'password'} autoComplete="current-password" value={form.currentPassword} onChange={(event) => updateField('currentPassword', event.target.value)} onBlur={() => setErrors((current) => ({ ...current, currentPassword: currentPasswordError(form.currentPassword) }))} aria-invalid={Boolean(errors.currentPassword)} aria-describedby={errors.currentPassword ? 'change-current-password-error' : undefined} disabled={isSaving} minLength={8} maxLength={128} required /><PasswordVisibilityButton passwordLabel="mật khẩu hiện tại" isVisible={showCurrentPassword} onToggle={() => setShowCurrentPassword((current) => !current)} disabled={isSaving} /></div>{errors.currentPassword && <small className="field-error" id="change-current-password-error" role="alert">{errors.currentPassword}</small>}</label>
      <label>Mật khẩu mới<div className="password-input-control"><input ref={newPasswordRef} type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" value={form.newPassword} onChange={(event) => updateField('newPassword', event.target.value)} onBlur={() => setErrors((current) => ({ ...current, newPassword: form.newPassword ? passwordPolicyError(form.newPassword) : 'Mật khẩu mới không được để trống.' }))} aria-invalid={Boolean(errors.newPassword)} aria-describedby={errors.newPassword ? 'change-new-password-error' : undefined} disabled={isSaving} minLength={8} maxLength={128} required /><PasswordVisibilityButton passwordLabel="mật khẩu mới" isVisible={showNewPassword} onToggle={() => setShowNewPassword((current) => !current)} disabled={isSaving} /></div>{errors.newPassword && <small className="field-error" id="change-new-password-error" role="alert">{errors.newPassword}</small>}</label>
      <label>Xác nhận mật khẩu mới<div className="password-input-control"><input ref={confirmPasswordRef} type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} onBlur={() => setErrors((current) => ({ ...current, confirmPassword: confirmPasswordError(form.confirmPassword, form.newPassword) }))} aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'change-confirm-password-error' : undefined} disabled={isSaving} minLength={8} maxLength={128} required /><PasswordVisibilityButton passwordLabel="xác nhận mật khẩu mới" isVisible={showConfirmPassword} onToggle={() => setShowConfirmPassword((current) => !current)} disabled={isSaving} /></div>{errors.confirmPassword && <small className="field-error" id="change-confirm-password-error" role="alert">{errors.confirmPassword}</small>}</label>
      {requestError && <p className="my-account-form-error" role="alert">{requestError}</p>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={closePasswordDialog} disabled={isSaving}>Hủy</button><button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Đang đổi mật khẩu...' : 'Đổi mật khẩu'}</button></div>
    </form></section></div>}
  </>
}
