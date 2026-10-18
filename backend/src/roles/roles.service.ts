import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { User } from '../users/schemas/user.schema.js';
import { CreateRoleDto, ListRolesDto, UpdateRoleDto } from './dto/role.dto.js';
import { ALL_PERMISSION_KEYS, PERMISSION_KEYS, PERMISSION_REGISTRY } from './permission-registry.js';
import { Role, RoleDocument } from './schemas/role.schema.js';
import { normalizeSearchText } from '../common/text/normalize-search-text.js';

const ROLE_SEEDS: Array<Pick<Role, 'key' | 'name' | 'permissionKeys' | 'isSystem' | 'isActive'>> = [
  { key: UserRole.EMPLOYEE, name: 'Nhân viên', permissionKeys: ['DASHBOARD.VIEW', 'NOTIFICATION.VIEW', 'REQUESTS.VIEW_OWN', 'REQUESTS.CREATE'], isSystem: true, isActive: true },
  { key: UserRole.MANAGER, name: 'Quản lý', permissionKeys: ['DASHBOARD.VIEW', 'NOTIFICATION.VIEW', 'REQUESTS.VIEW_OWN', 'APPROVALS.VIEW_ASSIGNED', 'APPROVALS.APPROVE_ASSIGNED'], isSystem: true, isActive: true },
  { key: UserRole.ACCOUNTANT, name: 'Kế toán', permissionKeys: ['DASHBOARD.VIEW', 'NOTIFICATION.VIEW', 'REQUESTS.VIEW_OWN', 'APPROVALS.VIEW_ASSIGNED', 'APPROVALS.APPROVE_ASSIGNED'], isSystem: true, isActive: true },
  { key: UserRole.DIRECTOR, name: 'Giám đốc', permissionKeys: ['DASHBOARD.VIEW', 'NOTIFICATION.VIEW', 'REQUESTS.VIEW_OWN', 'APPROVALS.VIEW_ASSIGNED', 'APPROVALS.APPROVE_ASSIGNED'], isSystem: true, isActive: true },
  { key: UserRole.ADMIN, name: 'Quản trị viên', permissionKeys: ALL_PERMISSION_KEYS, isSystem: true, isActive: true },
];

