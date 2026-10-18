export interface PermissionSubject { permissionKeys?: readonly string[] }

function keysFrom(subject: PermissionSubject | readonly string[]): readonly string[] {
  if (Array.isArray(subject)) return subject
  return (subject as PermissionSubject).permissionKeys ?? []
}

export function hasPermission(subject: PermissionSubject | readonly string[], permission: string): boolean {
  return keysFrom(subject).includes(permission)
}

export function hasAllPermissions(subject: PermissionSubject | readonly string[], permissions: readonly string[]): boolean {
  const granted = new Set(keysFrom(subject))
  return permissions.every((permission) => granted.has(permission))
}

export function hasAnyPermission(subject: PermissionSubject | readonly string[], permissions: readonly string[]): boolean {
  const granted = new Set(keysFrom(subject))
  return permissions.some((permission) => granted.has(permission))
}
