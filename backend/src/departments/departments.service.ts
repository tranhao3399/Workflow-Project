import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { User } from '../users/schemas/user.schema.js';
import { CreateDepartmentDto, ListDepartmentsDto, UpdateDepartmentDto } from './dto/department.dto.js';
import { Department, DepartmentDocument } from './schemas/department.schema.js';
import { DepartmentPosition, DepartmentPositionDocument } from './schemas/department-position.schema.js';

function normalizeName(value: string): string { return value.trim().toLocaleLowerCase('vi-VN'); }

@Injectable()
export class DepartmentsService implements OnModuleInit {
  constructor(
    @InjectModel(Department.name) private readonly departmentModel: Model<Department>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<Employee>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(DepartmentPosition.name) private readonly departmentPositionModel: Model<DepartmentPosition>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    const legacyDepartments = await this.departmentModel.find({ nameNormalized: { $exists: false } }).select({ _id: 1, name: 1 }).lean().exec();
    await Promise.all(legacyDepartments.map((item) => this.departmentModel.updateOne({ _id: item._id }, { $set: { nameNormalized: normalizeName(item.name) } }).exec()));
    await this.removeLegacyDepartmentPositionIndexes();
  }

  async findAll(query: ListDepartmentsDto) {
    const filter: Record<string, unknown> = query.active === undefined ? {} : { isActive: query.active };
    if (query.search?.trim()) {
      const expression = new RegExp(this.escapeRegExp(query.search.trim()), 'i');
      filter.$or = [{ code: expression }, { name: expression }];
    }
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.departmentModel.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(query.limit).lean().exec(),
      this.departmentModel.countDocuments(filter).exec(),
    ]);
    return { data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }
  async findCatalog(query: Pick<ListDepartmentsDto, 'active'>) {
    return this.departmentModel.find(query.active === undefined ? {} : { isActive: query.active }).sort({ sortOrder: 1, name: 1 }).lean().exec();
  }
  async findOne(id: string) { const item = await this.departmentModel.findById(id).lean().exec(); if (!item) throw new NotFoundException('Department not found'); return item; }
  async findPositions(departmentId: string) {
    if (!await this.departmentModel.exists({ _id: departmentId })) throw new NotFoundException('Department not found');
    return this.departmentPositionModel.find({ departmentId })
      .sort({ createdAt: 1 })
      .populate('jobTitleId', 'code name')
      .lean()
      .exec();
  }
  async applyPositions(request: RequestWithContext, departmentId: string, jobTitleIds: string[]) {
    const [department, jobTitles, existingAssignments] = await Promise.all([
      this.departmentModel.findById(departmentId).exec(),
      this.positionModel.find({ _id: { $in: jobTitleIds }, isActive: true }).exec(),
      this.departmentPositionModel.find({ departmentId, jobTitleId: { $in: jobTitleIds } }).select({ jobTitleId: 1 }).lean().exec(),
    ]);
    if (!department) throw new NotFoundException('Department not found');
    if (jobTitles.length !== jobTitleIds.length) throw new BadRequestException('One or more job titles do not exist or are inactive');
    if (existingAssignments.length > 0) throw new ConflictException({ message: 'Một hoặc nhiều chức danh đã được áp dụng cho phòng ban.', field: 'jobTitleIds' });

    try {
      const assignments = await this.departmentPositionModel.insertMany(jobTitleIds.map((jobTitleId) => ({ departmentId: department._id, jobTitleId })));
      const jobTitlesById = new Map(jobTitles.map((jobTitle) => [jobTitle._id.toString(), jobTitle]));
      await this.audit(request, 'DEPARTMENT.POSITIONS_ADDED', department, undefined, {
        positions: jobTitles.map((jobTitle) => ({ id: jobTitle._id.toString(), name: jobTitle.name })),
      });
      return {
        addedCount: assignments.length,
        assignments: assignments.map((assignment) => {
          const jobTitle = jobTitlesById.get(assignment.jobTitleId.toString())!;
          return {
            id: assignment._id.toString(),
            departmentId: department._id.toString(),
            jobTitle: {
              id: jobTitle._id.toString(),
              code: jobTitle.code,
              name: jobTitle.name,
            },
            createdAt: assignment.createdAt,
            updatedAt: assignment.updatedAt,
          };
        }),
      };
    } catch (error) {
      if (this.isDuplicate(error)) throw new ConflictException({ message: 'Một hoặc nhiều chức danh đã được áp dụng cho phòng ban.', field: 'jobTitleIds' });
      throw error;
    }
  }
  async removePosition(request: RequestWithContext, departmentId: string, assignmentId: string) {
    await this.removePositions(request, departmentId, [assignmentId]);
    return { assignmentId, removed: true };
  }
  async removePositions(request: RequestWithContext, departmentId: string, assignmentIds: string[]) {
    const [department, assignments] = await Promise.all([
      this.departmentModel.findById(departmentId).exec(),
      this.departmentPositionModel.find({ _id: { $in: assignmentIds }, departmentId }).select({ jobTitleId: 1 }).lean().exec(),
    ]);
    if (!department) throw new NotFoundException('Department not found');
    if (assignments.length !== assignmentIds.length) throw new NotFoundException('One or more department positions were not found');
    const jobTitleIds = assignments.map((assignment) => assignment.jobTitleId);
    const jobTitles = await this.positionModel.find({ _id: { $in: jobTitleIds } }).select({ _id: 1, name: 1 }).lean().exec();
    const jobTitlesById = new Map(jobTitles.map((jobTitle) => [jobTitle._id.toString(), jobTitle]));
    const positions = jobTitleIds.flatMap((jobTitleId) => {
      const jobTitle = jobTitlesById.get(jobTitleId.toString());
      return jobTitle ? [{ id: jobTitle._id.toString(), name: jobTitle.name }] : [];
    });
    await this.departmentPositionModel.deleteMany({ _id: { $in: assignmentIds }, departmentId }).exec();
    await this.audit(request, 'DEPARTMENT.POSITIONS_DELETED', department, undefined, { positions });
    return { removedCount: assignmentIds.length };
  }
  async create(request: RequestWithContext, input: CreateDepartmentDto) {
    const code = input.code.toUpperCase();
    const name = input.name.trim();
    const nameNormalized = normalizeName(name);
    const existing = await this.departmentModel.findOne({ $or: [{ code }, { nameNormalized }] }).select({ code: 1, nameNormalized: 1 }).lean().exec();
    if (existing) throw this.duplicateField(existing.code === code ? 'code' : 'name');
    const positionIds = input.positionIds ?? [];
    const activePositions = positionIds.length > 0
      ? await this.positionModel.find({ _id: { $in: positionIds }, isActive: true }).select({ _id: 1, name: 1 }).lean().exec()
      : [];
    if (activePositions.length !== positionIds.length) throw new BadRequestException('One or more job titles are unavailable or inactive');
    const last = await this.departmentModel.findOne().sort({ sortOrder: -1 }).select({ sortOrder: 1 }).lean().exec();
    try {
      const item = await this.departmentModel.create({ code, name, nameNormalized, isActive: input.isActive ?? true, sortOrder: (last?.sortOrder ?? 0) + 10 });
      if (positionIds.length > 0) {
        await this.departmentPositionModel.insertMany(positionIds.map((jobTitleId) => ({ departmentId: item._id, jobTitleId })));
      }
      await this.audit(request, 'DEPARTMENT.CREATED', item, undefined, this.snapshot(item));
      if (positionIds.length > 0) await this.audit(request, 'DEPARTMENT.POSITIONS_ADDED', item, undefined, {
        positions: activePositions.map((position) => ({ id: position._id.toString(), name: position.name })),
      });
      return { id: item._id.toString(), name: item.name, code: item.code, isActive: item.isActive, createdAt: item.createdAt, updatedAt: item.updatedAt };
    } catch (error) {
      if (this.isDuplicate(error)) throw this.duplicateField('code');
      throw error;
    }
  }
  async update(request: RequestWithContext, id: string, input: UpdateDepartmentDto) {
    const current = await this.departmentModel.findById(id).exec(); if (!current) throw new NotFoundException('Department not found');
    const parentId = input.parentId === null ? undefined : input.parentId ?? current.parentId?.toString();
    if (parentId === id) throw new BadRequestException('A department cannot be its own parent');
    await this.ensureRelations(parentId, input.managerEmployeeId === null ? undefined : input.managerEmployeeId ?? current.managerEmployeeId?.toString());
    const update: Record<string, unknown> = { ...input, ...(input.code ? { code: input.code.toUpperCase() } : {}), ...(input.name ? { name: input.name.trim(), nameNormalized: normalizeName(input.name) } : {}) }; const unset: Record<string, 1> = {};
    if (input.parentId === null) { delete update.parentId; unset.parentId = 1; } if (input.managerEmployeeId === null) { delete update.managerEmployeeId; unset.managerEmployeeId = 1; }
    try { const item = await this.departmentModel.findByIdAndUpdate(id, { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { returnDocument: 'after', runValidators: true }).exec(); if (!item) throw new NotFoundException('Department not found'); await this.audit(request, current.isActive && !item.isActive ? 'DEPARTMENT.DEACTIVATED' : 'DEPARTMENT.UPDATED', item, this.snapshot(current), this.snapshot(item)); return item.toObject(); } catch (error) { if (this.isDuplicate(error)) throw new ConflictException('Department code or name already exists'); throw error; }
  }
  async remove(request: RequestWithContext, id: string) {
    const department = await this.departmentModel.findById(id).exec();
    if (!department) throw new NotFoundException('Department not found');

    const legacyEmployeeFilter = { $or: [{ departmentId: department._id }, { department: department.name, departmentId: null }] };
    const legacyPositionFilter = { $or: [{ departmentId: department._id }, { department: department.name, departmentId: null }] };
    const [employeeCount, userCount, childDepartmentCount, positionCount, assignmentCount] = await Promise.all([
      this.employeeModel.countDocuments(legacyEmployeeFilter).exec(),
      this.userModel.countDocuments({ department: department.name }).exec(),
      this.departmentModel.countDocuments({ parentId: department._id }).exec(),
      this.positionModel.countDocuments(legacyPositionFilter).exec(),
      this.departmentPositionModel.countDocuments({ departmentId: department._id }).exec(),
    ]);

    const dependencies = [
      employeeCount > 0 ? 'nhân viên' : '',
      userCount > 0 ? 'tài khoản người dùng' : '',
      childDepartmentCount > 0 ? 'phòng ban con' : '',
      positionCount > 0 ? 'vị trí' : '',
      assignmentCount > 0 ? 'vị trí áp dụng' : '',
    ].filter(Boolean);
    if (dependencies.length > 0) {
      throw new ConflictException(`Không thể xóa phòng ban vì đang được sử dụng bởi ${dependencies.join(', ')}.`);
    }

    await this.departmentModel.deleteOne({ _id: department._id }).exec();
    await this.audit(request, 'DEPARTMENT.DELETED', department, this.snapshot(department));
    return { id: department._id.toString(), deleted: true };
  }
  private async ensureRelations(parentId?: string, managerId?: string) { if (parentId && !await this.departmentModel.exists({ _id: parentId })) throw new BadRequestException('Parent department does not exist'); if (managerId && !await this.employeeModel.exists({ _id: managerId })) throw new BadRequestException('Department manager does not exist'); }
  private async removeLegacyDepartmentPositionIndexes(): Promise<void> {
    const legacyIndexNames = new Set([
      'positionId_1',
      'isActive_1',
      'departmentId_1_positionId_1',
      'departmentId_1_isActive_1',
    ]);
    const indexes = await this.departmentPositionModel.collection.indexes();
    const indexesToRemove = indexes.flatMap((index) => index.name && legacyIndexNames.has(index.name) ? [index.name] : []);
    await Promise.all(indexesToRemove.map((indexName) => this.departmentPositionModel.collection.dropIndex(indexName)));
  }
  private toPositionAssignment(assignment: DepartmentPositionDocument, jobTitle: Position & { _id: { toString(): string } }) { return { id: assignment._id.toString(), departmentId: assignment.departmentId.toString(), jobTitle: { id: jobTitle._id.toString(), code: jobTitle.code, name: jobTitle.name }, createdAt: assignment.createdAt, updatedAt: assignment.updatedAt }; }
  private snapshot(item: DepartmentDocument) { return { code: item.code, name: item.name, parentId: item.parentId?.toString(), managerEmployeeId: item.managerEmployeeId?.toString(), isActive: item.isActive, sortOrder: item.sortOrder }; }
  private async audit(request: RequestWithContext, action: string, item: DepartmentDocument, before?: Record<string, unknown>, after?: Record<string, unknown>) { await this.auditLogService.record(request, { action, outcome: AuditOutcome.SUCCESS, resource: { type: 'DEPARTMENT', id: item._id.toString(), code: item.code }, changes: { ...(before ? { before } : {}), ...(after ? { after } : {}) } }); }
  private duplicateField(field: 'code' | 'name') { return new ConflictException({ message: field === 'code' ? 'Mã phòng ban đã tồn tại.' : 'Tên phòng ban đã tồn tại.', field }); }
  private escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  private isDuplicate(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }
}
