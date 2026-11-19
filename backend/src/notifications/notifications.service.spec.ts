import { EventEmitter } from 'node:events';
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

const notificationId = new Types.ObjectId('64b64b64b64b64b64b64b640');
const userId = new Types.ObjectId('64b64b64b64b64b64b64b641');
const user = {
  id: userId.toString(),
  fullName: 'Test User',
  email: 'test@example.com',
  role: 'EMPLOYEE' as const,
  roles: ['EMPLOYEE' as const],
  department: 'Engineering',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function queryResult<T>(value: T) {
  return { lean: () => ({ exec: vi.fn().mockResolvedValue(value) }) };
}

describe('NotificationsService broadcast read receipts', () => {
  it('stores a read receipt for the current user without changing the broadcast notification', async () => {
    const notification = {
      _id: notificationId,
      type: 'SYSTEM',
      title: 'System update',
      description: 'A broadcast notification',
      isRead: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const notifications = { findOne: vi.fn().mockReturnValue(queryResult(notification)) };
    const notificationReads = { updateOne: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(undefined) }) };
    const audit = { record: vi.fn() };
    const service = new NotificationsService(notifications as never, notificationReads as never, audit as never);

    const result = await service.updateRead(user, notificationId.toString(), true);

    expect(result.isRead).toBe(true);
    expect(notificationReads.updateOne).toHaveBeenCalledWith(
      { notificationId, userId },
      { $setOnInsert: { notificationId, userId } },
      { upsert: true },
    );
  });

  it('writes an audit event when an administrator creates a notification', async () => {
    const created = {
      _id: notificationId,
      type: 'SYSTEM',
      title: 'Maintenance',
      description: 'Scheduled maintenance',
      isRead: false,
      toObject: () => ({ _id: notificationId, type: 'SYSTEM', title: 'Maintenance', description: 'Scheduled maintenance', isRead: false }),
    };
    const notifications = { create: vi.fn().mockResolvedValue(created) };
    const notificationReads = {};
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new NotificationsService(notifications as never, notificationReads as never, audit as never);

    await service.create({ user } as never, { type: 'SYSTEM', title: 'Maintenance', description: 'Scheduled maintenance' });

    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'NOTIFICATION.CREATED' }),
    );
  });
});

function chainSelectLean<T>(value: T) {
  return {
    select: () => ({
      lean: () => ({
        exec: vi.fn().mockResolvedValue(value),
      }),
    }),
  };
}

function findOneChain<T>(value: T) {
  return {
    session: () => ({
      lean: () => ({
        exec: vi.fn().mockResolvedValue(value),
      }),
    }),
  };
}

