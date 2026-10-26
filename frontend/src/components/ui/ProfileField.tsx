import { cloneElement, isValidElement, type InputHTMLAttributes, type ReactNode } from 'react'

interface ProfileFieldProps {
  label: string
  value?: ReactNode
  editControl?: ReactNode
  isEditing: boolean
  required?: boolean
  showRequiredError?: boolean
  emptyValue?: string
  error?: string
}

/** Displays static profile data until the surrounding page explicitly enters edit mode. */
export function ProfileField({ label, value, editControl, isEditing, required = false, showRequiredError = true, emptyValue = 'Chưa cập nhật', error }: ProfileFieldProps) {
  const isRequiredEmpty = Boolean(
    required
    && showRequiredError
    && isEditing
    && isValidElement<{ value?: unknown }>(editControl)
    && typeof editControl.props.value === 'string'
    && !editControl.props.value.trim(),
  )
  const displayedLabel = label === 'Email công việc' ? 'Email' : label
  const displayedError = error ?? (isRequiredEmpty ? `${displayedLabel} không được để trống.` : undefined)
  const control = isValidElement<InputHTMLAttributes<HTMLInputElement>>(editControl) && editControl.type === 'input'
    ? cloneElement(editControl, { 'aria-invalid': Boolean(displayedError) })
    : editControl

  return (
    <div className="profile-field">
      <span className={isEditing && required ? 'profile-field-label required-field-label' : 'profile-field-label'}>{displayedLabel}</span>
      {isEditing && editControl ? (
        <div className="profile-field-control">{control}{displayedError && <small className="profile-field-error" role="alert">{displayedError}</small>}</div>
      ) : (
        <div className="profile-field-value">{value || emptyValue}</div>
      )}
    </div>
  )
}
