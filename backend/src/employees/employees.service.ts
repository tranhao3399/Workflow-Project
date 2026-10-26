import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { Department } from '../departments/schemas/department.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { DepartmentPosition } from '../departments/schemas/department-position.schema.js';
import { UsersService } from '../users/users.service.js';
import { AVATAR_STORAGE, type AvatarStorageAdapter } from './avatar-storage/avatar-storage.adapter.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { ListEmployeesDto } from './dto/list-employees.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { Employee, EmployeeDocument } from './schemas/employee.schema.js';
import { normalizeSearchText } from '../common/text/normalize-search-text.js';
import { escapeRegExp } from '../common/text/escape-reg-exp.js';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import { createPaginationMetadata } from '../common/http/pagination.js';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<Employee>,
    @InjectModel(Department.name) private readonly departmentModel: Model<Department>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    @InjectModel(DepartmentPosition.name) private readonly departmentPositionModel: Model<DepartmentPosition>,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    @Inject(AVATAR_STORAGE) private readonly avatarStorage: AvatarStorageAdapter,
  ) {}

  async findAll(query: ListEmployeesDto) {
    const filter: Record<string, unknown> = {};
    if (query.departmentId) filter.departmentId = query.departmentId;
    else if (query.department) {
      const department = await this.departmentModel.findOne({ nameNormalized: normalizeSearchText(query.department) }).select({ _id: 1 }).lean().exec();
      if (!department) return { data: [], pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 } };
      filter.departmentId = department._id;
    }
    if (query.isActive === false) filter.isActive = false;
    if (query.isActive === true) filter.isActive = { $ne: false };
    if (query.search?.trim()) {
      const rawSearch = query.search.trim();
      const expression = new RegExp(escapeRegExp(rawSearch), 'i');
      const normalizedExpression = new RegExp(escapeRegExp(normalizeSearchText(rawSearch)), 'i');
      const positions = await this.positionModel.find({ nameNormalized: normalizedExpression }).select({ _id: 1 }).lean().exec();
      filter.$or = [{ employeeCode: expression }, { fullNameNormalized: normalizedExpression }, { workEmail: expression }, { positionId: { $in: positions.map((position) => position._id) } }];
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.employeeModel.find(filter).select('-dateOfBirth').sort({ createdAt: -1 }).skip(skip).limit(query.limit).populate('departmentId', 'name').populate('positionId', 'name').populate('managerId', 'fullName').lean().exec(),
      this.employeeModel.countDocuments(filter).exec(),
    ]);
    return { data: await this.toDisplayMany(data), pagination: createPaginationMetadata(query.page, query.limit, total) };
  }

  async findOne(id: string) {
    const employee = await this.employeeModel.findById(id).populate('departmentId', 'name').populate('positionId', 'name').populate('managerId', 'fullName').lean().exec();
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên.');
    return (await this.toDisplayMany([employee]))[0];
  }

  async create(request: RequestWithContext, input: CreateEmployeeDto) {
    await this.ensureManagerIsValid(input.managerId);
    const references = await this.resolveReferences(input.departmentId, input.positionId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const employee = await this.employeeModel.create({
          ...input,
          ...references,
          employeeCode: await this.getNextEmployeeCode(),
          workEmail: input.workEmail.toLowerCase(),
          fullNameNormalized: normalizeSearchText(input.fullName),
          isActive: input.isActive ?? true,
          createdBy: request.user?.id,
          updatedBy: request.user?.id,
        });
        await this.audit(request, 'EMPLOYEE.CREATED', employee, undefined, this.snapshot(employee));
        return (await this.toDisplayMany([employee.toObject()]))[0];
      } catch (error) {
        if (this.isDuplicateEmployeeCodeError(error)) continue;
        if (isMongoDuplicateKeyError(error) && typeof error.keyPattern?.workEmail !== 'undefined') {
          throw new ConflictException({
            message: 'Email đã được sử dụng cho một nhân viên khác.',
            code: 'EMAIL_ALREADY_EXISTS',
            field: 'workEmail',
          });
        }
        if (isMongoDuplicateKeyError(error)) throw new ConflictException('Dữ liệu nhân viên đã tồn tại.');
        throw error;
      }
    }
    throw new ConflictException('Không thể tạo mã nhân viên mới. Vui lòng thử lại.');
  }

  async getNextEmployeeCode(): Promise<string> {
    const employees = await this.employeeModel.find({ employeeCode: /^NV-\d+$/i }).select({ employeeCode: 1 }).lean().exec();
    const largestSequence = employees.reduce((largest, employee) => {
      const sequence = Number.parseInt(employee.employeeCode.slice(3), 10);
      return Number.isSafeInteger(sequence) ? Math.max(largest, sequence) : largest;
    }, 0);
    return `NV-${String(largestSequence + 1).padStart(3, '0')}`;
  }

  async update(request: RequestWithContext, id: string, input: UpdateEmployeeDto) {
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên.');
    if (input.departmentId === null || input.positionId === null) {
      throw new BadRequestException('Phòng ban và chức danh của nhân viên không được để trống.');
    }
    const before = this.snapshot(employee);
    const nextManagerId = input.managerId === null ? undefined : input.managerId ?? employee.managerId?.toString();
    await this.ensureManagerIsValid(nextManagerId, employee._id.toString());
    const departmentIdChanged = input.departmentId !== undefined && input.departmentId !== employee.departmentId?.toString();
    const positionIdChanged = input.positionId !== undefined && input.positionId !== employee.positionId?.toString();
    const references = departmentIdChanged || positionIdChanged
      ? await this.resolveReferences(
        input.departmentId ?? employee.departmentId?.toString(),
        input.positionId ?? employee.positionId?.toString(),
      )
      : {};

    const update: Record<string, unknown> = {
      ...input,
      ...references,
      ...(input.isActive === false && employee.isActive ? { endedAt: new Date() } : {}),
    };
    const unset: Record<string, 1> = {};
    if (input.workEmail) update.workEmail = input.workEmail.toLowerCase();
    if (input.fullName) update.fullNameNormalized = normalizeSearchText(input.fullName);
    update.updatedBy = request.user?.id;
    if (input.managerId === null) { delete update.managerId; unset.managerId = 1; }
    if (input.isActive === true && !employee.isActive) unset.endedAt = 1;

    try {
      const updated = await this.employeeModel.findByIdAndUpdate(
        id,
        { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { returnDocument: 'after', runValidators: true },
      ).exec();
      if (!updated) throw new NotFoundException('Không tìm thấy nhân viên.');

      const after = this.snapshot(updated);
      const activeChanged = before.isActive !== after.isActive;
      const action = activeChanged && !this.hasNonActiveChanges(before, after)
        ? (after.isActive ? 'EMPLOYEE.ACTIVATED' : 'EMPLOYEE.DEACTIVATED')
        : 'EMPLOYEE.UPDATED';
      await this.audit(request, action, updated, before, after);
      return (await this.toDisplayMany([updated.toObject()]))[0];
    } catch (error) {
      if (isMongoDuplicateKeyError(error) && typeof error.keyPattern?.workEmail !== 'undefined') {
        throw new ConflictException({
          message: 'Email đã được sử dụng cho một nhân viên khác.',
          code: 'EMAIL_ALREADY_EXISTS',
          field: 'workEmail',
        });
      }
      if (isMongoDuplicateKeyError(error)) throw new ConflictException('Mã nhân viên hoặc dữ liệu liên kết đã tồn tại.');
      throw error;
    }
  }

  async uploadAvatar(request: RequestWithContext, id: string, file: Express.Multer.File | undefined) {
    const validatedFile = this.validateAvatarFile(file);
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên.');

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
    return (await this.toDisplayMany([employee.toObject()]))[0];
  }

  async removeAvatar(request: RequestWithContext, id: string) {
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên.');
    const oldAvatarKey = employee.avatarKey;
    if (!oldAvatarKey) return (await this.toDisplayMany([employee.toObject()]))[0];

    employee.avatarKey = undefined;
    employee.avatar = undefined;
    await employee.save();
    await this.avatarStorage.remove(oldAvatarKey);
    await this.audit(request, 'EMPLOYEE.AVATAR_REMOVED', employee, { avatarRemoved: false }, { avatarRemoved: true });
    return (await this.toDisplayMany([employee.toObject()]))[0];
  }

  private async ensureManagerIsValid(managerId?: string, employeeId?: string): Promise<void> {
    if (!managerId) return;
    if (managerId === employeeId) throw new BadRequestException('Nhân viên không thể là quản lý trực tiếp của chính mình.');
    const manager = await this.employeeModel.exists({ _id: managerId, isActive: { $ne: false } });
    if (!manager) throw new BadRequestException('Quản lý trực tiếp không tồn tại.');
    let cursor: string | undefined = managerId;
    while (cursor) {
      if (cursor === employeeId) throw new BadRequestException('Cấu trúc quản lý nhân viên không được tạo thành vòng lặp.');
      const current = await this.employeeModel.findById(cursor).select({ managerId: 1 }).lean().exec();
      cursor = current?.managerId?.toString();
    }
  }

  private async resolveReferences(departmentId?: string, positionId?: string): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};
    let resolvedDepartmentId: string | undefined;
    let resolvedPositionId: string | undefined;
    if (departmentId) {
      const department = await this.departmentModel.findOne({ _id: departmentId, isActive: true }).exec();
    if (!department) throw new BadRequestException('Phòng ban không tồn tại hoặc đã ngưng hoạt động.');
      resolved.departmentId = department._id;
      resolvedDepartmentId = department._id.toString();
    }
    if (positionId) {
      const position = await this.positionModel.findOne({ _id: positionId, isActive: true }).exec();
    if (!position) throw new BadRequestException('Chức danh không tồn tại hoặc đã ngưng hoạt động.');
      resolved.positionId = position._id;
      resolvedPositionId = position._id.toString();
    }
    if (!resolvedDepartmentId || !resolvedPositionId) throw new BadRequestException('Phòng ban và chức danh là bắt buộc.');
    if (!await this.departmentPositionModel.exists({ departmentId: resolvedDepartmentId, positionId: resolvedPositionId })) {
      throw new BadRequestException('Chức danh chưa được gán cho phòng ban đã chọn.');
    }
    return resolved;
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
      departmentId: employee.departmentId.toString(),
      positionId: employee.positionId.toString(),
      ...(employee.phone ? { phone: employee.phone } : {}),
      ...(employee.address ? { address: employee.address } : {}),
      ...(employee.dateOfBirth ? { dateOfBirth: employee.dateOfBirth } : {}),
      ...(employee.hiredAt ? { hiredAt: employee.hiredAt } : {}),
      employmentType: employee.employmentType,
      ...(employee.managerId ? { managerId: employee.managerId.toString() } : {}),
      isActive: employee.isActive !== false,
    };
  }

  private async toDisplayMany(employees: object[]): Promise<Record<string, unknown>[]> {
    const values = employees as Array<Record<string, unknown>>;
    const ids = values.flatMap((employee) => employee._id ? [String(employee._id)] : []);
    const relationId = (value: unknown): string => {
      if (value && typeof value === 'object' && '_id' in value) return String((value as { _id: unknown })._id);
      return value ? String(value) : '';
    };
    const departmentIds = [...new Set(values.map((employee) => relationId(employee.departmentId)).filter(Boolean))];
    const positionIds = [...new Set(values.map((employee) => relationId(employee.positionId)).filter(Boolean))];
    const [userIdByEmployeeId, departments, positions] = await Promise.all([
      this.usersService.findLinksByEmployeeIds(ids),
      this.departmentModel.find({ _id: { $in: departmentIds } }).select({ name: 1 }).lean().exec(),
      this.positionModel.find({ _id: { $in: positionIds } }).select({ name: 1 }).lean().exec(),
    ]);
    const departmentNames = new Map(departments.map((department) => [department._id.toString(), department.name]));
    const positionNames = new Map(positions.map((position) => [position._id.toString(), position.name]));
    return employees.map((employee) => {
      const value = employee as Record<string, unknown>;
      const departmentId = relationId(value.departmentId);
      const positionId = relationId(value.positionId);
      const manager = value.managerId as { fullName?: string } | undefined;
      const managerId = relationId(value.managerId);
      const avatarKey = typeof value.avatarKey === 'string' ? value.avatarKey : undefined;
      const employeeId = String(value._id ?? '');
      return {
        ...value,
        departmentId,
        positionId,
        ...(managerId ? { managerId } : {}),
        isActive: value.isActive !== false,
        department: departmentNames.get(departmentId) ?? '',
        departmentName: departmentNames.get(departmentId) ?? '',
        position: positionNames.get(positionId) ?? '',
        positionName: positionNames.get(positionId) ?? '',
        managerName: manager?.fullName,
        ...(userIdByEmployeeId.get(employeeId) ? { userId: userIdByEmployeeId.get(employeeId) } : {}),
        ...(avatarKey ? { avatarUrl: this.avatarStorage.getPublicUrl(avatarKey) } : {}),
      };
    });
  }

  private hasNonActiveChanges(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
    const { isActive: _beforeIsActive, ...beforeWithoutActive } = before;
    const { isActive: _afterIsActive, ...afterWithoutActive } = after;
    return JSON.stringify(beforeWithoutActive) !== JSON.stringify(afterWithoutActive);
  }

  private validateAvatarFile(file: Express.Multer.File | undefined): { buffer: Buffer; contentType: 'image/jpeg' | 'image/png' } {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh đại diện.');
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) throw new BadRequestException('Ảnh đại diện không được vượt quá 2 MB.');
    if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png') {
      throw new BadRequestException('Ảnh đại diện chỉ hỗ trợ định dạng JPG và PNG.');
    }

    const isJpeg = file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    const isPng = file.buffer.length >= 8
      && file.buffer[0] === 0x89 && file.buffer[1] === 0x50 && file.buffer[2] === 0x4e && file.buffer[3] === 0x47
      && file.buffer[4] === 0x0d && file.buffer[5] === 0x0a && file.buffer[6] === 0x1a && file.buffer[7] === 0x0a;
    if ((file.mimetype === 'image/jpeg' && !isJpeg) || (file.mimetype === 'image/png' && !isPng)) {
      throw new BadRequestException('Nội dung ảnh đại diện không khớp với định dạng đã khai báo.');
    }
    return { buffer: file.buffer, contentType: file.mimetype };
  }

  private isDuplicateEmployeeCodeError(error: unknown): boolean {
    return isMongoDuplicateKeyError(error)
      && typeof error.keyPattern?.employeeCode !== 'undefined';
  }
}
