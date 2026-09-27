import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestWithContext } from '../../common/http/request-context.interface.js';

/**
 * Complements ROLE.UPDATE for the shared PATCH endpoint without changing its
 * public contract. Updating permissions or status requires the narrower,
 * additional permissions as well.
 */
@Injectable()
export class RoleUpdatePermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const input = request.body as Record<string, unknown> | undefined;
    const permissions = new Set(request.effectivePermissionKeys ?? []);

    if (this.hasProperty(input, 'permissionKeys') && !permissions.has('ROLE.MANAGE_PERMISSIONS')) {
      throw new ForbiddenException('Bạn không có quyền quản lý quyền truy cập của vai trò.');
    }
    if (this.hasProperty(input, 'isActive') && !permissions.has('ROLE.CHANGE_STATUS')) {
      throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái vai trò.');
    }
    return true;
  }

  private hasProperty(value: Record<string, unknown> | undefined, property: string): boolean {
    return value !== undefined && Object.prototype.hasOwnProperty.call(value, property);
  }
}
