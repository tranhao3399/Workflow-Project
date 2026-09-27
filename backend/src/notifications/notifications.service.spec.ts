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