type StoredRole = Role & { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date };

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectModel(Role.name) private readonly model: Model<Role>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly audit: AuditLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all(ROLE_SEEDS.map(async (role) => {
      const permissionKeys = this.normalizePermissionKeys(role.permissionKeys);
      const update = role.key === UserRole.ADMIN
        ? {
          $setOnInsert: { key: role.key },
          $set: { name: role.name, nameNormalized: normalizeSearchText(role.name), permissionKeys, isSystem: true, isActive: true },
        }
        : { $setOnInsert: { ...role, nameNormalized: normalizeSearchText(role.name), permissionKeys } };
      await this.model.updateOne(
        { key: role.key },
        update,
        { upsert: true },
      ).exec();
      if (role.key !== UserRole.ADMIN) {
        await this.model.updateOne(
          { key: role.key },
          { $addToSet: { permissionKeys: { $each: ['DASHBOARD.VIEW', 'NOTIFICATION.VIEW'] } } },
        ).exec();
      }
    }));
    await this.model.updateMany(
      { permissionKeys: 'APPROVALS.APPROVE_ASSIGNED' },
      { $addToSet: { permissionKeys: 'APPROVALS.VIEW_ASSIGNED' } },
    ).exec();
  }

  permissionRegistry() {
    return PERMISSION_REGISTRY;
  }

  async findAll(query: ListRolesDto) {
    const roles = await this.model.aggregate<StoredRole & { assignedUserCount: number }>([
      { $match: query.active === undefined ? {} : { isActive: query.active } },
      { $sort: { key: 1 } },
      {
        $lookup: {
          from: 'users',
          let: { roleId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $in: ['$$roleId', { $ifNull: ['$roleIds', []] }] },
                  ],
                },
              },
            },
            { $count: 'count' },
          ],
          as: 'assignmentCount',
        },
      },
      { $addFields: { assignedUserCount: { $ifNull: [{ $arrayElemAt: ['$assignmentCount.count', 0] }, 0] } } },
      { $project: { assignmentCount: 0 } },
    ]).exec();
    return roles.map((role) => ({ ...this.toResponse(role), assignedUserCount: role.assignedUserCount }));
  }

  async findOne(id: string) {
    const role = await this.model.findById(id).lean().exec();
    if (!role) throw new NotFoundException('Không tìm thấy vai trò.');
    return { ...this.toResponse(role as StoredRole), assignedUserCount: await this.assignedUserCount(role as StoredRole) };
  }

  async create(request: RequestWithContext, input: CreateRoleDto) {
    const key = input.key.toUpperCase();
    if (await this.model.exists({ key })) throw new ConflictException({ message: 'Mã vai trò đã tồn tại.', field: 'key' });
    await this.ensureNameAvailable(input.name.trim());
    const permissionKeys = this.normalizePermissionKeys(input.permissionKeys ?? []);
    const item = await this.model.create({
      key,
      name: input.name.trim(),
      nameNormalized: normalizeSearchText(input.name),
      description: input.description?.trim(),
      permissionKeys,
      isSystem: false,
      isActive: input.isActive ?? true,
      createdBy: request.user?.id,
      updatedBy: request.user?.id,
    });
    await this.record(request, 'ROLE.CREATED', item, undefined, this.snapshot(item));
    return { ...this.toResponse(item.toObject() as StoredRole), assignedUserCount: 0 };
  }

  async update(request: RequestWithContext, id: string, input: UpdateRoleDto) {
    const current = await this.model.findById(id).exec();
    if (!current) throw new NotFoundException('Không tìm thấy vai trò.');

    const nextKey = input.key === undefined ? current.key : input.key.toUpperCase();
    const nextName = input.name === undefined ? current.name : input.name.trim();
    const nextDescription = input.description === undefined ? current.description : input.description.trim();
    const nextPermissionKeys = current.key === UserRole.ADMIN
      ? [...ALL_PERMISSION_KEYS]
      : input.permissionKeys === undefined
        ? this.currentPermissionKeys(current)
        : this.normalizePermissionKeys(input.permissionKeys);
    const nextIsActive = input.isActive === undefined ? current.isActive : input.isActive;

    if (input.key !== undefined) {
      if (current.isSystem) throw new ConflictException({ message: 'Không thể đổi mã vai trò hệ thống.', field: 'key' });
      if (await this.model.exists({ key: nextKey, _id: { $ne: current._id } })) {
        throw new ConflictException({ message: 'Mã vai trò đã tồn tại.', field: 'key' });
      }
    }
    if (input.name !== undefined) await this.ensureNameAvailable(nextName, id);
    if (current.isActive && !nextIsActive && await this.assignedUserCount(current as StoredRole) > 0) {
      throw new ConflictException('Không thể ngưng hoạt động vai trò đang được gán cho tài khoản.');
    }
    if (current.key === UserRole.ADMIN && current.isActive && !nextIsActive) await this.ensureNotLastAdminRole();

    const hasKeyChange = nextKey !== current.key;
    const hasNameChange = nextName !== current.name;
    const hasDescriptionChange = nextDescription !== current.description;
    const hasPermissionChange = !this.samePermissionKeys(nextPermissionKeys, this.currentPermissionKeys(current));
    const hasStatusChange = nextIsActive !== current.isActive;
    if (!hasKeyChange && !hasNameChange && !hasDescriptionChange && !hasPermissionChange && !hasStatusChange) {
      return { ...this.toResponse(current.toObject() as StoredRole), assignedUserCount: await this.assignedUserCount(current as StoredRole) };
    }

    const item = await this.model.findByIdAndUpdate(
      id,
      {
        $set: {
          key: nextKey,
          name: nextName,
          nameNormalized: normalizeSearchText(nextName),
          ...(input.description === undefined ? {} : { description: nextDescription }),
          permissionKeys: nextPermissionKeys,
          isActive: nextIsActive,
          updatedBy: request.user?.id,
        },
      },
      { returnDocument: 'after', runValidators: true },
    ).exec();
    if (!item) throw new NotFoundException('Không tìm thấy vai trò.');

    const action = hasPermissionChange && !hasKeyChange && !hasNameChange && !hasDescriptionChange && !hasStatusChange
      ? 'ROLE.PERMISSIONS_UPDATED'
      : hasStatusChange && !hasKeyChange && !hasNameChange && !hasDescriptionChange && !hasPermissionChange
        ? 'ROLE.STATUS_CHANGED'
        : 'ROLE.UPDATED';
    await this.record(request, action, item, this.snapshot(current), this.snapshot(item));
    return { ...this.toResponse(item.toObject() as StoredRole), assignedUserCount: await this.assignedUserCount(item as StoredRole) };
  }

  async updateStatus(request: RequestWithContext, id: string, isActive: boolean) {
    return this.update(request, id, { isActive });
  }

  async remove(request: RequestWithContext, id: string): Promise<void> {
    const current = await this.model.findById(id).exec();
    if (!current) throw new NotFoundException('Không tìm thấy vai trò.');
    if (current.isSystem) throw new ConflictException('Không thể xóa vai trò hệ thống.');
    if (await this.assignedUserCount(current as StoredRole) > 0) {
      throw new ConflictException('Không thể xóa vai trò đang được gán cho tài khoản.');
    }
    await this.model.deleteOne({ _id: current._id }).exec();
    await this.record(request, 'ROLE.DELETED', current, this.snapshot(current), undefined);
  }

  private async assignedUserCount(role: StoredRole): Promise<number> {
    return this.users.countDocuments({ roleIds: role._id }).exec();
  }

  private async ensureNotLastAdminRole(): Promise<void> {
    if (await this.model.countDocuments({ key: UserRole.ADMIN, isActive: true }).exec() <= 1) {
      throw new ConflictException('Không thể ngưng hoạt động vai trò ADMIN cuối cùng.');
    }
  }

  private normalizePermissionKeys(values: string[]): string[] {
    const selected = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    const invalidPermissionKeys = selected.filter((value) => !PERMISSION_KEYS.has(value));
    if (invalidPermissionKeys.length) {
      throw new ConflictException({
        message: `Permission key không tồn tại trong Permission Registry: ${invalidPermissionKeys.join(', ')}.`,
        invalidPermissionKeys,
      });
    }
    const normalized = new Set(selected);
    const viewPermissions = PERMISSION_REGISTRY.filter((permission) => permission.matrixColumn === 'VIEW');
    for (const viewPermission of viewPermissions) {
      const hasDependentPermission = PERMISSION_REGISTRY.some((permission) => (
        permission.module === viewPermission.module
        && permission.key !== viewPermission.key
        && normalized.has(permission.key)
      ));
      if (hasDependentPermission) normalized.add(viewPermission.key);
    }
    return PERMISSION_REGISTRY
      .map((permission) => permission.key)
      .filter((permission) => normalized.has(permission));
  }

  private currentPermissionKeys(item: RoleDocument): string[] {
    return [...new Set(item.permissionKeys ?? [])];
  }

  private samePermissionKeys(first: string[], second: string[]): boolean {
    return first.length === second.length && first.every((key) => second.includes(key));
  }

  private async ensureNameAvailable(name: string, excludedId?: string): Promise<void> {
    const duplicate = await this.model.exists({
      nameNormalized: normalizeSearchText(name),
      ...(excludedId ? { _id: { $ne: excludedId } } : {}),
    });
    if (duplicate) throw new ConflictException({ message: 'Tên vai trò đã tồn tại.', field: 'name' });
  }

  private toResponse(item: StoredRole) {
    const id = item._id.toString();
    return {
      id,
      _id: id,
      key: item.key,
      name: item.name,
      description: item.description,
      permissionKeys: this.currentPermissionKeys(item as RoleDocument),
      isSystem: item.isSystem === true,
      isActive: item.isActive !== false,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private snapshot(item: RoleDocument) {
    return {
      key: item.key,
      name: item.name,
      permissionKeys: this.currentPermissionKeys(item),
      isSystem: item.isSystem,
      isActive: item.isActive,
    };
  }

  private async record(
    request: RequestWithContext,
    action: string,
    item: RoleDocument,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record(request, {
      action,
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'ROLE', id: item._id.toString(), code: item.key },
      changes: { ...(before ? { before } : {}), ...(after ? { after } : {}) },
    });
  }
}
