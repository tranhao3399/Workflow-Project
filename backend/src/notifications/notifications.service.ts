import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import { createPaginationMetadata } from '../common/http/pagination.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { MailService } from '../mail/mail.service.js';
import { Request, type RequestStatus } from '../requests/schemas/request.schema.js';
import { User } from '../users/schemas/user.schema.js';
import type { SafeUser } from '../users/users.service.js';
import { CreateNotificationDto, ListNotificationsDto } from './dto/notification.dto.js';
import {
  Notification,
  type NotificationTargetType,
  type NotificationType,
} from './schemas/notification.schema.js';
import { NotificationRead } from './schemas/notification-read.schema.js';

type NotificationResult = Notification & { _id: Types.ObjectId; resolvedIsRead?: boolean };
type SessionWithEndedEvent = ClientSession & {
  once?: (event: 'ended', listener: () => void) => unknown;
};
type DuplicateKeyError = {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  message?: unknown;
};

const NOTIFICATION_DEDUPE_INDEX = 'uniq_notification_dedupe_recipient';
const REQUEST_EMAIL_RESOURCE_TYPES = new Set(['REQUEST', 'APPROVAL_TASK']);
const requestStatusLabels: Record<RequestStatus, string> = {
  DRAFT: 'Nháp',
  IN_PROGRESS: 'Đang xử lý',
  REVISION_REQUESTED: 'Cần bổ sung',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  VOIDED: 'Đã vô hiệu hóa',
};