describe('NotificationsService request email dispatch', () => {
  it('dispatches a request notification email immediately when no session is used', async () => {
    const recipientUserId = new Types.ObjectId('64b64b64b64b64b64b64b642');
    const employeeId = new Types.ObjectId('64b64b64b64b64b64b64b643');
    const requestId = new Types.ObjectId('64b64b64b64b64b64b64b644');
    const taskId = new Types.ObjectId('64b64b64b64b64b64b64b645');
    const createdDoc = {
      _id: notificationId,
      targetType: 'PERSONAL',
      recipientUserId,
      type: 'APPROVAL',
      title: 'Bạn có phiếu cần phê duyệt',
      message: 'Phiếu REQ-001 đang chờ xử lý.',
      toObject: () => ({
        _id: notificationId,
        targetType: 'PERSONAL',
        recipientUserId,
        type: 'APPROVAL',
        title: 'Bạn có phiếu cần phê duyệt',
        message: 'Phiếu REQ-001 đang chờ xử lý.',
      }),
    };
    const notifications = {
      findOne: vi.fn().mockReturnValue(findOneChain(null)),
      create: vi.fn().mockResolvedValue([createdDoc]),
    };
    const users = {
      findOne: vi.fn().mockReturnValue(chainSelectLean({
        _id: recipientUserId,
        email: 'manager@example.com',
        displayName: 'Manager Account',
        employeeId,
      })),
    };
    const employees = {
      findById: vi.fn().mockReturnValue(chainSelectLean({ fullName: 'Trần Quản Lý' })),
    };
    const requests = {
      findById: vi.fn().mockReturnValue(chainSelectLean({
        _id: requestId,
        requestNo: 'REQ-001',
        title: 'Đơn nghỉ phép',
        status: 'IN_PROGRESS',
        currentStepKey: 'APPROVAL_1',
        requesterSnapshot: { fullName: 'Nguyễn Nhân Viên', departmentName: 'Kỹ thuật' },
        formSnapshot: { name: 'Nghỉ phép năm' },
        workflowSnapshot: { steps: [{ stepKey: 'APPROVAL_1', name: 'Quản lý duyệt' }] },
      })),
    };
    const config = { get: vi.fn((key: string) => (key === 'FRONTEND_ORIGIN' ? 'https://erp.example.com/' : undefined)) };
    const mailService = { sendRequestNotification: vi.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      notifications as never,
      {} as never,
      { record: vi.fn() } as never,
      config as never,
      mailService as never,
      users as never,
      employees as never,
      requests as never,
    );

    await service.createPersonal({
      recipientUserId,
      type: 'APPROVAL',
      title: 'Bạn có phiếu cần phê duyệt',
      message: 'Phiếu REQ-001 đang chờ xử lý.',
      resource: { type: 'APPROVAL_TASK', id: taskId },
      data: { requestId: requestId.toString(), requestNo: 'REQ-001', stepKey: 'APPROVAL_1' },
      dedupeKey: 'REQ:ASSIGNED:1',
    });

    await vi.waitFor(() => {
      expect(mailService.sendRequestNotification).toHaveBeenCalledTimes(1);
    });
    expect(mailService.sendRequestNotification).toHaveBeenCalledWith(expect.objectContaining({
      toEmail: 'manager@example.com',
      recipientName: 'Trần Quản Lý',
      requestNo: 'REQ-001',
      formName: 'Nghỉ phép năm',
      stepName: 'Quản lý duyệt',
      statusLabel: 'Đang xử lý',
      actionUrl: `https://erp.example.com/requests/${requestId.toString()}?from=approval-inbox&taskId=${taskId.toString()}`,
    }));
  });

  it('waits for transaction session end and skips sending email if the notification was rolled back', async () => {
    const recipientUserId = new Types.ObjectId('64b64b64b64b64b64b64b646');
    const requestId = new Types.ObjectId('64b64b64b64b64b64b64b647');
    const session = new EventEmitter();
    const notifications = {
      findOne: vi.fn().mockReturnValue(findOneChain(null)),
      create: vi.fn().mockResolvedValue([{ _id: notificationId, toObject: () => ({ _id: notificationId }) }]),
      exists: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
    };
    const users = { findOne: vi.fn() };
    const mailService = { sendRequestNotification: vi.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      notifications as never,
      {} as never,
      { record: vi.fn() } as never,
      undefined,
      mailService as never,
      users as never,
    );

    await service.createPersonal(
      {
        recipientUserId,
        type: 'DECISION',
        title: 'Phiếu đã được phê duyệt',
        message: 'Phiếu REQ-002 đã được phê duyệt.',
        resource: { type: 'REQUEST', id: requestId },
        dedupeKey: 'REQ:DECISION:1',
      },
      session as never,
    );

    expect(mailService.sendRequestNotification).not.toHaveBeenCalled();
    session.emit('ended');
    await vi.waitFor(() => {
      expect(notifications.exists).toHaveBeenCalledWith({ _id: notificationId });
    });
    expect(users.findOne).not.toHaveBeenCalled();
    expect(mailService.sendRequestNotification).not.toHaveBeenCalled();
  });

  it('does not send duplicate email when notification dedupeKey already exists', async () => {
    const recipientUserId = new Types.ObjectId('64b64b64b64b64b64b64b648');
    const requestId = new Types.ObjectId('64b64b64b64b64b64b64b649');
    const notifications = {
      findOne: vi.fn().mockReturnValue(findOneChain({ _id: notificationId })),
      create: vi.fn(),
    };
    const mailService = { sendRequestNotification: vi.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      notifications as never,
      {} as never,
      { record: vi.fn() } as never,
      undefined,
      mailService as never,
      { findOne: vi.fn() } as never,
    );

    await service.createPersonal({
      recipientUserId,
      type: 'DECISION',
      title: 'Phiếu đã được phê duyệt',
      message: 'Phiếu REQ-003 đã được phê duyệt.',
      resource: { type: 'REQUEST', id: requestId },
      dedupeKey: 'REQ:DECISION:DUP',
    });

    expect(notifications.create).not.toHaveBeenCalled();
    expect(mailService.sendRequestNotification).not.toHaveBeenCalled();
  });
});
