import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectConnection } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import type { RequestWithContext } from '../http/request-context.interface.js';
import { Role } from '../../roles/schemas/role.schema.js';
import { User } from '../../users/schemas/user.schema.js';
import { BODY_PERMISSIONS_KEY, PermissionRequirement, REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirements = this.reflector.getAllAndOverride<PermissionRequirement[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const bodyRequirements = this.reflector.getAllAndOverride<Readonly<Record<string, PermissionRequirement>>>(BODY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirements?.length && !bodyRequirements) return true;

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const userId = request.user?.id;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw new ForbiddenException('Không thể xác định tài khoản thực hiện thao tác.');
    }

    const users = this.connection.model<User>(User.name);
    const roles = this.connection.model<Role>(Role.name);
    const user = await users.findById(userId).select({ _id: 1, isActive: 1, roleIds: 1 }).lean().exec();
    if (!user) throw new ForbiddenException('Tài khoản không tồn tại.');
    if (!user.isActive) throw new ForbiddenException('Tài khoản đã ngưng hoạt động.');

    const roleIds = [...new Set((user.roleIds ?? []).map((roleId) => roleId.toString()))];
    if (!roleIds.length) throw new ForbiddenException('Tài khoản chưa được gán vai trò hợp lệ.');

    const assignedRoles = await roles.find({ _id: { $in: roleIds }, isActive: true }).select({ permissionKeys: 1 }).lean().exec();
    const effectivePermissions = new Set(assignedRoles.flatMap((role) => role.permissionKeys ?? []));
    request.effectivePermissionKeys = [...effectivePermissions];

    const allowed = (requirements ?? []).every((requirement) => this.matchesRequirement(requirement, effectivePermissions));
    const body = request.body;
    const allowsBody = !bodyRequirements || !this.isRecord(body) || Object.entries(bodyRequirements)
      .filter(([property]) => Object.prototype.hasOwnProperty.call(body, property))
      .every(([, requirement]) => this.matchesRequirement(requirement, effectivePermissions));

    if (!allowed || !allowsBody) throw new ForbiddenException('Bạn không có quyền thực hiện chức năng này.');
    return true;
  }

  private matchesRequirement(requirement: PermissionRequirement, effectivePermissions: Set<string>): boolean {
    if (typeof requirement === 'string') return effectivePermissions.has(requirement);
    if ('all' in requirement) return requirement.all.every((permission) => effectivePermissions.has(permission));
    return requirement.any.some((permission) => effectivePermissions.has(permission));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
