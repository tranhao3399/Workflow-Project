import { Types, type ClientSession } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { RequestActorContextService } from './request-actor-context.service.js';

function chainable<T>(value: T) {
  return {
    select: vi.fn().mockReturnThis(),
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(value),
  };
}

describe('RequestActorContextService leave balance and direct manager resolution', () => {
  it('given an employee with manager and active pending leave holds, when context is resolved, then directManagerName and availableAnnualLeaveDays reflect held days excluding excludeRequestId', async () => {
    const userId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const departmentId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const currentRequestId = new Types.ObjectId();

    const users = {
      findOne: vi.fn().mockReturnValue(chainable({
        _id: userId,
        email: 'anh@nexasport.vn',
        employeeId,
      })),
    };
    const employees = {
      findOne: vi.fn().mockReturnValue(chainable({
        _id: employeeId,
        employeeCode: 'NV0010',
        fullName: 'Nguyễn Minh Anh',
        workEmail: 'anh@nexasport.vn',
        departmentId,
        positionId,
        managerId,
        annualLeaveDays: 12,
      })),
      findById: vi.fn().mockReturnValue(chainable({
        _id: managerId,
        fullName: 'Lê Hoàng Nam',
      })),
    };
    const departments = {
      findById: vi.fn().mockReturnValue(chainable({ _id: departmentId, name: 'Kỹ thuật' })),
    };
    const positions = {
      findById: vi.fn().mockReturnValue(chainable({ _id: positionId, name: 'Chuyên viên' })),
    };
    const requests = {
      find: vi.fn().mockReturnValue(chainable([
        {
          formData: { so_ngay_nghi: 2.5 },
          formSnapshot: { settings: { leaveDeduction: { enabled: true, fieldKey: 'so_ngay_nghi' } } },
        },
        {
          formData: { so_ngay_nghi: 1 },
          formSnapshot: { settings: { leaveDeduction: { enabled: true, fieldKey: 'so_ngay_nghi' } } },
        },
      ])),
    };

    const service = new RequestActorContextService(
      users as never,
      employees as never,
      departments as never,
      positions as never,
      requests as never,
    );

    const session = {} as ClientSession;
    const context = await service.resolve(userId.toString(), session, {
      excludeRequestId: currentRequestId,
    });

    expect(requests.find).toHaveBeenCalledWith(expect.objectContaining({
      requesterEmployeeId: employeeId,
      status: { $in: ['IN_PROGRESS', 'REVISION_REQUESTED'] },
      _id: { $ne: currentRequestId },
    }));
    expect(context.autoFillProfile.directManagerName).toBe('Lê Hoàng Nam');
    expect(context.autoFillProfile.annualLeaveDays).toBe(12);
    expect(context.autoFillProfile.pendingHeldLeaveDays).toBe(3.5);
    expect(context.autoFillProfile.availableAnnualLeaveDays).toBe(8.5);
  });
});
