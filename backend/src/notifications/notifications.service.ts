import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import type { SafeUser } from '../users/users.service.js';
import { CreateNotificationDto, ListNotificationsDto } from './dto/notification.dto.js';
import { Notification } from './schemas/notification.schema.js';
import { NotificationRead } from './schemas/notification-read.schema.js';

type NotificationResult = {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  type: string;
  title: string;
  description: string;
  link?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
  resolvedIsRead?: boolean;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    @InjectModel(NotificationRead.name) private readonly notificationReads: Model<NotificationRead>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(user: SafeUser, query: ListNotificationsDto) {
    const userId = new Types.ObjectId(user.id);
    const readFilter = query.isRead === undefined ? [] : [{ $match: { resolvedIsRead: query.isRead } }];
    const pipeline = [
      { $match: { $or: [{ userId }, { userId: { $exists: false } }] } },
      {
        $lookup: {
          from: 'notification_reads',
          let: { notificationId: '$_id' },
          pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$notificationId', '$$notificationId'] }, { $eq: ['$userId', userId] }] } } }],
          as: 'readReceipts',
        },
      },
      {
        $addFields: {
          resolvedIsRead: {
            $cond: [
              { $ne: [{ $ifNull: ['$userId', null] }, null] },
              '$isRead',
              { $gt: [{ $size: '$readReceipts' }, 0] },
            ],
          },
        },
      },
      ...readFilter,
      { $sort: { createdAt: -1 as const } },
      {
        $facet: {
          data: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
          total: [{ $count: 'value' }],
        },
      },
    ];
    const [result] = await this.notifications.aggregate<{ data: NotificationResult[]; total: Array<{ value: number }> }>(pipeline).exec();
    const total = result?.total[0]?.value ?? 0;
    return {
      data: (result?.data ?? []).map((item) => this.toResponse(item, item.resolvedIsRead ?? item.isRead)),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async findOne(user: SafeUser, id: string) {
    const item = await this.findVisibleNotification(user, id);
    return this.toResponse(item, await this.resolveReadState(user, item));
  }

  async create(request: RequestWithContext, input: CreateNotificationDto) {
    const item = await this.notifications.create(input);
    await this.auditLogService.record(request, {
      action: 'NOTIFICATION.CREATED',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'NOTIFICATION', id: item._id.toString(), code: item.title },
      changes: { after: { userId: item.userId?.toString(), type: item.type, title: item.title, description: item.description, link: item.link } },
    });
    return this.toResponse(item.toObject(), item.isRead);
  }

  async updateRead(user: SafeUser, id: string, isRead: boolean) {
    const item = await this.findVisibleNotification(user, id);
    if (item.userId) {
      const updated = await this.notifications.findByIdAndUpdate(id, { $set: { isRead } }, { returnDocument: 'after' }).lean().exec();
      if (!updated) throw new NotFoundException('Notification not found');
      return this.toResponse(updated as NotificationResult, updated.isRead);
    }

    const notificationId = new Types.ObjectId(id);
    const userId = new Types.ObjectId(user.id);
    if (isRead) {
      await this.notificationReads.updateOne({ notificationId, userId }, { $setOnInsert: { notificationId, userId } }, { upsert: true }).exec();
    } else {
      await this.notificationReads.deleteOne({ notificationId, userId }).exec();
    }
    return this.toResponse(item, isRead);
  }

  private async findVisibleNotification(user: SafeUser, id: string): Promise<NotificationResult> {
    const item = await this.notifications.findOne({ _id: id, $or: [{ userId: user.id }, { userId: { $exists: false } }] }).lean().exec();
    if (!item) throw new NotFoundException('Notification not found');
    return item as NotificationResult;
  }

  private async resolveReadState(user: SafeUser, item: NotificationResult): Promise<boolean> {
    if (item.userId) return item.isRead;
    return this.notificationReads.exists({ notificationId: item._id, userId: new Types.ObjectId(user.id) }).then(Boolean);
  }

  private toResponse(item: NotificationResult, isRead: boolean) {
    const { resolvedIsRead: _resolvedIsRead, ...notification } = item;
    return { ...notification, isRead };
  }
}
