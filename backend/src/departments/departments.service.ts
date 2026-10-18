import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { normalizeSearchText } from '../common/text/normalize-search-text.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { CreateDepartmentDto, ListDepartmentsDto, UpdateDepartmentDto } from './dto/department.dto.js';
import { Department, DepartmentDocument } from './schemas/department.schema.js';
import { DepartmentPosition } from './schemas/department-position.schema.js';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name) private readonly departments: Model<Department>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
    @InjectModel(DepartmentPosition.name) private readonly departmentPositions: Model<DepartmentPosition>,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll(query: ListDepartmentsDto) {
    const filter: Record<string, unknown> = query.active === undefined ? {} : { isActive: query.active };
    if (query.search?.trim()) {
      const raw = query.search.trim();
      filter.$or = [
        { code: new RegExp(this.escapeRegExp(raw), 'i') },
        { nameNormalized: new RegExp(this.escapeRegExp(normalizeSearchText(raw)), 'i') },
      ];
    }
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.departments.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(query.limit).lean().exec(),
      this.departments.countDocuments(filter).exec(),
    ]);
    return { data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async findCatalog(query: Pick<ListDepartmentsDto, 'active'>) {
    return this.departments.find(query.active === undefined ? {} : { isActive: query.active }).sort({ sortOrder: 1, name: 1 }).lean().exec();
  }

  async findOne(id: string) {
    const item = await this.departments.findById(id).lean().exec();
    if (!item) throw new NotFoundException('Không tìm thấy phòng ban.');
    return item;
  }

  async findPositions(departmentId: string) {
    if (!await this.departments.exists({ _id: departmentId })) throw new NotFoundException('Không tìm thấy phòng ban.');
    const assignments = await this.departmentPositions.find({ departmentId })
      .sort({ createdAt: 1 })
      .populate('positionId', 'code name isActive')
      .lean().exec();
    return assignments.map((assignment) => ({ ...assignment, jobTitleId: assignment.positionId }));
  }

  async applyPositions(request: RequestWithContext, departmentId: string, positionIds: string[]) {
    const uniqueIds = [...new Set(positionIds)];
    const [department, positions, existingCount] = await Promise.all([
      this.departments.findById(departmentId).exec(),
      this.positions.find({ _id: { $in: uniqueIds }, isActive: true }).exec(),
      this.departmentPositions.countDocuments({ departmentId, positionId: { $in: uniqueIds } }).exec(),
    ]);
    if (!department) throw new NotFoundException('Không tìm thấy phòng ban.');
    if (positions.length !== uniqueIds.length) throw new BadRequestException('Có chức danh không tồn tại hoặc đã ngưng hoạt động.');
    if (existingCount > 0) throw new ConflictException({ message: 'Một hoặc nhiều chức danh đã được gán cho phòng ban.', field: 'jobTitleIds' });

    try {
      const assignments = await this.departmentPositions.insertMany(uniqueIds.map((positionId) => ({
        departmentId: department._id,
        positionId,
        createdBy: request.user?.id,
      })));
      const byId = new Map(positions.map((position) => [position._id.toString(), position]));
      await this.audit(request, 'DEPARTMENT.POSITIONS_ADDED', department, undefined, {
        positions: positions.map((position) => ({ id: position.id, name: position.name })),
      });
      return {
        addedCount: assignments.length,
        assignments: assignments.map((assignment) => {
          const position = byId.get(assignment.positionId.toString())!;
          return {
            id: assignment.id,
            departmentId: department.id,
            jobTitle: { id: position.id, code: position.code, name: position.name },
            createdAt: assignment.createdAt,
          };
        }),
      };
    } catch (error) {
      if (this.isDuplicate(error)) throw new ConflictException({ message: 'Một hoặc nhiều chức danh đã được gán cho phòng ban.', field: 'jobTitleIds' });
      throw error;
    }
  }

  async removePosition(request: RequestWithContext, departmentId: string, assignmentId: string) {
    await this.removePositions(request, departmentId, [assignmentId]);
    return { assignmentId, removed: true };
  }

  async removePositions(request: RequestWithContext, departmentId: string, assignmentIds: string[]) {
    const [department, assignments] = await Promise.all([
      this.departments.findById(departmentId).exec(),
      this.departmentPositions.find({ _id: { $in: assignmentIds }, departmentId }).lean().exec(),
    ]);
    if (!department) throw new NotFoundException('Không tìm thấy phòng ban.');
    if (assignments.length !== assignmentIds.length) throw new NotFoundException('Có vị trí gán không tồn tại.');
    const positionIds = assignments.map((assignment) => assignment.positionId);
    const positions = await this.positions.find({ _id: { $in: positionIds } }).select({ name: 1 }).lean().exec();
    await this.departmentPositions.deleteMany({ _id: { $in: assignmentIds }, departmentId }).exec();
    await this.audit(request, 'DEPARTMENT.POSITIONS_DELETED', department, undefined, {
      positions: positions.map((position) => ({ id: position._id.toString(), name: position.name })),
    });
    return { removedCount: assignmentIds.length };
  }

  async create(request: RequestWithContext, input: CreateDepartmentDto) {
    const code = input.code.toUpperCase();
    const name = input.name.trim();
    const nameNormalized = normalizeSearchText(name);
    const existing = await this.departments.findOne({ $or: [{ code }, { nameNormalized }] }).select({ code: 1 }).lean().exec();
    if (existing) throw this.duplicateField(existing.code === code ? 'code' : 'name');
    const positionIds = [...new Set(input.positionIds ?? [])];
    const activePositions = positionIds.length
      ? await this.positions.find({ _id: { $in: positionIds }, isActive: true }).select({ name: 1 }).lean().exec()
      : [];
    if (activePositions.length !== positionIds.length) throw new BadRequestException('Có chức danh không khả dụng hoặc đã ngưng hoạt động.');
    const last = await this.departments.findOne().sort({ sortOrder: -1 }).select({ sortOrder: 1 }).lean().exec();
    try {
      const item = await this.departments.create({
        code,
        name,
        nameNormalized,
        isActive: input.isActive ?? true,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        createdBy: request.user?.id,
        updatedBy: request.user?.id,
      });
      if (positionIds.length) {
        await this.departmentPositions.insertMany(positionIds.map((positionId) => ({ departmentId: item._id, positionId, createdBy: request.user?.id })));
      }
      await this.audit(request, 'DEPARTMENT.CREATED', item, undefined, {
        ...this.snapshot(item),
        positions: activePositions.map((position) => ({ id: position._id.toString(), name: position.name })),
      });
      return { id: item.id, name: item.name, code: item.code, isActive: item.isActive, createdAt: item.createdAt, updatedAt: item.updatedAt };
    } catch (error) {
      if (this.isDuplicate(error)) throw this.duplicateField('code');
      throw error;
    }
  }

  async update(request: RequestWithContext, id: string, input: UpdateDepartmentDto) {
    const current = await this.departments.findById(id).exec();
    if (!current) throw new NotFoundException('Không tìm thấy phòng ban.');
    const parentId = input.parentId === null ? undefined : input.parentId ?? current.parentId?.toString();
    if (parentId === id) throw new BadRequestException('Phòng ban không thể là cấp cha của chính nó.');
    const managerId = input.managerEmployeeId === null ? undefined : input.managerEmployeeId ?? current.managerEmployeeId?.toString();
    await this.ensureRelations(id, parentId, managerId);

    const update: Record<string, unknown> = {
      ...input,
      ...(input.code ? { code: input.code.toUpperCase() } : {}),
      ...(input.name ? { name: input.name.trim(), nameNormalized: normalizeSearchText(input.name) } : {}),
      updatedBy: request.user?.id,
    };
    const unset: Record<string, 1> = {};
    if (input.parentId === null) { delete update.parentId; unset.parentId = 1; }
    if (input.managerEmployeeId === null) { delete update.managerEmployeeId; unset.managerEmployeeId = 1; }
    try {
      const item = await this.departments.findByIdAndUpdate(id, { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { returnDocument: 'after', runValidators: true }).exec();
      if (!item) throw new NotFoundException('Không tìm thấy phòng ban.');
      await this.audit(request, current.isActive && !item.isActive ? 'DEPARTMENT.DEACTIVATED' : 'DEPARTMENT.UPDATED', item, this.snapshot(current), this.snapshot(item));
      return item.toObject();
    } catch (error) {
      if (this.isDuplicate(error)) throw new ConflictException('Mã hoặc tên phòng ban đã tồn tại.');
      throw error;
    }
  }

  async remove(request: RequestWithContext, id: string) {
    const department = await this.departments.findById(id).exec();
    if (!department) throw new NotFoundException('Không tìm thấy phòng ban.');
    const [employeeCount, childCount, assignmentCount] = await Promise.all([
      this.employees.countDocuments({ departmentId: department._id }).exec(),
      this.departments.countDocuments({ parentId: department._id }).exec(),
      this.departmentPositions.countDocuments({ departmentId: department._id }).exec(),
    ]);
    if (employeeCount || childCount || assignmentCount) {
      throw new ConflictException('Không thể xóa phòng ban đang được sử dụng.');
    }
    await this.departments.deleteOne({ _id: department._id }).exec();
    await this.audit(request, 'DEPARTMENT.DELETED', department, this.snapshot(department));
    return { id: department.id, deleted: true };
  }

  private async ensureRelations(currentId: string, parentId?: string, managerId?: string) {
    if (parentId) {
      if (!await this.departments.exists({ _id: parentId })) throw new BadRequestException('Phòng ban cấp cha không tồn tại.');
      let cursor: string | undefined = parentId;
      while (cursor) {
        if (cursor === currentId) throw new BadRequestException('Cấu trúc phòng ban tạo thành vòng lặp.');
        const parent = await this.departments.findById(cursor).select({ parentId: 1 }).lean().exec();
        cursor = parent?.parentId?.toString();
      }
    }
    if (managerId && !await this.employees.exists({ _id: managerId, departmentId: new Types.ObjectId(currentId), isActive: true })) {
      throw new BadRequestException('Trưởng phòng phải là nhân viên đang hoạt động thuộc phòng ban này.');
    }
  }

  private snapshot(item: DepartmentDocument) {
    return { code: item.code, name: item.name, parentId: item.parentId?.toString(), managerEmployeeId: item.managerEmployeeId?.toString(), isActive: item.isActive, sortOrder: item.sortOrder };
  }

  private async audit(request: RequestWithContext, action: string, item: DepartmentDocument, before?: Record<string, unknown>, after?: Record<string, unknown>) {
    await this.auditLogs.record(request, { action, outcome: AuditOutcome.SUCCESS, resource: { type: 'DEPARTMENT', id: item.id, code: item.code }, changes: { ...(before ? { before } : {}), ...(after ? { after } : {}) } });
  }

  private duplicateField(field: 'code' | 'name') {
    return new ConflictException({ message: field === 'code' ? 'Mã phòng ban đã tồn tại.' : 'Tên phòng ban đã tồn tại.', field });
  }

  private escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  private isDuplicate(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }
}
