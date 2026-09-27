import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { Department } from '../departments/schemas/department.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { UsersService } from '../users/users.service.js';
import { AVATAR_STORAGE, type AvatarStorageAdapter } from './avatar-storage/avatar-storage.adapter.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { ListEmployeesDto } from './dto/list-employees.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { Employee, EmployeeDocument } from './schemas/employee.schema.js';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<Employee>,
    @InjectModel(Department.name) private readonly departmentModel: Model<Department>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    @Inject(AVATAR_STORAGE) private readonly avatarStorage: AvatarStorageAdapter,
  ) {}

  async findAll(query: ListEmployeesDto) {
    const filter: Record<string, unknown> = {};
    if (query.departmentId) filter.departmentId = query.departmentId;
    else if (query.department) filter.department = query.department.trim();
    if (query.isActive === false) filter.isActive = false;
    if (query.isActive === true) filter.isActive = { $ne: false };
    if (query.search?.trim()) {
      const expression = new RegExp(this.escapeRegExp(query.search.trim()), 'i');
      filter.$or = [{ employeeCode: expression }, { fullName: expression }, { workEmail: expression }, { position: expression }];
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.employeeModel.find(filter).select('-dateOfBirth').sort({ createdAt: -1 }).skip(skip).limit(query.limit).populate('departmentId', 'name').populate('positionId', 'name').populate('managerId', 'fullName').lean().exec(),
      this.employeeModel.countDocuments(filter).exec(),
    ]);
    return { data: data.map((item) => this.toDisplay(item)), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async findOne(id: string) {
    const employee = await this.employeeModel.findById(id).populate('departmentId', 'name').populate('positionId', 'name').populate('managerId', 'fullName').lean().exec();
    if (!employee) throw new NotFoundException('Employee not found');
    return this.toDisplay(employee);
  }

  async create(request: RequestWithContext, input: CreateEmployeeDto) {
    await this.ensureManagerIsValid(input.managerId);
    await this.ensureUserCanBeLinked(input.userId);
    const references = await this.resolveReferences(input.departmentId, input.positionId, input.department, input.position);
    try {
      const employee = await this.employeeModel.create({
        ...input,
        ...references,
        employeeCode: input.employeeCode.toUpperCase(),
        workEmail: input.workEmail.toLowerCase(),
        isActive: input.isActive ?? true,
      });
      if (input.userId) await this.linkUser(input.userId, employee._id.toString());
      await this.audit(request, 'EMPLOYEE.CREATED', employee, undefined, this.snapshot(employee));
      if (input.userId) await this.audit(request, 'USER.EMPLOYEE_LINKED', employee, undefined, { userId: input.userId });
      return this.toDisplay(employee.toObject());
    } catch (error) {
      if (this.isDuplicateKeyError(error)) throw new ConflictException('Employee code, work email, or user link already exists');
      throw error;
    }
  }

  async update(request: RequestWithContext, id: string, input: UpdateEmployeeDto) {
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee) throw new NotFoundException('Employee not found');
    const before = this.snapshot(employee);
    const hasUserUpdate = Object.prototype.hasOwnProperty.call(input, 'userId');
    const nextManagerId = input.managerId === null ? undefined : input.managerId ?? employee.managerId?.toString();
    await this.ensureManagerIsValid(nextManagerId, employee._id.toString());
    if (hasUserUpdate && input.userId) await this.ensureUserCanBeLinked(input.userId, employee._id.toString());
    const references = await this.resolveReferences(
      input.departmentId === null ? undefined : input.departmentId,
      input.positionId === null ? undefined : input.positionId,
      input.department ?? employee.department,
      input.position ?? employee.position,
    );

    const update: Record<string, unknown> = { ...input, ...references };
    const unset: Record<string, 1> = {};
    if (input.workEmail) update.workEmail = input.workEmail.toLowerCase();
    if (input.managerId === null) { delete update.managerId; unset.managerId = 1; }
    if (input.userId === null) { delete update.userId; unset.userId = 1; }

    try {
      const updated = await this.employeeModel.findByIdAndUpdate(
        id,
        { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { returnDocument: 'after', runValidators: true },
      ).exec();
      if (!updated) throw new NotFoundException('Employee not found');

      if (hasUserUpdate && employee.userId?.toString() !== input.userId) {
        if (employee.userId) await this.usersService.unlinkEmployee(employee.userId.toString());
        if (input.userId) await this.linkUser(input.userId, updated._id.toString());
      }

      const after = this.snapshot(updated);
      const activeChanged = before.isActive !== after.isActive;
      if (this.hasNonActiveChanges(before, after)) await this.audit(request, 'EMPLOYEE.UPDATED', updated, before, after);
      if (activeChanged) await this.audit(request, after.isActive ? 'EMPLOYEE.ACTIVATED' : 'EMPLOYEE.DEACTIVATED', updated, { isActive: before.isActive }, { isActive: after.isActive });
      if (hasUserUpdate && before.userId !== after.userId) {
        await this.audit(request, after.userId ? 'USER.EMPLOYEE_LINKED' : 'USER.EMPLOYEE_UNLINKED', updated, { userId: before.userId }, { userId: after.userId });
      }
      return this.toDisplay(updated.toObject());
    } catch (error) {
      if (this.isDuplicateKeyError(error)) throw new ConflictException('Employee code, work email, or user link already exists');
      throw error;
    }
  }

  async uploadAvatar(request: RequestWithContext, id: string, file: Express.Multer.File | undefined) {
    const validatedFile = this.validateAvatarFile(file);
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee) throw new NotFoundException('Employee not found');

    const stored = await this.avatarStorage.store(validatedFile);
    const oldAvatarKey = employee.avatarKey;
    try {
      employee.avatarKey = stored.key;
      employee.avatar = { contentType: stored.contentType, size: stored.size, updatedAt: new Date() };
      await employee.save();
    } catch (error) {
      await this.avatarStorage.remove(stored.key);
      throw error;
    }

    if (oldAvatarKey) await this.avatarStorage.remove(oldAvatarKey);
    await this.audit(request, 'EMPLOYEE.AVATAR_UPDATED', employee, undefined, { avatarUpdated: true });
    return this.toDisplay(employee.toObject());
  }

  async removeAvatar(request: RequestWithContext, id: string) {
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee) throw new NotFoundException('Employee not found');
    const oldAvatarKey = employee.avatarKey;
    if (!oldAvatarKey) return this.toDisplay(employee.toObject());

    employee.avatarKey = undefined;
    employee.avatar = undefined;
    await employee.save();
    await this.avatarStorage.remove(oldAvatarKey);
    await this.audit(request, 'EMPLOYEE.AVATAR_REMOVED', employee, { avatarRemoved: false }, { avatarRemoved: true });
    return this.toDisplay(employee.toObject());
  }

  private async ensureManagerIsValid(managerId?: string, employeeId?: string): Promise<void> {
    if (!managerId) return;
    if (managerId === employeeId) throw new BadRequestException('An employee cannot be their own direct manager');
    const manager = await this.employeeModel.exists({ _id: managerId, isActive: { $ne: false } });
    if (!manager) throw new BadRequestException('Direct manager does not exist');
  }

  private async resolveReferences(departmentId?: string, positionId?: string, legacyDepartment?: string, legacyPosition?: string): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};
    if (departmentId) {
      const department = await this.departmentModel.findOne({ _id: departmentId, isActive: true }).exec();
      if (!department) throw new BadRequestException('Department does not exist or is inactive');
      resolved.departmentId = department._id;
      resolved.department = department.name;
    } else if (legacyDepartment) resolved.department = legacyDepartment;
    if (positionId) {
      const position = await this.positionModel.findOne({ _id: positionId, isActive: true }).exec();
      if (!position) throw new BadRequestException('Position does not exist or is inactive');
      resolved.positionId = position._id;
      resolved.position = position.name;
    } else if (legacyPosition) resolved.position = legacyPosition;
    return resolved;
  }

  private async ensureUserCanBeLinked(userId?: string, employeeId?: string): Promise<void> {
    if (!userId) return;
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User account does not exist');
    const linkedEmployee = await this.employeeModel.findOne({ userId: new Types.ObjectId(userId) }).select('_id').lean().exec();
    if (linkedEmployee && linkedEmployee._id.toString() !== employeeId) throw new ConflictException('User account is already linked to another employee');
    if (user.employeeId && user.employeeId.toString() !== employeeId) throw new ConflictException('User account is already linked to another employee');
  }

  private async linkUser(userId: string, employeeId: string): Promise<void> {
    const linked = await this.usersService.linkEmployee(userId, employeeId);
    if (!linked) throw new BadRequestException('User account does not exist');
  }

  private async audit(request: RequestWithContext, action: string, employee: EmployeeDocument, before?: Record<string, unknown>, after?: Record<string, unknown>): Promise<void> {
    await this.auditLogService.record(request, {
      action,
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'EMPLOYEE', id: employee._id.toString(), code: employee.employeeCode },
      ...(before || after ? { changes: { ...(before ? { before } : {}), ...(after ? { after } : {}) } } : {}),
    });
  }

  private snapshot(employee: EmployeeDocument): Record<string, unknown> {
    return {
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      workEmail: employee.workEmail,
      department: employee.department,
      ...(employee.departmentId ? { departmentId: employee.departmentId.toString() } : {}),
      position: employee.position,
      ...(employee.positionId ? { positionId: employee.positionId.toString() } : {}),
      ...(employee.phone ? { phone: employee.phone } : {}),
      ...(employee.hiredAt ? { hiredAt: employee.hiredAt } : {}),
      employmentType: employee.employmentType,
      ...(employee.managerId ? { managerId: employee.managerId.toString() } : {}),
      isActive: employee.isActive !== false,
      ...(employee.userId ? { userId: employee.userId.toString() } : {}),
    };
  }

  private toDisplay(employee: object): Record<string, unknown> {
    const value = employee as Record<string, unknown>;
    const department = value.departmentId as { name?: string } | undefined;
    const position = value.positionId as { name?: string } | undefined;
    const manager = value.managerId as { fullName?: string } | undefined;
    const avatarKey = typeof value.avatarKey === 'string' ? value.avatarKey : undefined;
    return {
      ...value,
      isActive: value.isActive !== false,
      departmentName: department?.name ?? value.department,
      positionName: position?.name ?? value.position,
      managerName: manager?.fullName,
      ...(avatarKey ? { avatarUrl: this.avatarStorage.getPublicUrl(avatarKey) } : {}),
    };
  }

  private hasNonActiveChanges(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
    const { isActive: _beforeIsActive, ...beforeWithoutActive } = before;
    const { isActive: _afterIsActive, ...afterWithoutActive } = after;
    return JSON.stringify(beforeWithoutActive) !== JSON.stringify(afterWithoutActive);
  }

  private validateAvatarFile(file: Express.Multer.File | undefined): { buffer: Buffer; contentType: 'image/jpeg' | 'image/png' } {
    if (!file) throw new BadRequestException('Avatar file is required');
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) throw new BadRequestException('Avatar must not exceed 2 MB');
    if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png') {
      throw new BadRequestException('Only JPG and PNG avatar files are accepted');
    }

    const isJpeg = file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    const isPng = file.buffer.length >= 8
      && file.buffer[0] === 0x89 && file.buffer[1] === 0x50 && file.buffer[2] === 0x4e && file.buffer[3] === 0x47
      && file.buffer[4] === 0x0d && file.buffer[5] === 0x0a && file.buffer[6] === 0x1a && file.buffer[7] === 0x0a;
    if ((file.mimetype === 'image/jpeg' && !isJpeg) || (file.mimetype === 'image/png' && !isPng)) {
      throw new BadRequestException('Avatar content does not match the declared image type');
    }
    return { buffer: file.buffer, contentType: file.mimetype };
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
