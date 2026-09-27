import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestWithContext } from '../../common/http/request-context.interface.js';
import { UserRole } from '../../users/enums/user-role.enum.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const isAdmin = request.user?.role === UserRole.ADMIN || request.user?.roles.includes(UserRole.ADMIN) === true;
    if (!isAdmin) throw new ForbiddenException('Chỉ quản trị viên mới có quyền thực hiện chức năng này.');
    return true;
  }
}
