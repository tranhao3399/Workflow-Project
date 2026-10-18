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
import { Role, RoleDocument } from '../roles/schemas/role.schema.js';
import { UserSession } from '../auth/schemas/user-session.schema.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { Department } from '../departments/schemas/department.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { normalizeSearchText } from '../common/text/normalize-search-text.js';

export interface SafeUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  roles: string[];
  department: string;
  isActive: boolean;
  employeeId?: string;
  employeeCode?: string;
  position?: string;
  avatarUrl?: string;
  roleIds?: string[];
  roleNames?: string[];
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  sessionId?: string;
  permissionKeys?: string[];
}

export interface SafeUserWithPermissions extends SafeUser {
  permissionKeys: string[];
}

export interface CreateUserInput {
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  employeeId?: string;
  isActive?: boolean;
}

type UserProfile = {
  employeeId?: string;
  employeeCode?: string;
  fullName?: string;
  department?: string;
  position?: string;
  avatarUrl?: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<Employee>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(UserSession.name) private readonly userSessionModel: Model<UserSession>,
    @InjectModel(Department.name) private readonly departmentModel: Model<Department>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    const role = await this.roleModel.findOne({ key: input.role, isActive: true }).select({ _id: 1 }).lean().exec();
    if (!role) throw new BadRequestException('Default role does not exist or is inactive');
    return this.userModel.create({
      displayName: input.fullName.trim(),
      email: input.email,
      passwordHash: input.passwordHash,
      ...(input.employeeId ? { employeeId: input.employeeId } : {}),
      isActive: input.isActive ?? true,
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

  async findByIdForAuth(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('+passwordHash').exec();
  }

  async findLinksByEmployeeIds(employeeIds: string[]): Promise<Map<string, string>> {
    if (!employeeIds.length) return new Map();
    const users = await this.userModel.find({ employeeId: { $in: employeeIds } }).select({ employeeId: 1 }).lean().exec();
    return new Map(users.flatMap((user) => user.employeeId ? [[user.employeeId.toString(), user._id.toString()] as const] : []));
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

  async resetPasswordFromForgotPassword(userId: string, newPassword: string): Promise<UserDocument | null> {
    const updated = await this.userModel.findOneAndUpdate(
      { _id: userId, isActive: true },
      { $set: { passwordHash: await bcrypt.hash(newPassword, 12), passwordChangedAt: new Date() } },
      { returnDocument: 'after', runValidators: true },
    ).select('+passwordHash').exec();
    if (updated) await this.revokeActiveSessions(updated.id, 'PASSWORD_CHANGED');
    return updated;
  }

  async findAllSafe(query: ListUsersDto): Promise<{ data: SafeUser[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const filter: Record<string, unknown> = {};
    if (query.isActive !== undefined) filter.isActive = query.isActive;
    if (query.role) {
      const role = await this.roleModel.findOne({ key: query.role }).select({ _id: 1 }).lean().exec();
      if (!role) return { data: [], pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 } };
      filter.roleIds = role._id;
    }
    if (query.search?.trim()) {
      const rawSearch = query.search.trim();
      const search = new RegExp(this.escapeRegExp(rawSearch), 'i');
      const normalizedSearch = new RegExp(this.escapeRegExp(normalizeSearchText(rawSearch)), 'i');
      const employees = await this.employeeModel.find({
        $or: [{ employeeCode: search }, { fullNameNormalized: normalizedSearch }],
      }).select({ _id: 1 }).lean().exec();
      filter.$or = [{ email: search }, { displayName: search }, { employeeId: { $in: employees.map((employee) => employee._id) } }];
    }
    const skip = (query.page - 1) * query.limit;
    const [users, total] = await Promise.all([
      this.userModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);
    const [roleMap, profileMap] = await Promise.all([
      this.loadRoleMap(users.flatMap((user) => user.roleIds ?? [])),
      this.loadProfileMap(users),
    ]);
    return {
      data: users.map((user) => this.buildSafeUser(user, this.rolesForUser(user, roleMap), profileMap.get(user.id))),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async findEmployeeOptions(): Promise<Array<{ id: string; employeeCode: string; fullName: string; department: string; isActive: boolean; userId?: string }>> {
    const [employees, users] = await Promise.all([
      this.employeeModel.find().select({ employeeCode: 1, fullName: 1, departmentId: 1, isActive: 1 }).sort({ employeeCode: 1 }).lean().exec(),
      this.userModel.find({ employeeId: { $exists: true } }).select({ _id: 1, employeeId: 1 }).lean().exec(),
    ]);
    const userIdByEmployeeId = new Map(users.flatMap((user) => user.employeeId ? [[user.employeeId.toString(), user._id.toString()] as const] : []));
    const departments = await this.departmentModel.find({ _id: { $in: employees.map((employee) => employee.departmentId) } }).select({ name: 1 }).lean().exec();
    const departmentById = new Map(departments.map((department) => [department._id.toString(), department.name]));
    return employees.map((employee) => ({
      id: employee._id.toString(),
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: departmentById.get(employee.departmentId.toString()) ?? '',
      isActive: employee.isActive,
      ...(userIdByEmployeeId.get(employee._id.toString()) ? { userId: userIdByEmployeeId.get(employee._id.toString()) } : {}),
    }));
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
    const assignedRoles = roleIds.length
      ? await this.roleModel.find({ _id: { $in: roleIds } }).exec()
      : [];
    const orderedRoles = this.orderRoles(roleIds, assignedRoles);
    const permissionKeys = [...new Set(orderedRoles.filter((role) => role.isActive).flatMap((role) => role.permissionKeys ?? []))].sort();
    const profile = await this.loadProfile(user);
    return {
      ...this.buildSafeUser(user, orderedRoles, profile),
      permissionKeys,
    };
  }

  async createManagedAccount(request: RequestWithContext, input: CreateManagedUserDto): Promise<SafeUser> {
    const roleReferences = await this.resolveRoleReferences(input.roleIds);
    const employee = await this.employeeModel.findById(input.employeeId).exec();
    if (!employee) throw new BadRequestException('Employee does not exist');
    if (await this.userModel.exists({ employeeId: employee._id })) throw new ConflictException('Employee already has an account');
    const email = input.email.toLowerCase();
    if (await this.findByEmailForAuth(email)) throw new ConflictException('Email is already registered');
    const passwordHash = await bcrypt.hash(input.temporaryPassword, 12);
    try {
      const user = await this.userModel.create({
        displayName: employee.fullName,
        email,
        passwordHash,
        roleIds: roleReferences.ids,
        employeeId: employee._id,
        isActive: input.isActive,
        createdBy: request.user?.id,
        updatedBy: request.user?.id,
      });
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
        changes: { after: { email: user.email, roles: roleReferences.roles.map((role) => role.key), roleIds: user.roleIds.map((roleId) => roleId.toString()), isActive: user.isActive, employeeId: employee._id.toString() } },
      });
      return this.buildSafeUser(user, roleReferences.roles, await this.loadProfile(user));
    } catch (error) {
      if (this.isDuplicateKeyError(error)) throw new ConflictException('Email or employee link already exists');
      throw error;
    }
  }

  async updateManagedAccount(request: RequestWithContext, id: string, input: UpdateManagedUserDto): Promise<SafeUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User account not found');
    const currentRoles = await this.findAssignedRoles(user.roleIds ?? []);
    const roleReferences = input.roleIds ? await this.resolveRoleReferences(input.roleIds) : { ids: user.roleIds ?? [], roles: currentRoles };
    if (!roleReferences.ids.length) throw new BadRequestException('At least one role is required');
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
        ...(input.roleIds ? { roleIds: roleReferences.ids } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.newPassword ? { passwordHash: await bcrypt.hash(input.newPassword, 12) } : {}),
        ...(input.newPassword ? { passwordChangedAt: new Date() } : {}),
        updatedBy: request.user?.id,
      },
    }, { returnDocument: 'after', runValidators: true }).exec();
    if (!updated) throw new NotFoundException('User account not found');
    if (input.isActive === false || input.newPassword) {
      await this.revokeActiveSessions(updated.id, input.newPassword ? 'PASSWORD_CHANGED' : 'ACCOUNT_DEACTIVATED');
    }
    const updatedRoles = input.roleIds ? roleReferences.roles : currentRoles;
    await this.auditLogService.record(request, {
      action: input.newPassword ? 'USER.PASSWORD_CHANGED' : input.isActive !== undefined && input.isActive !== user.isActive ? 'USER.STATUS_CHANGED' : 'USER.UPDATED',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'USER', id: updated._id.toString(), code: updated.email },
      changes: { before: { email: user.email, roles: currentRoles.map((role) => role.key), roleIds: user.roleIds?.map((roleId) => roleId.toString()), isActive: user.isActive }, after: { email: updated.email, roles: updatedRoles.map((role) => role.key), roleIds: updated.roleIds?.map((roleId) => roleId.toString()), isActive: updated.isActive } },
    });
    return this.buildSafeUser(updated, updatedRoles, await this.loadProfile(updated));
  }

  async linkManagedEmployee(request: RequestWithContext, userId: string, employeeId: string): Promise<SafeUser> {
    const [user, employee] = await Promise.all([this.findById(userId), this.employeeModel.findById(employeeId).exec()]);
    if (!user) throw new NotFoundException('User account not found');
    if (!employee || !employee.isActive) throw new BadRequestException('Employee does not exist or is inactive');
    const linkedUser = await this.userModel.findOne({ employeeId: employee._id, _id: { $ne: user._id } }).select({ _id: 1 }).lean().exec();
    if (linkedUser) throw new ConflictException('Employee already has an account');
    const previousEmployeeId = user.employeeId?.toString();
    if (previousEmployeeId === employeeId) return this.toSafeUser(user);
    const updated = await this.userModel.findByIdAndUpdate(userId, { $set: { employeeId: employee._id, updatedBy: request.user?.id } }, { returnDocument: 'after', runValidators: true }).exec();
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
    const updated = await this.userModel.findByIdAndUpdate(userId, { $unset: { employeeId: 1 }, $set: { updatedBy: request.user?.id } }, { returnDocument: 'after', runValidators: true }).exec();
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
    const updated = await this.userModel.findByIdAndUpdate(userId, { $set: { roleIds: nextRoleIds, updatedBy: request.user?.id } }, { returnDocument: 'after', runValidators: true }).exec();
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
    const removesAdmin = await this.hasAdminRole(user.roleIds ?? []) && !await this.hasAdminRole(nextRoleIds);
    if (removesAdmin) await this.ensureNotLastAdmin(user.id);
    const updated = await this.userModel.findByIdAndUpdate(userId, { $set: { roleIds: nextRoleIds, updatedBy: request.user?.id } }, { returnDocument: 'after', runValidators: true }).exec();
    if (!updated) throw new NotFoundException('User account not found');
    await this.auditLogService.record(request, { action: 'USER.ROLES_REMOVED', outcome: AuditOutcome.SUCCESS, resource: { type: 'USER', id: updated._id.toString(), code: updated.email }, changes: { before: { roleIds: removedRoles.map((role) => role._id.toString()), roles: removedRoles.map((role) => role.key) } } });
    return this.buildSafeUser(updated, this.orderRoles(nextRoleIds, remainingRoles));
  }

  async toSafeUser(user: UserDocument): Promise<SafeUser> {
    const [roles, profile] = await Promise.all([this.findAssignedRoles(user.roleIds ?? []), this.loadProfile(user)]);
    return this.buildSafeUser(user, roles, profile);
  }

  private buildSafeUser(user: UserDocument, assignedRoles: RoleDocument[], profile?: UserProfile): SafeUser {
    const roleKeys = assignedRoles.map((role) => role.key);
    return {
      id: user._id.toString(),
      fullName: profile?.fullName ?? user.displayName ?? user.email.split('@')[0],
      email: user.email,
      role: this.primaryRole(roleKeys),
      roles: roleKeys,
      department: profile?.department ?? '',
      isActive: user.isActive,
      ...(user.employeeId ? { employeeId: user.employeeId.toString() } : {}),
      ...(profile?.employeeCode ? { employeeCode: profile.employeeCode } : {}),
      ...(profile?.position ? { position: profile.position } : {}),
      ...(profile?.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      ...(user.roleIds?.length ? { roleIds: user.roleIds.map((id) => id.toString()) } : {}),
      ...(assignedRoles.length ? { roleNames: assignedRoles.map((role) => role.name) } : {}),
      ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async loadProfile(user: UserDocument): Promise<UserProfile | undefined> {
    if (!user.employeeId) return undefined;
    const map = await this.loadProfileMap([user]);
    return map.get(user.id);
  }

  private async loadProfileMap(users: UserDocument[]): Promise<Map<string, UserProfile>> {
    const employeeIds = users.flatMap((user) => user.employeeId ? [user.employeeId] : []);
    if (!employeeIds.length) return new Map();
    const employees = await this.employeeModel.find({ _id: { $in: employeeIds } })
      .select({ fullName: 1, employeeCode: 1, departmentId: 1, positionId: 1, avatarKey: 1 })
      .lean().exec();
    const [departments, positions] = await Promise.all([
      this.departmentModel.find({ _id: { $in: employees.map((employee) => employee.departmentId) } }).select({ name: 1 }).lean().exec(),
      this.positionModel.find({ _id: { $in: employees.map((employee) => employee.positionId) } }).select({ name: 1 }).lean().exec(),
    ]);
    const departmentsById = new Map(departments.map((department) => [department._id.toString(), department.name]));
    const positionsById = new Map(positions.map((position) => [position._id.toString(), position.name]));
    const profilesByEmployeeId = new Map(employees.map((employee) => [employee._id.toString(), {
      employeeId: employee._id.toString(),
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: departmentsById.get(employee.departmentId.toString()) ?? '',
      position: positionsById.get(employee.positionId.toString()) ?? '',
      ...(employee.avatarKey ? { avatarUrl: `/uploads/avatars/${encodeURIComponent(employee.avatarKey)}` } : {}),
    }]));
    return new Map(users.flatMap((user) => {
      const profile = user.employeeId ? profilesByEmployeeId.get(user.employeeId.toString()) : undefined;
      return profile ? [[user.id, profile] as const] : [];
    }));
  }

  private async ensureNotLastAdmin(userId: string): Promise<void> {
    const adminRole = await this.roleModel.findOne({ key: UserRole.ADMIN }).select({ _id: 1 }).lean().exec();
    if (!adminRole) throw new BadRequestException('ADMIN role does not exist');
    const activeAdmins = await this.userModel.countDocuments({ _id: { $ne: userId }, isActive: true, roleIds: adminRole._id }).exec();
    if (activeAdmins === 0) throw new BadRequestException('The last active ADMIN account cannot be changed or deactivated');
  }

  private primaryRole(roles: string[]): string {
    return roles.includes(UserRole.ADMIN) ? UserRole.ADMIN : roles[0] ?? UserRole.EMPLOYEE;
  }

  private async findAssignedRoles(roleIds: Types.ObjectId[]): Promise<RoleDocument[]> {
    if (!roleIds.length) return [];
    const roles = await this.roleModel.find({ _id: { $in: roleIds } }).exec();
    return this.orderRoles(roleIds, roles);
  }

  private async loadRoleMap(roleIds: Types.ObjectId[]): Promise<Map<string, RoleDocument>> {
    const uniqueIds = [...new Set(roleIds.map((roleId) => roleId.toString()))];
    if (!uniqueIds.length) return new Map();
    const roles = await this.roleModel.find({ _id: { $in: uniqueIds } }).exec();
    return new Map(roles.map((role) => [role._id.toString(), role]));
  }

  private rolesForUser(user: UserDocument, roleMap: Map<string, RoleDocument>): RoleDocument[] {
    return (user.roleIds ?? []).flatMap((roleId) => {
      const role = roleMap.get(roleId.toString());
      return role ? [role] : [];
    });
  }

  private orderRoles(roleIds: Types.ObjectId[], roles: RoleDocument[]): RoleDocument[] {
    const roleMap = new Map(roles.map((role) => [role._id.toString(), role]));
    return roleIds.flatMap((roleId) => {
      const role = roleMap.get(roleId.toString());
      return role ? [role] : [];
    });
  }

  private async resolveRoleReferences(roleIds: string[]): Promise<{ ids: Types.ObjectId[]; roles: RoleDocument[] }> {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (!uniqueRoleIds.length) throw new BadRequestException('At least one role is required');
    const roles = await this.roleModel.find({ _id: { $in: uniqueRoleIds }, isActive: true }).exec();
    if (roles.length !== uniqueRoleIds.length) throw new BadRequestException('One or more roles do not exist or are inactive');
    const roleMap = new Map(roles.map((role) => [role._id.toString(), role]));
    const orderedRoles = uniqueRoleIds.map((roleId) => roleMap.get(roleId)).filter((role): role is typeof roles[number] => Boolean(role));
    return { ids: orderedRoles.map((role) => role._id), roles: orderedRoles };
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
