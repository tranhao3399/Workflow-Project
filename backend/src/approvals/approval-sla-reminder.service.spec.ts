import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalSlaReminderService } from './approval-sla-reminder.service.js';

function createTaskQuery(tasks: unknown[]) {
  const exec = vi.fn().mockResolvedValue(tasks);
  const lean = vi.fn().mockReturnValue({ exec });
  const limit = vi.fn().mockReturnValue({ lean });
  const sort = vi.fn().mockReturnValue({ limit });
  return { sort, limit, lean, exec };
}

function createRequestQuery(requests: unknown[]) {
  const exec = vi.fn().mockResolvedValue(requests);
  const lean = vi.fn().mockReturnValue({ exec });
  const select = vi.fn().mockReturnValue({ lean });
  return { select, lean, exec };
}

describe('ApprovalSlaReminderService', () => {
  it('gửi thông báo quá hạn nhưng không thay đổi trạng thái công việc hoặc phiếu', async () => {
    const taskId = new Types.ObjectId();
    const requestId = new Types.ObjectId();
    const assigneeUserId = new Types.ObjectId();
    const dueAt = new Date(Date.now() - 60_000);
    const task = {
      _id: taskId,
      requestId,
      assigneeUserId,
      stepKey: 'MANAGER_APPROVAL',
      stepNameSnapshot: 'Quản lý trực tiếp phê duyệt',
      stepRunNo: 1,
      dueAt,
      status: 'PENDING',
    };
    const taskQuery = createTaskQuery([task]);
    const updateExec = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOne = vi.fn().mockReturnValue({ exec: updateExec });
    const requestQuery = createRequestQuery([{ _id: requestId, requestNo: 'REQ-001' }]);
    const createPersonal = vi.fn().mockResolvedValue({});
    const service = new ApprovalSlaReminderService(
      { find: vi.fn().mockReturnValue(taskQuery), updateOne } as never,
      { find: vi.fn().mockReturnValue(requestQuery) } as never,
      { createPersonal } as never,
    );

    await expect(service.notifyOverdueTasks()).resolves.toBe(1);

    expect(createPersonal).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserId: assigneeUserId,
      type: 'SLA',
      dedupeKey: `APPROVAL_TASK:${taskId.toString()}:SLA_OVERDUE`,
      data: expect.objectContaining({ requestId: requestId.toString(), requestNo: 'REQ-001' }),
    }));
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: taskId, status: 'PENDING' }),
      { $set: { slaReminderSentAt: expect.any(Date) } },
    );
    expect(updateOne.mock.calls[0][1]).not.toHaveProperty('$set.status');
  });

  it('giữ nguyên công việc để lần quét sau thử lại khi gửi thông báo thất bại', async () => {
    const taskId = new Types.ObjectId();
    const requestId = new Types.ObjectId();
    const taskQuery = createTaskQuery([{
      _id: taskId,
      requestId,
      assigneeUserId: new Types.ObjectId(),
      stepKey: 'APPROVAL',
      stepNameSnapshot: 'Phê duyệt',
      stepRunNo: 1,
      dueAt: new Date(Date.now() - 60_000),
      status: 'PENDING',
    }]);
    const updateOne = vi.fn();
    const requestQuery = createRequestQuery([{ _id: requestId, requestNo: 'REQ-002' }]);
    const service = new ApprovalSlaReminderService(
      { find: vi.fn().mockReturnValue(taskQuery), updateOne } as never,
      { find: vi.fn().mockReturnValue(requestQuery) } as never,
      { createPersonal: vi.fn().mockRejectedValue(new Error('Không gửi được thông báo')) } as never,
    );

    await expect(service.notifyOverdueTasks()).resolves.toBe(0);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
