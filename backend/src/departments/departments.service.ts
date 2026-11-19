import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import { createPaginationMetadata } from '../common/http/pagination.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { OrganizationScopeService } from '../common/organization/organization-scope.service.js';
import { escapeRegExp } from '../common/text/escape-reg-exp.js';
import { normalizeSearchText } from '../common/text/normalize-search-text.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import {
  CreateDepartmentDto,
  ListDepartmentsDto,
  UpdateDepartmentDto,
} from './dto/department.dto.js';
import { Department, DepartmentDocument } from './schemas/department.schema.js';
import { DepartmentPosition } from './schemas/department-position.schema.js';
import { OrganizationUnitType } from './enums/organization-unit-type.enum.js';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name)
    private readonly departments: Model<Department>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
    @InjectModel(DepartmentPosition.name)
    private readonly departmentPositions: Model<DepartmentPosition>,
    private readonly auditLogs: AuditLogService,
    private readonly organizationScope: OrganizationScopeService,
  ) {}

  async findAll(actorUserId: string, query: ListDepartmentsDto) {
    const filter: Record<string, unknown> =
      query.active === undefined ? {} : { isActive: query.active };
    if (query.unitType) {
      filter.unitType =
        query.unitType === OrganizationUnitType.UNCLASSIFIED
          ? { $in: [OrganizationUnitType.UNCLASSIFIED, null] }
          : query.unitType;
    }
    if (query.search?.trim()) {
      const raw = query.search.trim();
      filter.$or = [
        { code: new RegExp(escapeRegExp(raw), 'i') },
        {
          nameNormalized: new RegExp(
            escapeRegExp(normalizeSearchText(raw)),
            'i',
          ),
        },
      ];
    }
    const scope = await this.organizationScope.resolve(actorUserId);
    const scopedFilter = scope.fullAccess
      ? filter
      : { $and: [filter, { _id: { $in: scope.departmentIds } }] };
    const allowedDepartmentIds = scope.fullAccess
      ? undefined
      : new Set(scope.departmentIds);
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.departments
        .find(scopedFilter)
        .sort({ sortOrder: 1, name: 1 })
        .skip(skip)
        .limit(query.limit)
        .populate('parentId', 'code name')
        .populate('managerEmployeeId', 'employeeCode fullName')
        .lean()
        .exec(),
      this.departments.countDocuments(scopedFilter).exec(),
    ]);
    return {
      data: data.map((item) => this.toOrganizationUnit(item, allowedDepartmentIds)),
      pagination: createPaginationMetadata(query.page, query.limit, total),
    };
  }

  async findCatalog(
    actorUserId: string,
    query: Pick<ListDepartmentsDto, 'active'>,
  ) {
    const scope = await this.organizationScope.resolve(actorUserId);
    const baseFilter = query.active === undefined ? {} : { isActive: query.active };
    const filter = scope.fullAccess
      ? baseFilter
      : { $and: [baseFilter, { _id: { $in: scope.departmentIds } }] };
    const allowedDepartmentIds = scope.fullAccess
      ? undefined
      : new Set(scope.departmentIds);
    const items = await this.departments
      .find(filter)
      .sort({ sortOrder: 1, name: 1 })
      .populate('parentId', 'code name')
      .populate('managerEmployeeId', 'employeeCode fullName')
      .lean()
      .exec();
    const departmentIds = items.map((item) => item._id);
    const [assignments, workUnitEmployeeCounts, departmentEmployeeCounts] =
      departmentIds.length
        ? await Promise.all([
          this.departmentPositions
            .find({ departmentId: { $in: departmentIds } })
            .sort({ createdAt: 1 })
            .populate('positionId', 'code name isActive')
            .lean()
            .exec(),
          this.employees
            .aggregate([
              {
                $match: {
                  workUnitId: { $in: departmentIds },
                  isActive: { $ne: false },
                },
              },
              { $group: { _id: '$workUnitId', count: { $sum: 1 } } },
            ])
            .exec(),
          this.employees
            .aggregate([
              {
                $match: {
                  departmentId: { $in: departmentIds },
                  isActive: { $ne: false },
                },
              },
              { $group: { _id: '$departmentId', count: { $sum: 1 } } },
            ])
            .exec(),
          ])
        : [[], [], []];
    const positionsByDepartment = new Map<
      string,
      Array<{ id: string; code: string; name: string; isActive: boolean }>
    >();
    for (const assignment of assignments) {
      const position = assignment.positionId as unknown as {
        _id?: Types.ObjectId;
        id?: string;
        code?: string;
        name?: string;
        isActive?: boolean;
      } | null;
      if (!position || !position.name) continue;
      const departmentId = assignment.departmentId.toString();
      positionsByDepartment.set(departmentId, [
        ...(positionsByDepartment.get(departmentId) ?? []),
        {
          id: position.id ?? position._id?.toString() ?? '',
          code: position.code ?? '',
          name: position.name,
          isActive: position.isActive !== false,
        },
      ]);
    }
    const employeeCountByWorkUnit = new Map(
      workUnitEmployeeCounts.map(
        (item: { _id: Types.ObjectId; count: number }) => [
          item._id.toString(),
          item.count,
        ],
      ),
    );
    const employeeCountByDepartment = new Map(
      departmentEmployeeCounts.map(
        (item: { _id: Types.ObjectId; count: number }) => [
          item._id.toString(),
          item.count,
        ],
      ),
    );
    const functionalUnitTypes = new Set<OrganizationUnitType>([
      OrganizationUnitType.DEPARTMENT,
      OrganizationUnitType.FUNCTIONAL,
      OrganizationUnitType.UNCLASSIFIED,
    ]);
    return items.map((item) => {
      const itemId = item._id.toString();
      const positions = positionsByDepartment.get(itemId) ?? [];
      const unitType = item.unitType ?? OrganizationUnitType.UNCLASSIFIED;
      const employeeCount = functionalUnitTypes.has(unitType)
        ? (employeeCountByDepartment.get(itemId) ?? 0)
        : (employeeCountByWorkUnit.get(itemId) ?? 0);
      return {
        ...this.toOrganizationUnit(item, allowedDepartmentIds),
        positions,
        positionCount: positions.length,
        employeeCount,
      };
    });
  }

  async findOne(actorUserId: string, id: string) {
    const scope = await this.requireDepartmentAccess(actorUserId, id);
    const item = await this.departments
      .findById(id)
      .populate('parentId', 'code name')
      .populate('managerEmployeeId', 'employeeCode fullName')
      .lean()
      .exec();
    if (!item) throw new NotFoundException('Không tìm thấy phòng ban.');
    return this.toOrganizationUnit(
      item,
      scope.fullAccess ? undefined : new Set(scope.departmentIds),
    );
  }

  async findPositions(actorUserId: string, departmentId: string) {
    await this.requireDepartmentAccess(actorUserId, departmentId);
    if (!(await this.departments.exists({ _id: departmentId })))
      throw new NotFoundException('Không tìm thấy phòng ban.');
    const assignments = await this.departmentPositions
      .find({ departmentId })
      .sort({ createdAt: 1 })
      .populate('positionId', 'code name isActive')
      .lean()
      .exec();
    return assignments.map((assignment) => ({
      ...assignment,
      jobTitleId: assignment.positionId,
    }));
  }

  async findManagerOptions() {
    const employees = await this.employees
      .find({ isActive: { $ne: false } })
      .select({ employeeCode: 1, fullName: 1, departmentId: 1, workUnitId: 1 })
      .sort({ fullName: 1 })
      .lean()
      .exec();
    return employees.map((employee) => ({
      id: employee._id.toString(),
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      departmentId: employee.departmentId.toString(),
      ...(employee.workUnitId
        ? { workUnitId: employee.workUnitId.toString() }
        : {}),
    }));
  }

  async applyPositions(
    request: RequestWithContext,
    departmentId: string,
    positionIds: string[],
  ) {
    await this.requireDepartmentAccess(request.user!.id, departmentId);
    const uniqueIds = [...new Set(positionIds)];
    const [department, positions, existingCount] = await Promise.all([
      this.departments.findById(departmentId).exec(),
      this.positions.find({ _id: { $in: uniqueIds }, isActive: true }).exec(),
      this.departmentPositions
        .countDocuments({ departmentId, positionId: { $in: uniqueIds } })
        .exec(),
    ]);
    if (!department) throw new NotFoundException('Không tìm thấy phòng ban.');
    if (positions.length !== uniqueIds.length)
      throw new BadRequestException(
        'Có chức danh không tồn tại hoặc đã ngưng hoạt động.',
      );
    if (existingCount > 0)
      throw new ConflictException({
        message: 'Một hoặc nhiều chức danh đã được gán cho phòng ban.',
        field: 'jobTitleIds',
      });

    try {
      const assignments = await this.departmentPositions.insertMany(
        uniqueIds.map((positionId) => ({
          departmentId: department._id,
          positionId,
          createdBy: request.user?.id,
        })),
      );
      const byId = new Map(
        positions.map((position) => [position._id.toString(), position]),
      );
      await this.audit(
        request,
        'DEPARTMENT.POSITIONS_ADDED',
        department,
        undefined,
        {
          positions: positions.map((position) => ({
            id: position.id,
            name: position.name,
          })),
        },
      );
      return {
        addedCount: assignments.length,
        assignments: assignments.map((assignment) => {
          const position = byId.get(assignment.positionId.toString())!;
          return {
            id: assignment.id,
            departmentId: department.id,
            jobTitle: {
              id: position.id,
              code: position.code,
              name: position.name,
            },
            createdAt: assignment.createdAt,
          };
        }),
      };
    } catch (error) {
      if (isMongoDuplicateKeyError(error))
        throw new ConflictException({
          message: 'Một hoặc nhiều chức danh đã được gán cho phòng ban.',
          field: 'jobTitleIds',
        });
      throw error;
    }
  }

  async removePosition(
    request: RequestWithContext,
    departmentId: string,
    assignmentId: string,
  ) {
    await this.removePositions(request, departmentId, [assignmentId]);
    return { assignmentId, removed: true };
  }

  async removePositions(
    request: RequestWithContext,
    departmentId: string,
    assignmentIds: string[],
  ) {
    await this.requireDepartmentAccess(request.user!.id, departmentId);
    const [department, assignments] = await Promise.all([
      this.departments.findById(departmentId).exec(),
      this.departmentPositions
        .find({ _id: { $in: assignmentIds }, departmentId })
        .lean()
        .exec(),
    ]);
    if (!department) throw new NotFoundException('Không tìm thấy phòng ban.');
    if (assignments.length !== assignmentIds.length)
      throw new NotFoundException('Có vị trí gán không tồn tại.');
    const positionIds = assignments.map((assignment) => assignment.positionId);
    const positions = await this.positions
      .find({ _id: { $in: positionIds } })
      .select({ name: 1 })
      .lean()
      .exec();
    await this.departmentPositions
      .deleteMany({ _id: { $in: assignmentIds }, departmentId })
      .exec();
    await this.audit(
      request,
      'DEPARTMENT.POSITIONS_DELETED',
      department,
      undefined,
      {
        positions: positions.map((position) => ({
          id: position._id.toString(),
          name: position.name,
        })),
      },
    );
    return { removedCount: assignmentIds.length };
  }

  async create(request: RequestWithContext, input: CreateDepartmentDto) {
    if (input.parentId) {
      await this.requireDepartmentAccess(request.user!.id, input.parentId);
    }
    const code = input.code.toUpperCase();
    const name = input.name.trim();
    const nameNormalized = normalizeSearchText(name);
    const existing = await this.departments
      .findOne({ $or: [{ code }, { nameNormalized }] })
      .select({ code: 1 })
      .lean()
      .exec();
    if (existing)
      throw this.duplicateField(existing.code === code ? 'code' : 'name');
    const positionIds = [...new Set(input.positionIds ?? [])];
    const activePositions = positionIds.length
      ? await this.positions
          .find({ _id: { $in: positionIds }, isActive: true })
          .select({ name: 1 })
          .lean()
          .exec()
      : [];
    if (activePositions.length !== positionIds.length)
      throw new BadRequestException(
        'Có chức danh không khả dụng hoặc đã ngưng hoạt động.',
      );
    const unitType = input.unitType ?? OrganizationUnitType.UNCLASSIFIED;
    const parentId = input.parentId ?? undefined;
    const managerEmployeeId = input.managerEmployeeId ?? undefined;
    await this.ensureRelations(
      undefined,
      unitType,
      parentId,
      managerEmployeeId,
    );
    const last = await this.departments
      .findOne()
      .sort({ sortOrder: -1 })
      .select({ sortOrder: 1 })
      .lean()
      .exec();
    try {
      const item = await this.departments.create({
        code,
        name,
        nameNormalized,
        unitType,
        ...(parentId ? { parentId: new Types.ObjectId(parentId) } : {}),
        ...(managerEmployeeId
          ? { managerEmployeeId: new Types.ObjectId(managerEmployeeId) }
          : {}),
        isActive: input.isActive ?? true,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        createdBy: request.user?.id,
        updatedBy: request.user?.id,
      });
      if (positionIds.length) {
        await this.departmentPositions.insertMany(
          positionIds.map((positionId) => ({
            departmentId: item._id,
            positionId,
            createdBy: request.user?.id,
          })),
        );
      }
      await this.audit(request, 'DEPARTMENT.CREATED', item, undefined, {
        ...this.snapshot(item),
        positions: activePositions.map((position) => ({
          id: position._id.toString(),
          name: position.name,
        })),
      });
      return this.toOrganizationUnit(item.toObject());
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        const field =
          error.keyPattern?.nameNormalized || error.keyValue?.nameNormalized
            ? 'name'
            : 'code';
        throw this.duplicateField(field);
      }
      throw error;
    }
  }

  async update(
    request: RequestWithContext,
    id: string,
    input: UpdateDepartmentDto,
  ) {
    await this.requireDepartmentAccess(request.user!.id, id);
    if (input.parentId) {
      await this.requireDepartmentAccess(request.user!.id, input.parentId);
    }
    const current = await this.departments.findById(id).exec();
    if (!current) throw new NotFoundException('Không tìm thấy phòng ban.');
    if (input.isActive === false && current.isActive) {
      const [activeChildren, activeEmployees] = await Promise.all([
        this.departments
          .countDocuments({ parentId: current._id, isActive: true })
          .exec(),
        this.employees
          .countDocuments({
            $or: [{ departmentId: current._id }, { workUnitId: current._id }],
            isActive: true,
          })
          .exec(),
      ]);
      if (activeChildren || activeEmployees) {
        throw new ConflictException(
          'Không thể ngưng hoạt động đơn vị còn đơn vị con hoặc nhân viên đang hoạt động.',
        );
      }
    }
    const unitType =
      input.unitType ?? current.unitType ?? OrganizationUnitType.UNCLASSIFIED;
    const parentId =
      input.parentId === null
        ? undefined
        : (input.parentId ?? current.parentId?.toString());
    if (parentId === id)
      throw new BadRequestException(
        'Phòng ban không thể là cấp cha của chính nó.',
      );
    const managerId =
      input.managerEmployeeId === null
        ? undefined
        : (input.managerEmployeeId ?? current.managerEmployeeId?.toString());
    await this.ensureRelations(id, unitType, parentId, managerId);
    if (unitType !== (current.unitType ?? OrganizationUnitType.UNCLASSIFIED)) {
      const children = await this.departments
        .find({ parentId: current._id })
        .select({ unitType: 1 })
        .lean()
        .exec();
      const invalidChild = children.find(
        (child) => !this.isValidParentType(child.unitType, unitType),
      );
      if (invalidChild) {
        throw new BadRequestException(
          'Không thể đổi loại đơn vị vì loại đơn vị con hiện tại không còn phù hợp.',
        );
      }
    }

    const { positionIds, ...departmentFields } = input;
    let addedPositionIds: string[] = [];
    let addedPositions: Array<{ id: string; _id: Types.ObjectId; name: string }> = [];
    let removedAssignmentIds: Types.ObjectId[] = [];
    let removedPositionIds: Types.ObjectId[] = [];
    if (positionIds !== undefined) {
      const requestedPositionIds = [...new Set(positionIds)];
      const existingAssignments = await this.departmentPositions
        .find({ departmentId: current._id })
        .select({ _id: 1, positionId: 1 })
        .lean()
        .exec();
      const existingPositionIdSet = new Set(
        existingAssignments.map((assignment) => assignment.positionId.toString()),
      );
      const requestedPositionIdSet = new Set(requestedPositionIds);
      addedPositionIds = requestedPositionIds.filter(
        (positionId) => !existingPositionIdSet.has(positionId),
      );
      const removedAssignments = existingAssignments.filter(
        (assignment) =>
          !requestedPositionIdSet.has(assignment.positionId.toString()),
      );
      removedAssignmentIds = removedAssignments.map((assignment) => assignment._id);
      removedPositionIds = removedAssignments.map(
        (assignment) => assignment.positionId,
      );
      if (addedPositionIds.length) {
        addedPositions = await this.positions
          .find({ _id: { $in: addedPositionIds }, isActive: true })
          .select({ name: 1 })
          .exec();
        if (addedPositions.length !== addedPositionIds.length) {
          throw new BadRequestException(
            'Có chức danh không tồn tại hoặc đã ngưng hoạt động.',
          );
        }
      }
    }

    const update: Record<string, unknown> = {
      ...departmentFields,
      ...(input.code ? { code: input.code.toUpperCase() } : {}),
      ...(input.name
        ? {
            name: input.name.trim(),
            nameNormalized: normalizeSearchText(input.name),
          }
        : {}),
      updatedBy: request.user?.id,
    };
    const unset: Record<string, 1> = {};
    if (input.parentId === null) {
      delete update.parentId;
      unset.parentId = 1;
    }
    if (input.managerEmployeeId === null) {
      delete update.managerEmployeeId;
      unset.managerEmployeeId = 1;
    }
    try {
      const item = await this.departments
        .findByIdAndUpdate(
          id,
          {
            $set: update,
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
          },
          { returnDocument: 'after', runValidators: true },
        )
        .exec();
      if (!item) throw new NotFoundException('Không tìm thấy phòng ban.');
      if (removedAssignmentIds.length) {
        const removedPositions = await this.positions
          .find({ _id: { $in: removedPositionIds } })
          .select({ name: 1 })
          .lean()
          .exec();
        await this.departmentPositions
          .deleteMany({ _id: { $in: removedAssignmentIds }, departmentId: current._id })
          .exec();
        await this.audit(
          request,
          'DEPARTMENT.POSITIONS_DELETED',
          item,
          undefined,
          {
            positions: removedPositions.map((position) => ({
              id: position._id.toString(),
              name: position.name,
            })),
          },
        );
      }
      if (addedPositionIds.length) {
        await this.departmentPositions.insertMany(
          addedPositionIds.map((positionId) => ({
            departmentId: current._id,
            positionId,
            createdBy: request.user?.id,
          })),
        );
        await this.audit(
          request,
          'DEPARTMENT.POSITIONS_ADDED',
          item,
          undefined,
          {
            positions: addedPositions.map((position) => ({
              id: position._id.toString(),
              name: position.name,
            })),
          },
        );
      }
      await this.audit(
        request,
        current.isActive && !item.isActive
          ? 'DEPARTMENT.DEACTIVATED'
          : 'DEPARTMENT.UPDATED',
        item,
        this.snapshot(current),
        this.snapshot(item),
      );
      return this.toOrganizationUnit(item.toObject());
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        const field =
          error.keyPattern?.nameNormalized || error.keyValue?.nameNormalized
            ? 'name'
            : 'code';
        throw this.duplicateField(field);
      }
      throw error;
    }
  }

  async remove(request: RequestWithContext, id: string) {
    await this.requireDepartmentAccess(request.user!.id, id);
    const department = await this.departments.findById(id).exec();
    if (!department) throw new NotFoundException('Không tìm thấy phòng ban.');
    const [employeeCount, childCount, assignmentCount] = await Promise.all([
      this.employees
        .countDocuments({
          $or: [
            { departmentId: department._id },
            { workUnitId: department._id },
          ],
        })
        .exec(),
      this.departments.countDocuments({ parentId: department._id }).exec(),
      this.departmentPositions
        .countDocuments({ departmentId: department._id })
        .exec(),
    ]);
    if (employeeCount || childCount || assignmentCount) {
      throw new ConflictException('Không thể xóa phòng ban đang được sử dụng.');
    }
    await this.departments.deleteOne({ _id: department._id }).exec();
    await this.audit(
      request,
      'DEPARTMENT.DELETED',
      department,
      this.snapshot(department),
    );
    return { id: department.id, deleted: true };
  }

  private async ensureRelations(
    currentId: string | undefined,
    unitType: OrganizationUnitType,
    parentId?: string,
    managerId?: string,
  ) {
    if (unitType === OrganizationUnitType.COMPANY && parentId) {
      throw new BadRequestException(
        'Đơn vị cấp công ty không được có đơn vị cấp trên.',
      );
    }
    if (
      (unitType === OrganizationUnitType.HEADQUARTERS ||
        unitType === OrganizationUnitType.REGION) &&
      !parentId
    ) {
      throw new BadRequestException(
        unitType === OrganizationUnitType.HEADQUARTERS
          ? 'Trụ sở chính phải thuộc một đơn vị cấp công ty.'
          : 'Khu vực phải thuộc một đơn vị cấp công ty.',
      );
    }
    if (unitType === OrganizationUnitType.DEPARTMENT && !parentId) {
      throw new BadRequestException(
        'Phòng ban phải thuộc công ty, trụ sở chính hoặc một phòng ban cấp trên.',
      );
    }
    if (unitType === OrganizationUnitType.STORE && !parentId) {
      throw new BadRequestException('Cửa hàng phải thuộc một khu vực.');
    }
    if (parentId) {
      const selectedParent = await this.departments
        .findById(parentId)
        .select({ parentId: 1, unitType: 1 })
        .lean()
        .exec();
      if (!selectedParent)
        throw new BadRequestException('Phòng ban cấp cha không tồn tại.');
      const parentType =
        selectedParent.unitType ?? OrganizationUnitType.UNCLASSIFIED;
      if (
        unitType === OrganizationUnitType.REGION &&
        parentType !== OrganizationUnitType.COMPANY
      ) {
        throw new BadRequestException(
          'Đơn vị cấp trên của khu vực phải là công ty.',
        );
      }
      if (
        unitType === OrganizationUnitType.HEADQUARTERS &&
        parentType !== OrganizationUnitType.COMPANY
      ) {
        throw new BadRequestException(
          'Trụ sở chính phải thuộc một đơn vị cấp công ty.',
        );
      }
      if (
        unitType === OrganizationUnitType.DEPARTMENT &&
        parentType !== OrganizationUnitType.COMPANY &&
        parentType !== OrganizationUnitType.HEADQUARTERS &&
        parentType !== OrganizationUnitType.DEPARTMENT
      ) {
        throw new BadRequestException(
          'Phòng ban chỉ được thuộc công ty, trụ sở chính hoặc một phòng ban cấp trên.',
        );
      }
      if (
        unitType === OrganizationUnitType.STORE &&
        parentType !== OrganizationUnitType.REGION
      ) {
        throw new BadRequestException(
          'Đơn vị cấp trên của cửa hàng phải là khu vực.',
        );
      }
      let cursor: string | undefined = parentId;
      const visited = new Set<string>();
      if (currentId) visited.add(currentId);
      while (cursor) {
        if (visited.has(cursor))
          throw new BadRequestException(
            'Cấu trúc phòng ban tạo thành vòng lặp.',
          );
        visited.add(cursor);
        const parent = await this.departments
          .findById(cursor)
          .select({ parentId: 1 })
          .lean()
          .exec();
        cursor = parent?.parentId?.toString();
      }
    }
    if (managerId) {
      const manager = await this.employees
        .findOne({ _id: managerId, isActive: true })
        .select({ _id: 1 })
        .lean()
        .exec();
      if (!manager)
        throw new BadRequestException(
          'Người quản lý phải là nhân viên đang hoạt động.',
        );
    }
  }

  private isValidParentType(
    childType: OrganizationUnitType | undefined,
    parentType: OrganizationUnitType,
  ) {
    switch (childType ?? OrganizationUnitType.UNCLASSIFIED) {
      case OrganizationUnitType.COMPANY:
        return false;
      case OrganizationUnitType.HEADQUARTERS:
      case OrganizationUnitType.REGION:
        return parentType === OrganizationUnitType.COMPANY;
      case OrganizationUnitType.STORE:
        return parentType === OrganizationUnitType.REGION;
      case OrganizationUnitType.DEPARTMENT:
        return (
          parentType === OrganizationUnitType.COMPANY ||
          parentType === OrganizationUnitType.HEADQUARTERS ||
          parentType === OrganizationUnitType.DEPARTMENT
        );
      case OrganizationUnitType.FUNCTIONAL:
      case OrganizationUnitType.UNCLASSIFIED:
        return true;
    }
  }

  private snapshot(item: DepartmentDocument) {
    return {
      code: item.code,
      name: item.name,
      unitType: item.unitType ?? OrganizationUnitType.UNCLASSIFIED,
      parentId: item.parentId?.toString(),
      managerEmployeeId: item.managerEmployeeId?.toString(),
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    };
  }

  private toOrganizationUnit(
    item: Department & { _id?: Types.ObjectId; id?: string },
    allowedDepartmentIds?: ReadonlySet<string>,
  ) {
    const parent = item.parentId as unknown as
      | { _id?: Types.ObjectId; name?: string; code?: string }
      | Types.ObjectId
      | undefined;
    const manager = item.managerEmployeeId as unknown as
      | { _id?: Types.ObjectId; fullName?: string; employeeCode?: string }
      | Types.ObjectId
      | undefined;
    const parentId =
      parent && typeof parent === 'object' && '_id' in parent
        ? parent._id?.toString()
        : parent?.toString();
    const managerEmployeeId =
      manager && typeof manager === 'object' && '_id' in manager
        ? manager._id?.toString()
        : manager?.toString();
    const canExposeParent =
      !parentId ||
      !allowedDepartmentIds ||
      allowedDepartmentIds.has(parentId);
    return {
      ...item,
      unitType: item.unitType ?? OrganizationUnitType.UNCLASSIFIED,
      parentId: canExposeParent ? parentId : undefined,
      parentName:
        canExposeParent &&
        parent &&
        typeof parent === 'object' &&
        'name' in parent
          ? parent.name
          : undefined,
      managerEmployeeId,
      managerName:
        manager && typeof manager === 'object' && 'fullName' in manager
          ? manager.fullName
          : undefined,
      managerEmployeeCode:
        manager && typeof manager === 'object' && 'employeeCode' in manager
          ? manager.employeeCode
          : undefined,
    };
  }

  private async requireDepartmentAccess(userId: string, departmentId: string) {
    const scope = await this.organizationScope.resolve(userId);
    if (!scope.fullAccess && !scope.departmentIds.includes(departmentId)) {
      throw new NotFoundException('Không tìm thấy phòng ban.');
    }
    return scope;
  }

  private async audit(
    request: RequestWithContext,
    action: string,
    item: DepartmentDocument,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ) {
    await this.auditLogs.record(request, {
      action,
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'DEPARTMENT', id: item.id, code: item.code },
      changes: { ...(before ? { before } : {}), ...(after ? { after } : {}) },
    });
  }

  private duplicateField(field: 'code' | 'name') {
    return new ConflictException({
      message:
        field === 'code'
          ? 'Mã phòng ban đã tồn tại.'
          : 'Tên phòng ban đã tồn tại.',
      field,
    });
  }
}
