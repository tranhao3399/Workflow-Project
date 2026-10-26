import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { normalizeSearchText } from '../common/text/normalize-search-text.js';
import { DepartmentPosition } from '../departments/schemas/department-position.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { CreateJobTitleDto, CreatePositionDto, ListPositionsDto, UpdateJobTitleDto, UpdatePositionDto } from './dto/position.dto.js';
import { Position, PositionDocument } from './schemas/position.schema.js';

@Injectable()
export class PositionsService {
  constructor(
    @InjectModel(Position.name) private readonly model: Model<Position>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(DepartmentPosition.name) private readonly departmentPositions: Model<DepartmentPosition>,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(query: ListPositionsDto) {
    const isActive = query.isActive ?? query.active;
    return this.model.find(isActive === undefined ? {} : { isActive }).sort({ sortOrder: 1, name: 1 }).lean().exec();
  }

  async findCatalog(query: ListPositionsDto) {
    const items = await this.findAll(query);
    return items.map((item) => this.catalogResponse(item));
  }

  async findCatalogOne(id: string) {
    const item = await this.model.findById(id).lean().exec();
    if (!item) throw new NotFoundException('Không tìm thấy chức danh.');
    return this.catalogResponse(item);
  }

  async createCatalog(request: RequestWithContext, input: CreateJobTitleDto) {
    const item = await this.createInternal(request, input);
    return this.catalogResponse(item);
  }

  async updateCatalog(request: RequestWithContext, id: string, input: UpdateJobTitleDto) {
    const item = await this.updateInternal(request, id, input);
    return this.catalogResponse(item);
  }

  async removeCatalog(request: RequestWithContext, id: string) {
    const item = await this.model.findById(id).exec();
    if (!item) throw new NotFoundException('Không tìm thấy chức danh.');
    const [employeeCount, departmentAssignmentCount] = await Promise.all([
      this.employees.countDocuments({ positionId: item._id }).exec(),
      this.departmentPositions.countDocuments({ positionId: item._id }).exec(),
    ]);
    if (employeeCount > 0 || departmentAssignmentCount > 0) {
      throw new ConflictException('Không thể xóa chức danh đang được gán cho nhân viên hoặc phòng ban.');
    }
    await this.model.deleteOne({ _id: item._id }).exec();
    await this.record(request, 'POSITION.DELETED', item, this.snapshot(item));
    return { id: item._id.toString(), deleted: true };
  }

  async findOne(id: string) {
    const item = await this.model.findById(id).lean().exec();
    if (!item) throw new NotFoundException('Không tìm thấy vị trí.');
    return item;
  }

  async create(request: RequestWithContext, input: CreatePositionDto) {
    return (await this.createInternal(request, input)).toObject();
  }

  async update(request: RequestWithContext, id: string, input: UpdatePositionDto) {
    return (await this.updateInternal(request, id, input)).toObject();
  }

  private async createInternal(request: RequestWithContext, input: CreatePositionDto | CreateJobTitleDto) {
    const last = await this.model.findOne().sort({ sortOrder: -1 }).select({ sortOrder: 1 }).lean().exec();
    try {
      const item = await this.model.create({
        code: input.code.toUpperCase(),
        name: input.name.trim(),
        nameNormalized: normalizeSearchText(input.name),
        isActive: input.isActive ?? true,
        sortOrder: 'sortOrder' in input && input.sortOrder !== undefined ? input.sortOrder : (last?.sortOrder ?? 0) + 10,
        createdBy: request.user?.id,
        updatedBy: request.user?.id,
      });
      await this.record(request, 'POSITION.CREATED', item, undefined, this.snapshot(item));
      return item;
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) throw new ConflictException({ message: 'Mã hoặc tên chức danh đã tồn tại.', field: 'code' });
      throw error;
    }
  }

  private async updateInternal(request: RequestWithContext, id: string, input: UpdatePositionDto | UpdateJobTitleDto) {
    const current = await this.model.findById(id).exec();
    if (!current) throw new NotFoundException('Không tìm thấy chức danh.');
    try {
      const item = await this.model.findByIdAndUpdate(id, { $set: {
        ...input,
        ...(input.code ? { code: input.code.toUpperCase() } : {}),
        ...(input.name ? { name: input.name.trim(), nameNormalized: normalizeSearchText(input.name) } : {}),
        updatedBy: request.user?.id,
      } }, { returnDocument: 'after', runValidators: true }).exec();
      if (!item) throw new NotFoundException('Không tìm thấy chức danh.');
      await this.record(request, current.isActive && !item.isActive ? 'POSITION.DEACTIVATED' : 'POSITION.UPDATED', item, this.snapshot(current), this.snapshot(item));
      return item;
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) throw new ConflictException({ message: 'Mã hoặc tên chức danh đã tồn tại.', field: 'code' });
      throw error;
    }
  }

  private catalogResponse(item: Position & { _id: { toString(): string } }) {
    return { id: item._id.toString(), code: item.code, name: item.name, isActive: item.isActive };
  }

  private snapshot(item: PositionDocument) {
    return { code: item.code, name: item.name, isActive: item.isActive, sortOrder: item.sortOrder };
  }

  private async record(request: RequestWithContext, action: string, item: PositionDocument, before?: Record<string, unknown>, after?: Record<string, unknown>) {
    await this.audit.record(request, { action, outcome: AuditOutcome.SUCCESS, resource: { type: 'POSITION', id: item._id.toString(), code: item.code }, changes: { ...(before ? { before } : {}), ...(after ? { after } : {}) } });
  }

}
