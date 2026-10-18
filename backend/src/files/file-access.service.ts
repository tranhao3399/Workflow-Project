import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApprovalTask } from '../approvals/schemas/approval-task.schema.js';
import { Request, type RequestStatus } from '../requests/schemas/request.schema.js';
import type { FileOwnerType } from './schemas/stored-file.schema.js';

export interface FileOwnerReference {
  ownerType?: FileOwnerType;
  ownerId?: Types.ObjectId;
}

export interface RequestAccessRecord {
  _id: Types.ObjectId;
  requesterUserId: Types.ObjectId;
  status: RequestStatus;
}

@Injectable()
export class FileAccessService {
  constructor(
    @InjectModel(Request.name) private readonly requests: Model<Request>,
    @InjectModel(ApprovalTask.name) private readonly approvalTasks: Model<ApprovalTask>,
  ) {}

  async requireEditableRequest(requestId: string | Types.ObjectId, userId: string): Promise<RequestAccessRecord> {
    const requestObjectId = this.toObjectId(requestId, 'requestId');
    const userObjectId = this.toObjectId(userId, 'userId');
    const request = await this.requests.findById(requestObjectId)
      .select({ requesterUserId: 1, status: 1 })
      .lean().exec();
    if (!request) throw new NotFoundException('Không tìm thấy phiếu yêu cầu.');
    if (!request.requesterUserId.equals(userObjectId)) {
      throw new ForbiddenException('Bạn không được chỉnh sửa tệp của phiếu yêu cầu này.');
    }
    if (request.status !== 'DRAFT' && request.status !== 'REVISION_REQUESTED') {
      throw new ForbiddenException('Phiếu yêu cầu hiện không cho phép thay đổi tệp đính kèm.');
    }
    return request as RequestAccessRecord;
  }

  async requireFileReadAccess(
    file: FileOwnerReference,
    userId: string,
    permissionKeys: readonly string[],
  ): Promise<RequestAccessRecord> {
    const requestId = await this.resolveRequestId(file);
    const request = await this.requests.findById(requestId)
      .select({ requesterUserId: 1, status: 1 })
      .lean().exec();
    if (!request) throw new NotFoundException('Không tìm thấy phiếu yêu cầu của tệp.');

    const userObjectId = this.toObjectId(userId, 'userId');
    if (permissionKeys.includes('REQUESTS.VIEW_ALL') || request.requesterUserId.equals(userObjectId)) {
      return request as RequestAccessRecord;
    }

    const hasApprovalTask = await this.approvalTasks.exists({ requestId: request._id, assigneeUserId: userObjectId });
    if (!hasApprovalTask) throw new ForbiddenException('Bạn không có quyền truy cập tệp đính kèm này.');
    return request as RequestAccessRecord;
  }

  async requireFileEditAccess(file: FileOwnerReference, userId: string): Promise<RequestAccessRecord> {
    const requestId = await this.resolveRequestId(file);
    return this.requireEditableRequest(requestId, userId);
  }

  private async resolveRequestId(file: FileOwnerReference): Promise<Types.ObjectId> {
    if (!file.ownerId || !file.ownerType) throw new NotFoundException('Tệp chưa được gắn với nghiệp vụ hợp lệ.');
    if (file.ownerType === 'REQUEST') return file.ownerId;

    const task = await this.approvalTasks.findById(file.ownerId).select({ requestId: 1 }).lean().exec();
    if (!task) throw new NotFoundException('Không tìm thấy tác vụ phê duyệt của tệp.');
    return task.requestId;
  }

  private toObjectId(value: string | Types.ObjectId, field: string): Types.ObjectId {
    if (value instanceof Types.ObjectId) return value;
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`${field} không hợp lệ.`);
    return new Types.ObjectId(value);
  }
}