export interface CreatePersonalNotificationInput {
  recipientUserId: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  resource?: {
    type: string;
    id: string | Types.ObjectId;
  };
  data?: Record<string, unknown>;
  createdByUserId?: string | Types.ObjectId;
  dedupeKey: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    @InjectModel(NotificationRead.name) private readonly reads: Model<NotificationRead>,
    private readonly auditLogs: AuditLogService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly mailService?: MailService,
    @Optional() @InjectModel(User.name) private readonly users?: Model<User>,
    @Optional() @InjectModel(Employee.name) private readonly employees?: Model<Employee>,
    @Optional() @InjectModel(Request.name) private readonly requests?: Model<Request>,
  ) {}

  async findAll(user: SafeUser, query: ListNotificationsDto) {
    const userId = new Types.ObjectId(user.id);
    const pipeline = [
      { $match: { $or: [{ targetType: 'BROADCAST' }, { targetType: 'PERSONAL', recipientUserId: userId }], $and: [{ $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] }] } },
      { $lookup: { from: 'notification_reads', let: { notificationId: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$notificationId', '$$notificationId'] }, { $eq: ['$userId', userId] }] } } }], as: 'readReceipts' } },
      { $addFields: { resolvedIsRead: { $cond: [{ $eq: ['$targetType', 'PERSONAL'] }, '$isRead', { $gt: [{ $size: '$readReceipts' }, 0] }] } } },
      ...(query.isRead === undefined ? [] : [{ $match: { resolvedIsRead: query.isRead } }]),
      { $sort: { createdAt: -1 as const } },
      { $facet: { data: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }], total: [{ $count: 'value' }] } },
    ];
    const [result] = await this.notifications.aggregate<{ data: NotificationResult[]; total: Array<{ value: number }> }>(pipeline).exec();
    const total = result?.total[0]?.value ?? 0;
    return {
      data: (result?.data ?? []).map((item) => this.toResponse(item, item.resolvedIsRead ?? false)),
      pagination: createPaginationMetadata(query.page, query.limit, total),
    };
  }

  async findOne(user: SafeUser, id: string) {
    const item = await this.findVisible(user, id);
    return this.toResponse(item, await this.readState(user, item));
  }

  async create(request: RequestWithContext, input: CreateNotificationDto) {
    const targetType: NotificationTargetType = input.userId ? 'PERSONAL' : 'BROADCAST';
    const recipientUserId = input.userId ? new Types.ObjectId(input.userId) : undefined;
    const dedupeKey = input.dedupeKey?.trim();
    let item;
    try {
      item = await this.notifications.create({
        targetType,
        ...(recipientUserId ? { recipientUserId } : {}),
        type: input.type,
        title: input.title,
        message: input.description,
        link: input.link,
        isRead: false,
        createdByUserId: request.user?.id,
        ...(dedupeKey ? { dedupeKey } : {}),
      });
    } catch (error) {
      if (!dedupeKey || !this.isDedupeConflict(error)) throw error;
      const existing = await this.findByDedupeKey(dedupeKey, targetType, recipientUserId);
      if (!existing) throw error;
      return this.toResponse(existing, existing.targetType === 'PERSONAL' ? existing.isRead : false);
    }
    await this.auditLogs.record(request, {
      action: 'NOTIFICATION.CREATED',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'NOTIFICATION', id: item.id, code: item.title },
      changes: { after: { userId: item.recipientUserId?.toString(), type: item.type, title: item.title, description: item.message, link: item.link } },
    });
    return this.toResponse(item.toObject(), false);
  }

  async createPersonal(
    input: CreatePersonalNotificationInput,
    session?: ClientSession,
  ): Promise<NotificationResult> {
    const recipientUserId = this.toObjectId(input.recipientUserId);
    const dedupeKey = input.dedupeKey.trim();
    const existing = await this.findByDedupeKey(
      dedupeKey,
      'PERSONAL',
      recipientUserId,
      session,
    );
    if (existing) return existing;

    const document = {
      targetType: 'PERSONAL' as const,
      recipientUserId,
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      isRead: false,
      ...(input.link ? { link: input.link.trim() } : {}),
      ...(input.resource ? {
        resource: {
          type: input.resource.type.trim().toUpperCase(),
          id: this.toObjectId(input.resource.id),
        },
      } : {}),
      ...(input.data ? { data: input.data } : {}),
      ...(input.createdByUserId ? {
        createdByUserId: this.toObjectId(input.createdByUserId),
      } : {}),
      dedupeKey,
    };

    try {
      const created = await this.notifications.create([document], { session });
      const createdObject = created[0].toObject() as NotificationResult;
      this.scheduleRequestNotificationEmail(createdObject._id, input, session);
      return createdObject;
    } catch (error) {
      if (!this.isDedupeConflict(error) || session) throw error;
      const duplicate = await this.findByDedupeKey(
        dedupeKey,
        'PERSONAL',
        recipientUserId,
      );
      if (!duplicate) throw error;
      return duplicate;
    }
  }

  async updateRead(user: SafeUser, id: string, isRead: boolean) {
    const item = await this.findVisible(user, id);
    if (item.targetType === 'PERSONAL') {
      const updated = await this.notifications.findByIdAndUpdate(id, isRead
        ? { $set: { isRead: true, readAt: new Date() } }
        : { $set: { isRead: false }, $unset: { readAt: 1 } }, { returnDocument: 'after' }).lean().exec();
      if (!updated) throw new NotFoundException('Không tìm thấy thông báo.');
      return this.toResponse(updated, updated.isRead);
    }
    const notificationId = new Types.ObjectId(id);
    const userId = new Types.ObjectId(user.id);
    if (isRead) {
      await this.reads.updateOne({ notificationId, userId }, { $setOnInsert: { notificationId, userId } }, { upsert: true }).exec();
    } else {
      await this.reads.deleteOne({ notificationId, userId }).exec();
    }
    return this.toResponse(item, isRead);
  }

  async markAllRead(user: SafeUser): Promise<{ updatedCount: number }> {
    const userId = new Types.ObjectId(user.id);
    const now = new Date();
    const activeFilter = {
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    };
    const [personalResult, broadcasts] = await Promise.all([
      this.notifications.updateMany(
        {
          targetType: 'PERSONAL',
          recipientUserId: userId,
          isRead: false,
          ...activeFilter,
        },
        { $set: { isRead: true, readAt: now } },
      ).exec(),
      this.notifications.find({ targetType: 'BROADCAST', ...activeFilter }).select({ _id: 1 }).lean().exec(),
    ]);

    if (broadcasts.length === 0) {
      return { updatedCount: personalResult.modifiedCount };
    }

    const broadcastResult = await this.reads.bulkWrite(
      broadcasts.map((notification) => ({
        updateOne: {
          filter: { notificationId: notification._id, userId },
          update: { $setOnInsert: { notificationId: notification._id, userId, readAt: now } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return {
      updatedCount: personalResult.modifiedCount + broadcastResult.upsertedCount,
    };
  }

  private async findVisible(user: SafeUser, id: string): Promise<NotificationResult> {
    const item = await this.notifications.findOne({ _id: id, $or: [{ targetType: 'BROADCAST' }, { targetType: 'PERSONAL', recipientUserId: user.id }] }).lean().exec();
    if (!item) throw new NotFoundException('Không tìm thấy thông báo.');
    return item as NotificationResult;
  }

  private async readState(user: SafeUser, item: NotificationResult) {
    if (item.targetType === 'PERSONAL') return item.isRead;
    return Boolean(await this.reads.exists({ notificationId: item._id, userId: new Types.ObjectId(user.id) }));
  }

  private async findByDedupeKey(
    dedupeKey: string,
    targetType: NotificationTargetType,
    recipientUserId?: Types.ObjectId,
    session?: ClientSession,
  ): Promise<NotificationResult | null> {
    const recipientFilter = recipientUserId
      ? { recipientUserId }
      : { $or: [{ recipientUserId: { $exists: false } }, { recipientUserId: null }] };
    return this.notifications
      .findOne({ dedupeKey, targetType, ...recipientFilter })
      .session(session ?? null)
      .lean()
      .exec() as Promise<NotificationResult | null>;
  }

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
  }

  private isDedupeConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const duplicate = error as DuplicateKeyError;
    if (duplicate.code !== 11000) return false;
    const keys = duplicate.keyPattern ? Object.keys(duplicate.keyPattern) : [];
    const hasExactKeyPattern = keys.length === 2
      && duplicate.keyPattern?.dedupeKey === 1
      && duplicate.keyPattern?.recipientUserId === 1;
    return hasExactKeyPattern || (typeof duplicate.message === 'string' && duplicate.message.includes(NOTIFICATION_DEDUPE_INDEX));
  }

  private toResponse(item: NotificationResult, isRead: boolean) {
    const { resolvedIsRead: _resolved, recipientUserId, message, ...rest } = item;
    return { ...rest, ...(recipientUserId ? { userId: recipientUserId } : {}), description: message, isRead };
  }

  private scheduleRequestNotificationEmail(
    notificationId: Types.ObjectId,
    input: CreatePersonalNotificationInput,
    session?: ClientSession,
  ): void {
    const resourceType = input.resource?.type.trim().toUpperCase();
    if (!resourceType || !REQUEST_EMAIL_RESOURCE_TYPES.has(resourceType)) return;
    if (!this.mailService || !this.users) return;

    const sessionWithEvents = session as SessionWithEndedEvent | undefined;
    if (sessionWithEvents && typeof sessionWithEvents.once === 'function') {
      sessionWithEvents.once('ended', () => {
        void this.dispatchRequestNotificationEmail(notificationId, input, true).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Lỗi không xác định';
          this.logger.warn(`Không thể gửi email thông báo phiếu: ${message}`);
        });
      });
      return;
    }

    void this.dispatchRequestNotificationEmail(notificationId, input, false).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định';
      this.logger.warn(`Không thể gửi email thông báo phiếu: ${message}`);
    });
  }

  private async dispatchRequestNotificationEmail(
    notificationId: Types.ObjectId,
    input: CreatePersonalNotificationInput,
    verifyPersisted: boolean,
  ): Promise<void> {
    if (!this.mailService || !this.users) return;
    if (verifyPersisted) {
      const persisted = await this.notifications.exists({ _id: notificationId }).exec();
      if (!persisted) return;
    }

    const user = await this.users
      .findOne({ _id: this.toObjectId(input.recipientUserId), isActive: true })
      .select({ email: 1, displayName: 1, employeeId: 1 })
      .lean()
      .exec();
    if (!user?.email) return;

    const requestId = this.resolveRequestId(input);
    const [employee, request] = await Promise.all([
      user.employeeId && this.employees
        ? this.employees.findById(user.employeeId).select({ fullName: 1 }).lean().exec()
        : Promise.resolve(null),
      requestId && this.requests
        ? this.requests
            .findById(requestId)
            .select({
              requestNo: 1,
              title: 1,
              status: 1,
              currentStepKey: 1,
              requesterSnapshot: 1,
              formSnapshot: 1,
              workflowSnapshot: 1,
            })
            .lean()
            .exec()
        : Promise.resolve(null),
    ]);

    const stepKey = this.dataString(input.data, 'stepKey') ?? request?.currentStepKey;
    const stepName = this.resolveStepName(request?.workflowSnapshot, stepKey);
    const formName = this.resolveFormName(request?.formSnapshot);
    const requestNo = request?.requestNo ?? this.dataString(input.data, 'requestNo');

    await this.mailService.sendRequestNotification({
      toEmail: user.email,
      recipientName: employee?.fullName ?? user.displayName ?? user.email,
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      requestNo,
      requestTitle: request?.title,
      formName,
      requesterName: request?.requesterSnapshot?.fullName,
      requesterDepartment: request?.requesterSnapshot?.departmentName,
      stepName,
      statusLabel: request?.status ? requestStatusLabels[request.status] : undefined,
      actionUrl: this.buildActionUrl(input, requestId),
    });
  }

  private resolveRequestId(input: CreatePersonalNotificationInput): string | undefined {
    const resourceType = input.resource?.type.trim().toUpperCase();
    if (resourceType === 'REQUEST' && input.resource?.id) {
      return input.resource.id.toString();
    }
    return this.dataString(input.data, 'requestId');
  }

  private resolveStepName(
    workflowSnapshot: Record<string, unknown> | undefined,
    stepKey: string | undefined,
  ): string | undefined {
    if (!workflowSnapshot || !stepKey) return stepKey;
    const steps = workflowSnapshot.steps;
    if (!Array.isArray(steps)) return stepKey;
    const matched = steps.find(
      (step): step is { stepKey?: unknown; name?: unknown } =>
        Boolean(step && typeof step === 'object' && (step as { stepKey?: unknown }).stepKey === stepKey),
    );
    return typeof matched?.name === 'string' && matched.name.trim() ? matched.name.trim() : stepKey;
  }

  private resolveFormName(formSnapshot: Record<string, unknown> | undefined): string | undefined {
    const name = formSnapshot?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  }

  private buildActionUrl(
    input: CreatePersonalNotificationInput,
    requestId: string | undefined,
  ): string | undefined {
    const origin =
      this.configService?.get<string>('FRONTEND_ORIGIN') ??
      this.configService?.get<string>('FRONTEND_URL') ??
      'http://localhost:5173';
    const baseUrl = origin.split(',')[0]?.trim().replace(/\/+$/, '');
    if (!baseUrl) return undefined;

    const resourceType = input.resource?.type.trim().toUpperCase();
    if (resourceType === 'APPROVAL_TASK' && requestId && input.resource?.id) {
      return `${baseUrl}/requests/${requestId}?from=approval-inbox&taskId=${encodeURIComponent(input.resource.id.toString())}`;
    }
    if (resourceType === 'REQUEST' && requestId) {
      return `${baseUrl}/requests/${requestId}`;
    }
    if (input.link?.startsWith('/')) {
      return `${baseUrl}${input.link}`;
    }
    return undefined;
  }

  private dataString(data: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = data?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
