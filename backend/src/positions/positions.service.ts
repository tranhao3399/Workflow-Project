import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js'; import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js'; import type { RequestWithContext } from '../common/http/request-context.interface.js'; import { Department } from '../departments/schemas/department.schema.js'; import { DepartmentPosition } from '../departments/schemas/department-position.schema.js'; import { Employee } from '../employees/schemas/employee.schema.js'; import { CreateJobTitleDto, CreatePositionDto, ListPositionsDto, UpdateJobTitleDto, UpdatePositionDto } from './dto/position.dto.js'; import { Position, PositionDocument } from './schemas/position.schema.js';
@Injectable() export class PositionsService {
  constructor(@InjectModel(Position.name) private readonly model: Model<Position>, @InjectModel(Department.name) private readonly departments: Model<Department>, @InjectModel(Employee.name) private readonly employees: Model<Employee>, @InjectModel(DepartmentPosition.name) private readonly departmentPositions: Model<DepartmentPosition>, private readonly audit: AuditLogService) {}
  async findAll(query: ListPositionsDto) { return this.model.find({ ...(query.active === undefined ? {} : { isActive: query.active }), ...(query.departmentId ? { departmentId: query.departmentId } : {}) }).sort({ sortOrder: 1, name: 1 }).populate('departmentId', 'name').lean().exec(); }
  async findCatalog(query: ListPositionsDto) {
    const isActive = query.isActive ?? query.active;
    const items = await this.model.find(isActive === undefined ? {} : { isActive }).sort({ sortOrder: 1, name: 1 }).select({ code: 1, name: 1, isActive: 1 }).lean().exec();
    return items.map((item) => ({ id: item._id.toString(), code: item.code, name: item.name, isActive: item.isActive }));
  }
  async findCatalogOne(id: string) {
    const item = await this.model.findById(id).select({ code: 1, name: 1, isActive: 1 }).lean().exec();
    if (!item) throw new NotFoundException('Job title not found');
    return { id: item._id.toString(), code: item.code, name: item.name, isActive: item.isActive };
  }
  async createCatalog(request: RequestWithContext, input: CreateJobTitleDto) {
    const code = input.code.toUpperCase();
    const name = input.name.trim();
    if (await this.model.exists({ code })) throw this.catalogConflict();
    const last = await this.model.findOne().sort({ sortOrder: -1 }).select({ sortOrder: 1 }).lean().exec();
    try {
      const item = await this.model.create({ code, name, isActive: input.isActive ?? true, sortOrder: (last?.sortOrder ?? 0) + 10 });
      await this.record(request, 'POSITION.CREATED', item, undefined, this.snapshot(item));
      return { id: item._id.toString(), code: item.code, name: item.name, isActive: item.isActive };
    } catch (error) {
      if (this.duplicate(error)) throw this.catalogConflict();
      throw error;
    }
  }
  async updateCatalog(request: RequestWithContext, id: string, input: UpdateJobTitleDto) {
    const current = await this.model.findById(id).exec();
    if (!current) throw new NotFoundException('Job title not found');
    const code = input.code?.toUpperCase();
    if (code && code !== current.code && await this.model.exists({ code, _id: { $ne: id } })) throw this.catalogConflict();
    const update = { ...(code === undefined ? {} : { code }), ...(input.name === undefined ? {} : { name: input.name.trim() }), ...(input.isActive === undefined ? {} : { isActive: input.isActive }) };
    try {
      const item = await this.model.findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after', runValidators: true }).exec();
      if (!item) throw new NotFoundException('Job title not found');
      await this.record(request, current.isActive && !item.isActive ? 'POSITION.DEACTIVATED' : 'POSITION.UPDATED', item, this.snapshot(current), this.snapshot(item));
      return { id: item._id.toString(), code: item.code, name: item.name, isActive: item.isActive };
    } catch (error) {
      if (this.duplicate(error)) throw this.catalogConflict();
      throw error;
    }
  }
  async removeCatalog(request: RequestWithContext, id: string) {
    const item = await this.model.findById(id).exec();
    if (!item) throw new NotFoundException('Job title not found');
    const employeeFilter = { $or: [{ positionId: item._id }, { position: item.name, positionId: null }] };
    const [employeeCount, departmentAssignmentCount] = await Promise.all([
      this.employees.countDocuments(employeeFilter).exec(),
      this.departmentPositions.countDocuments({ jobTitleId: item._id }).exec(),
    ]);
    if (employeeCount > 0 || departmentAssignmentCount > 0) {
      const dependencies = [employeeCount > 0 ? 'nhân viên' : '', departmentAssignmentCount > 0 ? 'phòng ban' : ''].filter(Boolean);
      throw new ConflictException(`Không thể xóa chức danh vì đang được gán cho ${dependencies.join(', ')}.`);
    }
    await this.model.deleteOne({ _id: item._id }).exec();
    await this.record(request, 'POSITION.DELETED', item, this.snapshot(item));
    return { id: item._id.toString(), deleted: true };
  }
  async findOne(id: string) { const item = await this.model.findById(id).populate('departmentId', 'name').lean().exec(); if (!item) throw new NotFoundException('Position not found'); return item; }
  async create(request: RequestWithContext, input: CreatePositionDto) { await this.ensureDepartment(input.departmentId); try { const item = await this.model.create({ ...input, code: input.code.toUpperCase() }); await this.record(request, 'POSITION.CREATED', item, undefined, this.snapshot(item)); return item.toObject(); } catch (error) { if (this.duplicate(error)) throw new ConflictException('Position code already exists'); throw error; } }
  async update(request: RequestWithContext, id: string, input: UpdatePositionDto) { const current = await this.model.findById(id).exec(); if (!current) throw new NotFoundException('Position not found'); await this.ensureDepartment(input.departmentId === null ? undefined : input.departmentId ?? current.departmentId?.toString()); const update: Record<string, unknown> = { ...input, ...(input.code ? { code: input.code.toUpperCase() } : {}) }; const unset: Record<string, 1> = {}; if (input.departmentId === null) { delete update.departmentId; unset.departmentId = 1; } try { const item = await this.model.findByIdAndUpdate(id, { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { returnDocument: 'after', runValidators: true }).exec(); if (!item) throw new NotFoundException('Position not found'); await this.record(request, current.isActive && !item.isActive ? 'POSITION.DEACTIVATED' : 'POSITION.UPDATED', item, this.snapshot(current), this.snapshot(item)); return item.toObject(); } catch (error) { if (this.duplicate(error)) throw new ConflictException('Position code already exists'); throw error; } }
  private async ensureDepartment(id?: string) { if (id && !await this.departments.exists({ _id: id })) throw new BadRequestException('Department does not exist'); }
  private snapshot(item: PositionDocument) { return { code: item.code, name: item.name, departmentId: item.departmentId?.toString(), isActive: item.isActive, sortOrder: item.sortOrder }; }
  private async record(request: RequestWithContext, action: string, item: PositionDocument, before?: Record<string, unknown>, after?: Record<string, unknown>) { await this.audit.record(request, { action, outcome: AuditOutcome.SUCCESS, resource: { type: 'POSITION', id: item._id.toString(), code: item.code }, changes: { ...(before ? { before } : {}), ...(after ? { after } : {}) } }); }
  private duplicate(error: unknown) { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }
  private catalogConflict() { return new ConflictException({ message: 'Mã chức danh đã tồn tại.', field: 'code' }); }
}
