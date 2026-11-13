import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { Department } from '../departments/schemas/department.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { DepartmentPosition } from '../departments/schemas/department-position.schema.js';
import { UsersService } from '../users/users.service.js';
import {
  AVATAR_STORAGE,
  type AvatarStorageAdapter,
} from './avatar-storage/avatar-storage.adapter.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { ListEmployeesDto } from './dto/list-employees.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { Employee, EmployeeDocument } from './schemas/employee.schema.js';
import { normalizeSearchText } from '../common/text/normalize-search-text.js';
import { escapeRegExp } from '../common/text/escape-reg-exp.js';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import { createPaginationMetadata } from '../common/http/pagination.js';
import { OrganizationScopeService } from '../common/organization/organization-scope.service.js';
import { OrganizationUnitType } from '../departments/enums/organization-unit-type.enum.js';
import { EmployeeCodeService } from './employee-code.service.js';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<Employee>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    @InjectModel(DepartmentPosition.name)
    private readonly departmentPositionModel: Model<DepartmentPosition>,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly organizationScopeService: OrganizationScopeService,
    @Inject(AVATAR_STORAGE)
    private readonly avatarStorage: AvatarStorageAdapter,
    private readonly employeeCodes: EmployeeCodeService,
  ) {}

  async findAll(actorUserId: string, query: ListEmployeesDto) {
    const filter: Record<string, unknown> = {};
    if (query.departmentId) filter.departmentId = query.departmentId;
    else if (query.department) {
      const department = await this.departmentModel
        .findOne({ nameNormalized: normalizeSearchText(query.department) })
        .select({ _id: 1 })
        .lean()
        .exec();
      if (!department)
        return {
          data: [],
          pagination: {
            page: query.page,
            limit: query.limit,
            total: 0,
            totalPages: 0,
          },
        };
      filter.departmentId = department._id;
    }
    if (query.workUnitId)
      filter.workUnitId = {
        $in: await this.descendantUnitIds(query.workUnitId),
      };
    if (query.employmentType) filter.employmentType = query.employmentType;
    if (query.isActive === false) filter.isActive = false;
    if (query.isActive === true) filter.isActive = { $ne: false };
    if (query.search?.trim()) {
      const rawSearch = query.search.trim();
      const expression = new RegExp(escapeRegExp(rawSearch), 'i');
      const normalizedExpression = new RegExp(
        escapeRegExp(normalizeSearchText(rawSearch)),
        'i',
      );
      const positions = await this.positionModel
        .find({ nameNormalized: normalizedExpression })
        .select({ _id: 1 })
        .lean()
        .exec();
      filter.$or = [
        { employeeCode: expression },
        { fullNameNormalized: normalizedExpression },
        { workEmail: expression },
        { positionId: { $in: positions.map((position) => position._id) } },
      ];
    }

    const scopeFilter =
      await this.organizationScopeService.employeeFilter(actorUserId);
    const scopedFilter =
      Object.keys(scopeFilter).length > 0
        ? { $and: [filter, scopeFilter] }
        : filter;

    const skip = (query.page - 1) * query.limit;
    const direction: 1 | -1 = query.sortOrder === 'asc' ? 1 : -1;
    const sortField = query.sortBy === 'fullName' ? 'fullNameNormalized' : query.sortBy;
    const [data, total] = await Promise.all([
      this.employeeModel
        .find(scopedFilter)
        .select('-dateOfBirth')
        .sort({ [sortField]: direction, _id: direction })
        .skip(skip)
        .limit(query.limit)
        .populate('departmentId', 'name')
        .populate('workUnitId', 'code name unitType parentId')
        .populate('positionId', 'name')
        .populate('managerId', 'fullName')
        .lean()
        .exec(),
      this.employeeModel.countDocuments(scopedFilter).exec(),
    ]);
    return {
      data: await this.toDisplayMany(data),
      pagination: createPaginationMetadata(query.page, query.limit, total),
    };
  }

  async findFilterOptions(actorUserId: string) {
    const scope = await this.organizationScopeService.resolve(actorUserId);
    const allowedWorkUnitIds = scope.fullAccess
      ? undefined
      : scope.departmentIds.length
        ? scope.departmentIds
        : scope.homeWorkUnitId
          ? [scope.homeWorkUnitId]
          : [];
    const workUnitFilter: Record<string, unknown> = {
      isActive: true,
      unitType: {
        $in: [
          OrganizationUnitType.COMPANY,
          OrganizationUnitType.HEADQUARTERS,
          OrganizationUnitType.REGION,
          OrganizationUnitType.STORE,
        ],
      },
      ...(allowedWorkUnitIds ? { _id: { $in: allowedWorkUnitIds } } : {}),
    };
    const [departments, workUnits] = await Promise.all([
      this.departmentModel
        .find({
          isActive: true,
          $or: [
            {
              unitType: {
                $in: [
                  OrganizationUnitType.FUNCTIONAL,
                  OrganizationUnitType.DEPARTMENT,
                  OrganizationUnitType.UNCLASSIFIED,
                ],
              },
            },
            { unitType: { $exists: false } },
          ],
        })
        .sort({ sortOrder: 1, name: 1 })
        .select({ code: 1, name: 1, unitType: 1 })
        .lean()
        .exec(),
      this.departmentModel
        .find(workUnitFilter)
        .sort({ sortOrder: 1, name: 1 })
        .select({
          code: 1,
          name: 1,
          unitType: 1,
          parentId: 1,
          managerEmployeeId: 1,
        })
        .lean()
        .exec(),
    ]);
    const toOption = (
      item: Record<string, unknown> & { _id: { toString(): string } },
    ) => ({
      id: item._id.toString(),
      code: item.code,
      name: item.name,
      unitType: item.unitType ?? OrganizationUnitType.UNCLASSIFIED,
      ...(item.parentId ? { parentId: String(item.parentId) } : {}),
      ...(item.managerEmployeeId
        ? { managerEmployeeId: String(item.managerEmployeeId) }
        : {}),
    });
    return {
      departments: departments.map((item) =>
        toOption(
          item as unknown as Record<string, unknown> & {
            _id: { toString(): string };
          },
        ),
      ),
      workUnits: workUnits.map((item) =>
        toOption(
          item as unknown as Record<string, unknown> & {
            _id: { toString(): string };
          },
        ),
      ),
    };
  }

  async findOne(actorUserId: string, id: string) {
    await this.ensureEmployeeAccess(actorUserId, id);
    const employee = await this.employeeModel
      .findById(id)
      .populate('departmentId', 'name')
      .populate('workUnitId', 'code name unitType parentId')
      .populate('positionId', 'name')
      .populate('managerId', 'fullName')
      .lean()
      .exec();
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên.');
    return (await this.toDisplayMany([employee]))[0];
  }

  async create(request: RequestWithContext, input: CreateEmployeeDto) {
    await this.ensureWorkUnitAccess(request.user!.id, input.workUnitId);
    await this.ensureManagerIsValid(input.managerId);
    const references = {
      ...(await this.resolveReferences(input.departmentId, input.positionId)),
      workUnitId: await this.resolveWorkUnit(input.workUnitId),
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const employee = await this.employeeModel.create({
          ...input,
          ...references,
          employeeCode: await this.employeeCodes.allocateNext(),
          workEmail: input.workEmail.toLowerCase(),
          fullNameNormalized: normalizeSearchText(input.fullName),
          isActive: input.isActive ?? true,
          createdBy: request.user?.id,
          updatedBy: request.user?.id,
        });
        await this.audit(
          request,
          'EMPLOYEE.CREATED',
          employee,
          undefined,
          this.snapshot(employee),
        );
        return (await this.toDisplayMany([employee.toObject()]))[0];
      } catch (error) {
        if (this.isDuplicateEmployeeCodeError(error)) continue;
        if (
          isMongoDuplicateKeyError(error) &&
          typeof error.keyPattern?.workEmail !== 'undefined'
        ) {
          throw new ConflictException({
            message: 'Email đã được sử dụng cho một nhân viên khác.',
            code: 'EMAIL_ALREADY_EXISTS',
            field: 'workEmail',
          });
        }
        if (
          isMongoDuplicateKeyError(error) &&
          typeof error.keyPattern?.citizenId !== 'undefined'
        ) {
          throw new ConflictException({
            message: 'Số CCCD đã được sử dụng cho một nhân viên khác.',
            code: 'CITIZEN_ID_ALREADY_EXISTS',
            field: 'citizenId',
          });
        }
        if (isMongoDuplicateKeyError(error))
          throw new ConflictException('Dữ liệu nhân viên đã tồn tại.');
        throw error;
      }
    }
    throw new ConflictException(
      'Không thể tạo mã nhân viên mới. Vui lòng thử lại.',
    );
  }

  async getNextEmployeeCode(): Promise<string> {
    return this.employeeCodes.previewNext();
  }

  async update(
    request: RequestWithContext,
    id: string,
    input: UpdateEmployeeDto,
  ) {
    await this.ensureEmployeeAccess(request.user!.id, id);
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên.');
    if (input.departmentId === null || input.positionId === null) {
      throw new BadRequestException(
        'Phòng ban và chức danh của nhân viên không được để trống.',
      );
    }
    const before = this.snapshot(employee);
    const nextManagerId =
      input.managerId === null
        ? undefined
        : (input.managerId ?? employee.managerId?.toString());
    await this.ensureManagerIsValid(nextManagerId, employee._id.toString());
    const departmentIdChanged =
      input.departmentId !== undefined &&
      input.departmentId !== employee.departmentId?.toString();
    const positionIdChanged =
      input.positionId !== undefined &&
      input.positionId !== employee.positionId?.toString();
    const references =
      departmentIdChanged || positionIdChanged
        ? await this.resolveReferences(
            input.departmentId ?? employee.departmentId?.toString(),
            input.positionId ?? employee.positionId?.toString(),
          )
        : {};
    const workUnitIdChanged =
      input.workUnitId !== undefined &&
      input.workUnitId !== employee.workUnitId?.toString();
    if (input.workUnitId)
      await this.ensureWorkUnitAccess(request.user!.id, input.workUnitId);
    const workUnitReference = workUnitIdChanged
      ? { workUnitId: await this.resolveWorkUnit(input.workUnitId!) }
      : {};

    const update: Record<string, unknown> = {
      ...input,
      ...references,
      ...workUnitReference,
      ...(input.isActive === false && employee.isActive
        ? { endedAt: new Date() }
        : {}),
    };
    const unset: Record<string, 1> = {};
    if (input.workEmail) update.workEmail = input.workEmail.toLowerCase();
    if (input.fullName)
      update.fullNameNormalized = normalizeSearchText(input.fullName);
    update.updatedBy = request.user?.id;
    if (input.managerId === null) {
      delete update.managerId;
      unset.managerId = 1;
    }
    if (input.annualLeaveDays === null) {
      delete update.annualLeaveDays;
      unset.annualLeaveDays = 1;
    }
    if (input.gender === null) {
      delete update.gender;
      unset.gender = 1;
    }
    if (input.citizenId === null) {
      delete update.citizenId;
      unset.citizenId = 1;
    }
    if (input.isActive === true && !employee.isActive) unset.endedAt = 1;

    try {
      const updated = await this.employeeModel
        .findByIdAndUpdate(
          id,
          {
            $set: update,
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
          },
          { returnDocument: 'after', runValidators: true },
        )
        .exec();
      if (!updated) throw new NotFoundException('Không tìm thấy nhân viên.');

      const after = this.snapshot(updated);
      const activeChanged = before.isActive !== after.isActive;
      const action =
        activeChanged && !this.hasNonActiveChanges(before, after)
          ? after.isActive
            ? 'EMPLOYEE.ACTIVATED'
            : 'EMPLOYEE.DEACTIVATED'
          : 'EMPLOYEE.UPDATED';
      await this.audit(request, action, updated, before, after);
      return (await this.toDisplayMany([updated.toObject()]))[0];
    } catch (error) {
      if (
        isMongoDuplicateKeyError(error) &&
        typeof error.keyPattern?.workEmail !== 'undefined'
      ) {
        throw new ConflictException({
          message: 'Email đã được sử dụng cho một nhân viên khác.',
          code: 'EMAIL_ALREADY_EXISTS',
          field: 'workEmail',
        });
      }
      if (
        isMongoDuplicateKeyError(error) &&
        typeof error.keyPattern?.citizenId !== 'undefined'
      ) {
        throw new ConflictException({
          message: 'Số CCCD đã được sử dụng cho một nhân viên khác.',
          code: 'CITIZEN_ID_ALREADY_EXISTS',
          field: 'citizenId',
        });
      }
      if (isMongoDuplicateKeyError(error))
        throw new ConflictException(
          'Mã nhân viên hoặc dữ liệu liên kết đã tồn tại.',
        );
      throw error;
    }
  }

  async uploadAvatar(
    request: RequestWithContext,
    id: string,
    file: Express.Multer.File | undefined,
  ) {
    await this.ensureEmployeeAccess(request.user!.id, id);
    const validatedFile = this.validateAvatarFile(file);
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên.');

    const stored = await this.avatarStorage.store(validatedFile);
    const oldAvatarKey = employee.avatarKey;
    try {
      employee.avatarKey = stored.key;
      employee.avatar = {
        contentType: stored.contentType,
        size: stored.size,
        updatedAt: new Date(),
      };
      await employee.save();
    } catch (error) {
      await this.avatarStorage.remove(stored.key);
      throw error;
    }

    if (oldAvatarKey) await this.avatarStorage.remove(oldAvatarKey);
    await this.audit(request, 'EMPLOYEE.AVATAR_UPDATED', employee, undefined, {
      avatarUpdated: true,
    });
    return (await this.toDisplayMany([employee.toObject()]))[0];
  }

  async removeAvatar(request: RequestWithContext, id: string) {
    await this.ensureEmployeeAccess(request.user!.id, id);
    const employee = await this.employeeModel.findById(id).exec();
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên.');
    const oldAvatarKey = employee.avatarKey;
    if (!oldAvatarKey)
      return (await this.toDisplayMany([employee.toObject()]))[0];

    employee.avatarKey = undefined;
    employee.avatar = undefined;
    await employee.save();
    await this.avatarStorage.remove(oldAvatarKey);
    await this.audit(
      request,
      'EMPLOYEE.AVATAR_REMOVED',
      employee,
      { avatarRemoved: false },
      { avatarRemoved: true },
    );
    return (await this.toDisplayMany([employee.toObject()]))[0];
  }

  private async ensureManagerIsValid(
    managerId?: string,
    employeeId?: string,
  ): Promise<void> {
    if (!managerId) return;
    if (managerId === employeeId)
      throw new BadRequestException(
        'Nhân viên không thể là quản lý trực tiếp của chính mình.',
      );
    const manager = await this.employeeModel.exists({
      _id: managerId,
      isActive: { $ne: false },
    });
    if (!manager)
      throw new BadRequestException('Quản lý trực tiếp không tồn tại.');
    let cursor: string | undefined = managerId;
    const visited = new Set<string>();
    if (employeeId) visited.add(employeeId);
    while (cursor) {
      if (visited.has(cursor))
        throw new BadRequestException(
          'Cấu trúc quản lý nhân viên không được tạo thành vòng lặp.',
        );
      visited.add(cursor);
      const current = await this.employeeModel
        .findById(cursor)
        .select({ managerId: 1 })
        .lean()
        .exec();
      cursor = current?.managerId?.toString();
    }
  }

  private async ensureEmployeeAccess(
    actorUserId: string,
    employeeId: string,
  ): Promise<void> {
    if (
      !(await this.organizationScopeService.canAccessEmployee(
        actorUserId,
        employeeId,
      ))
    ) {
      throw new NotFoundException('Không tìm thấy nhân viên.');
    }
  }

  private async ensureWorkUnitAccess(
    actorUserId: string,
    workUnitId?: string,
  ): Promise<void> {
    if (
      !workUnitId ||
      !(await this.organizationScopeService.canAccessDepartment(
        actorUserId,
        workUnitId,
      ))
    ) {
      throw new NotFoundException('Không tìm thấy đơn vị tổ chức.');
    }
  }

  private async resolveWorkUnit(workUnitId: string): Promise<Types.ObjectId> {
    const workUnit = await this.departmentModel
      .findOne({
        _id: workUnitId,
        isActive: true,
        unitType: {
          $in: [
            OrganizationUnitType.COMPANY,
            OrganizationUnitType.HEADQUARTERS,
            OrganizationUnitType.REGION,
            OrganizationUnitType.STORE,
          ],
        },
      })
      .select({ _id: 1 })
      .lean()
      .exec();
    if (!workUnit)
      throw new BadRequestException(
        'Đơn vị làm việc không tồn tại, đã ngưng hoạt động hoặc không thuộc cây tổ chức.',
      );
    return workUnit._id;
  }

  private async resolveReferences(
    departmentId?: string,
    positionId?: string,
  ): Promise<Record<string, unknown>> {
    const resolved: Record<string, unknown> = {};
    let resolvedDepartmentId: string | undefined;
    let resolvedPositionId: string | undefined;
    if (departmentId) {
      const department = await this.departmentModel
        .findOne({
          _id: departmentId,
          isActive: true,
          $or: [
            {
              unitType: {
                $in: [
                  OrganizationUnitType.FUNCTIONAL,
                  OrganizationUnitType.DEPARTMENT,
                  OrganizationUnitType.UNCLASSIFIED,
                ],
              },
            },
            { unitType: { $exists: false } },
          ],
        })
        .exec();
      if (!department)
        throw new BadRequestException(
          'Phòng ban không tồn tại hoặc đã ngưng hoạt động.',
        );
      resolved.departmentId = department._id;
      resolvedDepartmentId = department._id.toString();
    }
    if (positionId) {
      const position = await this.positionModel
        .findOne({ _id: positionId, isActive: true })
        .exec();
      if (!position)
        throw new BadRequestException(
          'Chức danh không tồn tại hoặc đã ngưng hoạt động.',
        );
      resolved.positionId = position._id;
      resolvedPositionId = position._id.toString();
    }
    if (!resolvedDepartmentId || !resolvedPositionId)
      throw new BadRequestException('Phòng ban và chức danh là bắt buộc.');
    if (
      !(await this.departmentPositionModel.exists({
        departmentId: resolvedDepartmentId,
        positionId: resolvedPositionId,
      }))
    ) {
      throw new BadRequestException(
        'Chức danh chưa được gán cho phòng ban đã chọn.',
      );
    }
    return resolved;
  }

  private async audit(
    request: RequestWithContext,
    action: string,
    employee: EmployeeDocument,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogService.record(request, {
      action,
      outcome: AuditOutcome.SUCCESS,
      resource: {
        type: 'EMPLOYEE',
        id: employee._id.toString(),
        code: employee.employeeCode,
      },
      ...(before || after
        ? {
            changes: {
              ...(before ? { before } : {}),
              ...(after ? { after } : {}),
            },
          }
        : {}),
    });
  }

  private snapshot(employee: EmployeeDocument): Record<string, unknown> {
    return {
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      workEmail: employee.workEmail,
      departmentId: employee.departmentId.toString(),
      ...(employee.workUnitId
        ? { workUnitId: employee.workUnitId.toString() }
        : {}),
      positionId: employee.positionId.toString(),
      ...(employee.phone ? { phone: employee.phone } : {}),
      ...(employee.address ? { address: employee.address } : {}),
      ...(employee.dateOfBirth ? { dateOfBirth: employee.dateOfBirth } : {}),
      ...(employee.gender ? { gender: employee.gender } : {}),
      ...(employee.citizenId ? { citizenId: employee.citizenId } : {}),
      ...(employee.hiredAt ? { hiredAt: employee.hiredAt } : {}),
      ...(employee.annualLeaveDays !== undefined
        ? { annualLeaveDays: employee.annualLeaveDays }
        : {}),
      employmentType: employee.employmentType,
      ...(employee.managerId
        ? { managerId: employee.managerId.toString() }
        : {}),
      isActive: employee.isActive !== false,
    };
  }

  private async toDisplayMany(
    employees: object[],
  ): Promise<Record<string, unknown>[]> {
    const values = employees as Array<Record<string, unknown>>;
    const ids = values.flatMap((employee) =>
      employee._id ? [String(employee._id)] : [],
    );
    const relationId = (value: unknown): string => {
      if (value && typeof value === 'object' && '_id' in value)
        return String((value as { _id: unknown })._id);
      return value ? String(value) : '';
    };
    const departmentIds = [
      ...new Set(
        values
          .map((employee) => relationId(employee.departmentId))
          .filter(Boolean),
      ),
    ];
    const workUnitIds = [
      ...new Set(
        values
          .map((employee) => relationId(employee.workUnitId))
          .filter(Boolean),
      ),
    ];
    const positionIds = [
      ...new Set(
        values
          .map((employee) => relationId(employee.positionId))
          .filter(Boolean),
      ),
    ];
    const [userIdByEmployeeId, departments, workUnits, positions] =
      await Promise.all([
        this.usersService.findLinksByEmployeeIds(ids),
        this.departmentModel
          .find({ _id: { $in: departmentIds } })
          .select({ name: 1 })
          .lean()
          .exec(),
        this.departmentModel
          .find({ _id: { $in: workUnitIds } })
          .select({ code: 1, name: 1, unitType: 1, parentId: 1 })
          .lean()
          .exec(),
        this.positionModel
          .find({ _id: { $in: positionIds } })
          .select({ name: 1 })
          .lean()
          .exec(),
      ]);
    const departmentNames = new Map(
      departments.map((department) => [
        department._id.toString(),
        department.name,
      ]),
    );
    const workUnitsById = new Map(
      workUnits.map((workUnit) => [workUnit._id.toString(), workUnit]),
    );
    const positionNames = new Map(
      positions.map((position) => [position._id.toString(), position.name]),
    );
    return employees.map((employee) => {
      const value = employee as Record<string, unknown>;
      const departmentId = relationId(value.departmentId);
      const workUnitId = relationId(value.workUnitId);
      const positionId = relationId(value.positionId);
      const manager = value.managerId as { fullName?: string } | undefined;
      const managerId = relationId(value.managerId);
      const avatarKey =
        typeof value.avatarKey === 'string' ? value.avatarKey : undefined;
      const employeeId = String(value._id ?? '');
      return {
        ...value,
        departmentId,
        ...(workUnitId ? { workUnitId } : {}),
        positionId,
        ...(managerId ? { managerId } : {}),
        isActive: value.isActive !== false,
        department: departmentNames.get(departmentId) ?? '',
        departmentName: departmentNames.get(departmentId) ?? '',
        workUnit: workUnitId
          ? (workUnitsById.get(workUnitId)?.name ?? '')
          : 'Chưa thiết lập',
        workUnitName: workUnitId
          ? (workUnitsById.get(workUnitId)?.name ?? '')
          : undefined,
        workUnitType: workUnitId
          ? workUnitsById.get(workUnitId)?.unitType
          : undefined,
        position: positionNames.get(positionId) ?? '',
        positionName: positionNames.get(positionId) ?? '',
        managerName: manager?.fullName,
        ...(userIdByEmployeeId.get(employeeId)
          ? { userId: userIdByEmployeeId.get(employeeId) }
          : {}),
        ...(avatarKey
          ? { avatarUrl: this.avatarStorage.getPublicUrl(avatarKey) }
          : {}),
      };
    });
  }

  private hasNonActiveChanges(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): boolean {
    const { isActive: _beforeIsActive, ...beforeWithoutActive } = before;
    const { isActive: _afterIsActive, ...afterWithoutActive } = after;
    return (
      JSON.stringify(beforeWithoutActive) !== JSON.stringify(afterWithoutActive)
    );
  }

  private async descendantUnitIds(rootId: string): Promise<string[]> {
    const root = await this.departmentModel
      .findById(rootId)
      .select({ _id: 1 })
      .lean()
      .exec();
    if (!root) return [];
    const result = new Set([rootId]);
    let frontier = [rootId];
    while (frontier.length) {
      const children = await this.departmentModel
        .find({ parentId: { $in: frontier } })
        .select({ _id: 1 })
        .lean()
        .exec();
      frontier = children
        .map((child) => child._id.toString())
        .filter((id) => !result.has(id));
      for (const id of frontier) result.add(id);
    }
    return [...result];
  }

  private validateAvatarFile(file: Express.Multer.File | undefined): {
    buffer: Buffer;
    contentType: 'image/jpeg' | 'image/png';
  } {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh đại diện.');
    if (file.size <= 0 || file.size > 2 * 1024 * 1024)
      throw new BadRequestException('Ảnh đại diện không được vượt quá 2 MB.');
    if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png') {
      throw new BadRequestException(
        'Ảnh đại diện chỉ hỗ trợ định dạng JPG và PNG.',
      );
    }

    const isJpeg =
      file.buffer.length >= 3 &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff;
    const isPng =
      file.buffer.length >= 8 &&
      file.buffer[0] === 0x89 &&
      file.buffer[1] === 0x50 &&
      file.buffer[2] === 0x4e &&
      file.buffer[3] === 0x47 &&
      file.buffer[4] === 0x0d &&
      file.buffer[5] === 0x0a &&
      file.buffer[6] === 0x1a &&
      file.buffer[7] === 0x0a;
    if (
      (file.mimetype === 'image/jpeg' && !isJpeg) ||
      (file.mimetype === 'image/png' && !isPng)
    ) {
      throw new BadRequestException(
        'Nội dung ảnh đại diện không khớp với định dạng đã khai báo.',
      );
    }
    return { buffer: file.buffer, contentType: file.mimetype };
  }

  private isDuplicateEmployeeCodeError(error: unknown): boolean {
    return (
      isMongoDuplicateKeyError(error) &&
      typeof error.keyPattern?.employeeCode !== 'undefined'
    );
  }
}
