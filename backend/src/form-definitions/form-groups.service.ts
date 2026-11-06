import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreateFormGroupDto, UpdateFormGroupDto } from './dto/form-group.dto.js';
import { FormDefinition } from './schemas/form-definition.schema.js';
import { FormGroup, type FormGroupDocument } from './schemas/form-group.schema.js';

type StoredFormGroup = FormGroup & { _id: Types.ObjectId };

@Injectable()
export class FormGroupsService {
  constructor(
    @InjectModel(FormGroup.name) private readonly groups: Model<FormGroup>,
    @InjectModel(FormDefinition.name) private readonly forms: Model<FormDefinition>,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll() {
    const [groups, counts] = await Promise.all([
      this.groups.find().sort({ sortOrder: 1, name: 1, _id: 1 }).lean().exec(),
      this.forms.aggregate<{ _id: Types.ObjectId; formCount: number }>([
        { $match: { groupId: { $type: 'objectId' } } },
        { $group: { _id: { groupId: '$groupId', code: '$code' } } },
        { $group: { _id: '$_id.groupId', formCount: { $sum: 1 } } },
      ]).exec(),
    ]);
    const countByGroup = new Map(counts.map((item) => [item._id.toString(), item.formCount]));
    return groups.map((group) => this.toResponse(group as StoredFormGroup, countByGroup.get(group._id.toString()) ?? 0));
  }

  async create(request: RequestWithContext, input: CreateFormGroupDto) {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    try {
      const group = await this.groups.create({
        code,
        name,
        nameNormalized: this.normalizeName(name),
        description: input.description?.trim(),
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdBy: this.actorId(request),
        updatedBy: this.actorId(request),
      });
      await this.record(request, 'FORM_GROUP.CREATED', 'Đã tạo nhóm biểu mẫu.', group, undefined, this.auditView(group));
      return this.toResponse(group, 0);
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) throw this.duplicateError(error);
      throw error;
    }
  }

  async update(request: RequestWithContext, id: string, input: UpdateFormGroupDto) {
    const current = await this.groups.findById(id).exec();
    if (!current) throw new NotFoundException('Không tìm thấy nhóm biểu mẫu.');
    const before = this.auditView(current);
    if (input.name !== undefined) {
      current.name = input.name.trim();
      current.nameNormalized = this.normalizeName(input.name);
    }
    if (input.description !== undefined) current.description = input.description.trim();
    if (input.isActive !== undefined) current.isActive = input.isActive;
    if (input.sortOrder !== undefined) current.sortOrder = input.sortOrder;
    current.updatedBy = this.actorId(request);
    try {
      await current.save();
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) throw this.duplicateError(error);
      throw error;
    }
    const formCount = (await this.forms.distinct('code', { groupId: current._id })).length;
    await this.record(request, 'FORM_GROUP.UPDATED', 'Đã cập nhật nhóm biểu mẫu.', current, before, this.auditView(current));
    return this.toResponse(current, formCount);
  }

  async remove(request: RequestWithContext, id: string): Promise<{ id: string }> {
    const group = await this.groups.findById(id).exec();
    if (!group) throw new NotFoundException('Không tìm thấy nhóm biểu mẫu.');
    if (await this.forms.exists({ groupId: group._id })) {
      throw new ConflictException('Không thể xóa nhóm đang có biểu mẫu. Vui lòng chuyển các biểu mẫu sang nhóm khác trước.');
    }
    await this.groups.deleteOne({ _id: group._id }).exec();
    await this.record(request, 'FORM_GROUP.DELETED', 'Đã xóa nhóm biểu mẫu.', group, this.auditView(group));
    return { id };
  }

  async requireAssignable(groupId: string): Promise<Types.ObjectId> {
    const group = await this.groups.findOne({ _id: groupId, isActive: true }).select({ _id: 1 }).lean().exec();
    if (!group) {
      throw new ConflictException({
        field: 'groupId',
        message: 'Nhóm biểu mẫu không tồn tại hoặc đang ngưng hoạt động.',
      });
    }
    return group._id;
  }

  private toResponse(group: StoredFormGroup | FormGroupDocument, formCount: number) {
    return {
      id: group._id.toString(),
      code: group.code,
      name: group.name,
      ...(group.description ? { description: group.description } : {}),
      isActive: group.isActive,
      sortOrder: group.sortOrder,
      formCount,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  private normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  }

  private actorId(request: RequestWithContext): Types.ObjectId {
    const id = request.user?.id;
    if (!id || !Types.ObjectId.isValid(id)) throw new UnauthorizedException('Không thể xác định người dùng hiện tại.');
    return new Types.ObjectId(id);
  }

  private duplicateError(error: unknown): ConflictException {
    const keyPattern = typeof error === 'object' && error !== null && 'keyPattern' in error
      ? (error as { keyPattern?: Record<string, unknown> }).keyPattern
      : undefined;
    return keyPattern?.nameNormalized
      ? new ConflictException({ field: 'name', message: 'Tên nhóm biểu mẫu đã tồn tại.' })
      : new ConflictException({ field: 'code', message: 'Mã nhóm biểu mẫu đã tồn tại.' });
  }

  private auditView(group: FormGroupDocument): Record<string, unknown> {
    return {
      code: group.code,
      name: group.name,
      description: group.description,
      isActive: group.isActive,
      sortOrder: group.sortOrder,
    };
  }

  private async record(
    request: RequestWithContext,
    action: string,
    description: string,
    group: FormGroupDocument,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogs.record(request, {
      action,
      description,
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'FORM_GROUP', id: group._id.toString(), code: group.code, name: group.name },
      changes: before || after ? { before, after } : undefined,
    });
  }
}
