import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'workflow:required-permissions';
export const BODY_PERMISSIONS_KEY = 'workflow:body-permissions';

export type PermissionRequirement =
  | string
  | { all: readonly string[] }
  | { any: readonly string[] };

export function RequirePermissions(...requirements: PermissionRequirement[]) {
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, requirements);
}

export function RequireBodyPermissions(requirements: Readonly<Record<string, PermissionRequirement>>) {
  return SetMetadata(BODY_PERMISSIONS_KEY, requirements);
}
