import type { ReactNode } from 'react'

interface ProfileFieldProps {
  label: string
  value?: ReactNode
  editControl?: ReactNode
  isEditing: boolean
  emptyValue?: string
}

/** Displays static profile data until the surrounding page explicitly enters edit mode. */
export function ProfileField({ label, value, editControl, isEditing, emptyValue = 'Chưa cập nhật' }: ProfileFieldProps) {
  return (
    <div className="profile-field">
      <span className="profile-field-label">{label}</span>
      {isEditing && editControl ? (
        <div className="profile-field-control">{editControl}</div>
      ) : (
        <div className="profile-field-value">{value || emptyValue}</div>
      )}
    </div>
  )
}
