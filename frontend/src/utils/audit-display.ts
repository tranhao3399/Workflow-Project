export interface AuditActorDisplay {
  userId?: string
  fullName?: string
  employeeCode?: string
  rolesAtTime?: string[]
}

export interface AuditChangesDisplay {
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export interface AuditFieldDisplay {
  key: string
  label: string
  format?: (value: unknown) => string
}

export function auditActorLabel(actor: AuditActorDisplay, currentUserId: string): string {
  if (actor.userId && actor.userId === currentUserId) return 'Bạn'
  if (actor.fullName) return actor.employeeCode ? `${actor.fullName} (${actor.employeeCode})` : actor.fullName
  return actor.rolesAtTime?.includes('ADMIN') ? 'Quản trị viên' : actor.userId ? 'Người dùng hệ thống' : 'Hệ thống'
}

export function auditValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Chưa cập nhật'
  if (typeof value === 'string') return `“${value}”`
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  return 'Đã cập nhật'
}

export function auditChangeDetails(changes: AuditChangesDisplay | undefined, fields: AuditFieldDisplay[]): string[] {
  if (!changes?.before || !changes.after) return []
  return fields.flatMap((field) => {
    const before = changes.before?.[field.key]
    const after = changes.after?.[field.key]
    if (Object.is(before, after)) return []
    const format = field.format ?? auditValue
    return [`${field.label}: ${format(before)} → ${format(after)}`]
  })
}
