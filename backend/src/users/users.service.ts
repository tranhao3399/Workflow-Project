import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { CreateManagedUserDto } from './dto/create-managed-user.dto.js';
import { UpdateManagedUserDto } from './dto/update-managed-user.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { UserRole } from './enums/user-role.enum.js';
import { User, UserDocument } from './schemas/user.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { Role } from '../roles/schemas/role.schema.js';
import { UserSession } from '../auth/schemas/user-session.schema.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';

export interface SafeUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  department: string;
  isActive: boolean;
  employeeId?: string;
  roleIds?: string[];
  roleNames?: string[];
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  sessionId?: string;
}

export interface SafeUserWithPermissions extends SafeUser {
  permissionKeys: string[];
}

export interface CreateUserInput {
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  department: string;
  roles?: UserRole[];
  employeeId?: string;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<Employee>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(UserSession.name) private readonly userSessionModel: Model<UserSession>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    const role = await this.roleModel.findOne({ key: input.role, isActive: true }).select({ _id: 1 }).lean().exec();
    if (!role) throw new BadRequestException('Default role does not exist or is inactive');
    return this.userModel.create({
      ...input,
      roles: input.roles?.length ? input.roles : [input.role],
      roleIds: [role._id],
    });
  }

  async findByEmailForAuth(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmployeeId(employeeId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ employeeId: new Types.ObjectId(employeeId) }).exec();
  }

  async linkEmployee(userId: string, employeeId: string): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { $set: { employeeId: new Types.ObjectId(employeeId) } },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  }

  async unlinkEmployee(userId: string): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { $unset: { employeeId: 1 } },
      { returnDocument: 'after' },
    ).exec();
  }

  async recordLogin(userId: string): Promise<void> {
    await this.userModel.updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } }).exec();
  }

  async resetLoginFailures(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $set: { failedLoginCount: 0 }, $unset: { firstFailedLoginAt: 1, lastFailedLoginAt: 1, loginLockedUntil: 1 } },
    ).exec();
  }

  async recordLoginFailure(userId: string, now: Date, windowStart: Date, lockedUntil: Date): Promise<UserDocument | null> {
    const startsNewWindow = {
      $or: [
        { $eq: [{ $ifNull: ['$firstFailedLoginAt', null] }, null] },
        { $lt: ['$firstFailedLoginAt', windowStart] },
      ],
    };
    return this.userModel.findByIdAndUpdate(
      userId,
      [
        {
          $set: {
            firstFailedLoginAt: { $cond: [startsNewWindow, now, '$firstFailedLoginAt'] },
            lastFailedLoginAt: now,
            failedLoginCount: { $cond: [startsNewWindow, 1, { $add: [{ $ifNull: ['$failedLoginCount', 0] }, 1] }] },
          },
        },
        {
          $set: {
            loginLockedUntil: { $cond: [{ $gte: ['$failedLoginCount', 5] }, lockedUntil, '$loginLockedUntil'] },
          },
        },
      ],
      { returnDocument: 'after' },
    ).exec();
  }

  async revokeActiveSessions(userId: string, reason: 'ACCOUNT_DEACTIVATED' | 'PASSWORD_CHANGED'): Promise<void> {
    await this.userSessionModel.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { revokedAt: new Date(), revokedReason: reason } },
    ).exec();
  }

  async findAllSafe(query: ListUsersDto): Promise<{ data: SafeUser[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const filter: Record<string, unknown> = {};
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.role) filter.$or = [{ role: query.role }, { roles: query.role }];
    if (query.search?.trim()) {
      const search = new RegExp(this.escapeRegExp(query.search.trim()), 'i');
      const searchConditions = [{ email: search }, { fullName: search }];
      filter.$and = [
        ...(filter.$or ? [{ $or: filter.$or }] : []),
        { $or: searchConditions },
      ];
      delete filter.$or;
    }
    const skip = (query.page - 1) * query.limit;
    const [users, total] = await Promise.all([
      this.userModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);
    return {
      data: users.map((user) => this.toSafeUser(user)),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async findSafeById(id: string): Promise<SafeUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User account not found');
    return this.toSafeUser(user);
  }

  async findSafeByIdWithPermissions(id: string): Promise<SafeUserWithPermissions> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User account not found');
    const roleIds = user.roleIds ?? [];
    const activeRoles = roleIds.length
      ? await this.roleModel.find({ _id: { $in: roleIds }, isActive: true }).select({ permissionKeys: 1 }).lean().exec()
      : [];
    const permissionKeys = [...new Set(activeRoles.flatMap((role) => role.permissionKeys ?? []))].sort();
    return { ...this.toSafeUser(user), permissionKeys };
  }

  async createManagedAccount(request: RequestWithContext, input: CreateManagedUserDto): Promise<SafeUser> {
    const roleReferences = await this.resolveRoleReferences(input.roleIds);
    const employee = await this.employeeModel.findById(input.employeeId).exec();
    if (!employee) throw new BadRequestException('Employee does not exist');
    if (employee.userId) throw new ConflictException('Employee already has an account');
    const email = input.email.toLowerCase();
    if (await this.findByEmailForAuth(email)) throw new ConflictException('Email is already registered');
    const passwordHash = await bcrypt.hash(input.temporaryPassword, 12);
    try {
      const user = await this.userModel.create({
        fullName: employee.fullName,
        department: employee.department,
        email,
        passwordHash,
        role: this.primaryRole(roleReferences.keys),
        roles: roleReferences.keys,
        roleIds: roleReferences.ids,
        employeeId: employee._id,
        isActive: input.isActive,
      });
      await this.employeeModel.updateOne({ _id: employee._id }, { $set: { userId: user._id } }).exec();
      await this.auditLogService.record(request, {
        action: 'EMPLOYEE.USER_LINKED',
        outcome: AuditOutcome.SUCCESS,
        resource: { type: 'EMPLOYEE', id: employee._id.toString(), code: employee.employeeCode },
        changes: { after: { userId: user._id.toString(), employeeId: employee._id.toString() } },
      });
      await this.auditLogService.record(request, {
        action: 'USER.CREATED',
        outcome: AuditOutcome.SUCCESS,
        resource: { type: 'USER', id: user._id.toString(), code: user.email },
        changes: { after: { email: user.email, roles: user.roles, roleIds: user.roleIds.map((roleId) => roleId.toString()), isActive: user.isActive, employeeId: employee._id.toString() } },
      });
      return this.toSafeUser(user);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) throw new ConflictException('Email or employee link already exists');
      throw error;
    }
  }

  async updateManagedAccount(request: RequestWithContext, id: string, input: UpdateManagedUserDto): Promise<SafeUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User account not found');
    const roleReferences = input.roleIds ? await this.resolveRoleReferences(input.roleIds) : { ids: user.roleIds ?? [], keys: user.roles?.length ? user.roles : [user.role] };
    const roles = roleReferences.keys;
    if (!roles.length) throw new BadRequestException('At least one role is required');
    const hadAdminRole = await this.hasAdminRole(user.roleIds ?? []);
    const hasAdminRole = await this.hasAdminRole(roleReferences.ids);
    const removesAdmin = hadAdminRole && !hasAdminRole;
    const deactivatesAdmin = hadAdminRole && input.isActive === false;
    if (removesAdmin || deactivatesAdmin) await this.ensureNotLastAdmin(user.id);
    const email = input.email?.toLowerCase();
    if (email && email !== user.email && await this.findByEmailForAuth(email)) throw new ConflictException('Email is already registered');
    const updated = await this.userModel.findByIdAndUpdate(id, {
      $set: {
        ...(email ? { email } : {}),
        ...(input.roleIds ? { roles, role: this.primaryRole(roles), roleIds: roleReferences.ids } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.newPassword ? { passwordHash: await bcrypt.hash(input.newPassword, 12) } : {}),
      },
    }, { returnDocument: 'after', runValidators: true }).exec();
    if (!updated) throw new NotFoundException('User account not found');
    if (input.isActive === false || input.newPassword) {
      await this.revokeActiveSessions(updated.id, input.newPassword ? 'PASSWORD_CHANGED' : 'ACCOUNT_DEACTIVATED');
    }
    await this.auditLogService.record(request, {
      action: input.newPassword ? 'USER.PASSWORD_CHANGED' : input.isActive !== undefined && input.isActive !== user.isActive ? 'USER.STATUS_CHANGED' : 'USER.UPDATED',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'USER', id: updated._id.toString(), code: updated.email },
      changes: { before: { email: user.email, roles: user.roles, roleIds: user.roleIds?.map((roleId) => roleId.toString()), isActive: user.isActive }, after: { email: updated.email, roles: updated.roles, roleIds: updated.roleIds?.map((roleId) => roleId.toString()), isActive: updated.isActive } },
    });
    return this.toSafeUser(updated);
  }

  async linkManagedEmployee(request: RequestWithContext, userId: string, employeeId: string): Promise<SafeUser> {
    const [user, employee] = await Promise.all([this.findById(userId), this.employeeModel.findById(employeeId).exec()]);
    if (!user) throw new NotFoundException('User account not found');
    if (!employee || !employee.isActive) throw new BadRequestException('Employee does not exist or is inactive');
    if (employee.userId && employee.userId.toString() !== user.id) throw new ConflictException('Employee already has an account');
    const previousEmployeeId = user.employeeId?.toString();
    if (previousEmployeeId === employeeId) return this.toSafeUser(user);
    if (previousEmployeeId) await this.employeeModel.updateOne({ _id: previousEmployeeId, userId: user._id }, { $unset: { userId: 1 } }).exec();
    await this.employeeModel.updateOne({ _id: employee._id }, { $set: { userId: user._id } }).exec();
    const updated = await this.userModel.findByIdAndUpdate(userId, { $set: { employeeId: employee._id, fullName: employee.fullName, department: employee.department } }, { returnDocument: 'after', runValidators: true }).exec();
    if (!updated) throw new NotFoundException('User account not found');
    await this.auditLogService.record(request, { action: 'USER.EMPLOYEE_LINKED', outcome: AuditOutcome.SUCCESS, resource: { type: 'USER', id: updated._id.toString(), code: updated.email }, changes: { before: { employeeId: previousEmployeeId }, after: { employeeId: employee._id.toString(), employeeCode: employee.employeeCode } } });
    return this.toSafeUser(updated);
  }

  async unlinkManagedEmployee(request: RequestWithContext, userId: string): Promise<SafeUser> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User account not found');
    const employeeId = user.employeeId?.toString();
    if (!employeeId) throw new BadRequestException('User account is not linked to an employee');
    const employee = await this.employeeModel.findById(employeeId).exec();
    await this.employeeModel.updateOne({ _id: employeeId, userId: user._id }, { $unset: { userId: 1 } }).exec();
    const updated = await this.userModel.findByIdAndUpdate(userId, { $unset: { employeeId: 1 } }, { returnDocument: 'after', runValidators: true }).exec();
    if (!updated) throw new NotFoundException('User account not found');
    await this.auditLogService.record(request, { action: 'USER.EMPLOYEE_UNLINKED', outcome: AuditOutcome.SUCCESS, resource: { type: 'USER', id: updated._id.toString(), code: updated.email }, changes: { before: { employeeId, employeeCode: employee?.employeeCode }, after: {} } });
    return this.toSafeUser(updated);
  }

  async addManagedRoles(request: RequestWithContext, userId: string, roleIds: string[]): Promise<SafeUser> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User account not found');
    const uniqueRoleIds = [...new Set(roleIds)];
    const roles = await this.roleModel.find({ _id: { $in: uniqueRoleIds }, isActive: true }).exec();
    if (roles.length !== uniqueRoleIds.length) throw new BadRequestException('One or more roles do not exist or are inactive');
    const existingIds = new Set((user.roleIds ?? []).map((roleId) => roleId.toString()));
    const rolesToAdd = roles.filter((role) => !existingIds.has(role._id.toString()));
    if (rolesToAdd.length === 0) throw new ConflictException('Selected roles are already assigned to this user');
    const nextRoleIds = [...(user.roleIds ?? []), ...rolesToAdd.map((role) => role._id)];
    const nextRoles = this.legacyRoleKeys([...(user.roles?.length ? user.roles : [user.role]), ...rolesToAdd.map((role) => role.key)]);
    const updated = await this.userModel.findByIdAndUpdate(userId, { $set: { roleIds: nextRoleIds, roles: nextRoles, role: this.primaryRole(nextRoles) } }, { returnDocument: 'after', runValidators: true }).exec();
    if (!updated) throw new NotFoundException('User account not found');
    await this.auditLogService.record(request, { action: 'USER.ROLES_ADDED', outcome: AuditOutcome.SUCCESS, resource: { type: 'USER', id: updated._id.toString(), code: updated.email }, changes: { after: { roleIds: rolesToAdd.map((role) => role._id.toString()), roles: rolesToAdd.map((role) => role.key) } } });
    return this.toSafeUser(updated);
  }

  async removeManagedRoles(request: RequestWithContext, userId: string, roleIds: string[]): Promise<SafeUser> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User account not found');
    const idsToRemove = new Set(roleIds);
    const currentIds = (user.roleIds ?? []).map((roleId) => roleId.toString());
    if (roleIds.some((roleId) => !currentIds.includes(roleId))) throw new BadRequestException('One or more roles are not assigned to this user');
    const nextRoleIds = (user.roleIds ?? []).filter((roleId) => !idsToRemove.has(roleId.toString()));
    if (nextRoleIds.length === 0) throw new BadRequestException('A user account must have at least one role');
    const removedRoles = await this.roleModel.find({ _id: { $in: roleIds } }).exec();
    const remainingRoles = await this.roleModel.find({ _id: { $in: nextRoleIds } }).exec();
    const nextRoles = this.legacyRoleKeys(remainingRoles.map((role) => role.key));
    const removesAdmin = await this.hasAdminRole(user.roleIds ?? []) && !await this.hasAdminRole(nextRoleIds);
    if (removesAdmin) await this.ensureNotLastAdmin(user.id);
    const updated = await this.userModel.findByIdAndUpdate(userId, { $set: { roleIds: nextRoleIds, roles: nextRoles, role: this.primaryRole(nextRoles) } }, { returnDocument: 'after', runValidators: true }).exec();
    if (!updated) throw new NotFoundException('User account not found');
    await this.auditLogService.record(request, { action: 'USER.ROLES_REMOVED', outcome: AuditOutcome.SUCCESS, resource: { type: 'USER', id: updated._id.toString(), code: updated.email }, changes: { before: { roleIds: removedRoles.map((role) => role._id.toString()), roles: removedRoles.map((role) => role.key) } } });
    return this.toSafeUser(updated);
  }

  toSafeUser(user: UserDocument): SafeUser {
    return {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      roles: user.roles?.length ? user.roles : [user.role],
      department: user.department,
      isActive: user.isActive,
      ...(user.employeeId ? { employeeId: user.employeeId.toString() } : {}),
      ...(user.roleIds?.length ? { roleIds: user.roleIds.map((id) => id.toString()) } : {}),
      ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async ensureNotLastAdmin(userId: string): Promise<void> {
    const adminRole = await this.roleModel.findOne({ key: UserRole.ADMIN }).select({ _id: 1 }).lean().exec();
    if (!adminRole) throw new BadRequestException('ADMIN role does not exist');
    const activeAdmins = await this.userModel.countDocuments({ _id: { $ne: userId }, isActive: true, roleIds: adminRole._id }).exec();
    if (activeAdmins === 0) throw new BadRequestException('The last active ADMIN account cannot be changed or deactivated');
  }

  private primaryRole(roles: UserRole[]): UserRole {
    return roles.includes(UserRole.ADMIN) ? UserRole.ADMIN : roles[0] ?? UserRole.EMPLOYEE;
  }

  private uniqueRoles(roles: UserRole[]): UserRole[] {
    return [...new Set(roles)];
  }

  private legacyRoleKeys(keys: string[]): UserRole[] {
    const legacyKeys = keys.filter((key): key is UserRole => Object.values(UserRole).includes(key as UserRole));
    return this.uniqueRoles(legacyKeys.length ? legacyKeys : [UserRole.EMPLOYEE]);
  }

  private async resolveRoleReferences(roleIds: string[]): Promise<{ ids: Types.ObjectId[]; keys: UserRole[] }> {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (!uniqueRoleIds.length) throw new BadRequestException('At least one role is required');
    const roles = await this.roleModel.find({ _id: { $in: uniqueRoleIds }, isActive: true }).exec();
    if (roles.length !== uniqueRoleIds.length) throw new BadRequestException('One or more roles do not exist or are inactive');
    return { ids: roles.map((role) => role._id), keys: this.legacyRoleKeys(roles.map((role) => role.key)) };
  }

  private async hasAdminRole(roleIds: Types.ObjectId[]): Promise<boolean> {
    if (!roleIds.length) return false;
    return Boolean(await this.roleModel.exists({ _id: { $in: roleIds }, key: UserRole.ADMIN }));
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
