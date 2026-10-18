import { useEffect, useRef, useState } from 'react'
import { changeOwnPassword } from '../services/auth.service'
import { resolveApiAssetUrl } from '../services/api-client'
import type { AuthUser } from '../types/auth'
import { formatRole } from '../utils/formatters'
import { ActiveStatusBadge } from './ui/MasterDataStatusBadge'
import { ProfileField } from './ui/ProfileField'
import { SurfaceCard } from './ui/SurfaceCard'

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

const emptyPasswordForm: PasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' }

function firstInitial(fullName: string): string {
  return fullName.trim().charAt(0).toUpperCase() || 'U'
}

export function MyAccountPage({ user, onBack, onPasswordChanged }: Props) {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [form, setForm] = useState<PasswordForm>(emptyPasswordForm)
  const [showPasswords, setShowPasswords] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const currentPasswordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isPasswordDialogOpen) return
    currentPasswordRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        setIsPasswordDialogOpen(false)
        setForm(emptyPasswordForm)
        setError('')
        setShowPasswords(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isPasswordDialogOpen, isSaving])

  function closePasswordDialog() {
    if (isSaving) return
    setIsPasswordDialogOpen(false)
    setForm(emptyPasswordForm)
    setError('')
    setShowPasswords(false)
  }

  function updateField(key: keyof PasswordForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  async function submitPasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      setError('Xác nhận mật khẩu mới không khớp.')
      return
    }
    if (form.newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.')
      return
    }

    setIsSaving(true)
    try {
      const result = await changeOwnPassword(form.currentPassword, form.newPassword, form.confirmPassword)
      onPasswordChanged(result.message)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể đổi mật khẩu. Vui lòng thử lại.')
    } finally {
      setIsSaving(false)
    }
  }

  const roles = user.roles?.length ? user.roles : [user.role]
  const avatar = user.avatarUrl
    ? <img className="my-account-avatar" src={resolveApiAssetUrl(user.avatarUrl)} alt={`Ảnh đại diện ${user.fullName}`} />
    : <span className="my-account-avatar my-account-avatar-fallback" aria-hidden="true">{firstInitial(user.fullName)}</span>

  return <>
    <nav className="detail-breadcrumb"><button className="breadcrumb-link" type="button" onClick={onBack}>Tài khoản của tôi</button></nav>
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
    {isPasswordDialogOpen && <div className="modal-backdrop" role="presentation"><section className="modal-panel my-account-password-modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title"><header className="modal-header"><div><p className="state-kicker">BẢO MẬT TÀI KHOẢN</p><h2 id="change-password-title">Đổi mật khẩu</h2></div><button className="icon-close" type="button" aria-label="Đóng" onClick={closePasswordDialog} disabled={isSaving}>×</button></header><form className="editor-form" onSubmit={(event) => void submitPasswordChange(event)}><label>Mật khẩu hiện tại<div className="password-input-control"><input ref={currentPasswordRef} type={showPasswords ? 'text' : 'password'} autoComplete="current-password" value={form.currentPassword} onChange={(event) => updateField('currentPassword', event.target.value)} disabled={isSaving} required /><button className="password-visibility-button" type="button" onClick={() => setShowPasswords((current) => !current)} disabled={isSaving}>{showPasswords ? 'Ẩn' : 'Hiện'}</button></div></label><label>Mật khẩu mới<input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" value={form.newPassword} onChange={(event) => updateField('newPassword', event.target.value)} disabled={isSaving} minLength={8} required /></label><label>Xác nhận mật khẩu mới<input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} disabled={isSaving} minLength={8} required /></label>{error && <p className="my-account-form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={closePasswordDialog} disabled={isSaving}>Hủy</button><button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Đang đổi mật khẩu...' : 'Đổi mật khẩu'}</button></div></form></section></div>}
  </>
}
