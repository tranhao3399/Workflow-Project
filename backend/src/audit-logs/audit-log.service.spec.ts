import { describe, expect, it, vi } from 'vitest';
import { AuditOutcome } from './enums/audit-outcome.enum.js';
import type { AuditChangeSet } from './schemas/audit-log.schema.js';
import { AuditLogService } from './audit-log.service.js';

type AuditSanitizer = {
  sanitizeChanges(changes?: AuditChangeSet): AuditChangeSet | undefined;
};

describe('AuditLogService employee change snapshots', () => {
  it('keeps every employee profile field needed to explain an update', () => {
    const service = new AuditLogService({} as never);
    const changes = (
      service as unknown as AuditSanitizer
    ).sanitizeChanges({
      before: {
        gender: 'MALE',
        citizenId: '079123456789',
        dateOfBirth: '1996-05-18T00:00:00.000Z',
        address: 'Địa chỉ cũ',
        annualLeaveDays: 12,
        workUnitId: '64b64b64b64b64b64b64b601',
      },
      after: {
        gender: 'FEMALE',
        citizenId: '079987654321',
        dateOfBirth: '1997-06-19T00:00:00.000Z',
        address: 'Địa chỉ mới',
        annualLeaveDays: 13,
        workUnitId: '64b64b64b64b64b64b64b602',
      },
    });

    expect(changes).toEqual({
      before: {
        gender: 'MALE',
        citizenId: '079123456789',
        dateOfBirth: '1996-05-18T00:00:00.000Z',
        address: 'Địa chỉ cũ',
        annualLeaveDays: 12,
        workUnitId: '64b64b64b64b64b64b64b601',
      },
      after: {
        gender: 'FEMALE',
        citizenId: '079987654321',
        dateOfBirth: '1997-06-19T00:00:00.000Z',
        address: 'Địa chỉ mới',
        annualLeaveDays: 13,
        workUnitId: '64b64b64b64b64b64b64b602',
      },
    });
  });
});

describe('AuditLogService catalog filters', () => {
  it('áp dụng tìm kiếm, kết quả và phân trang ở truy vấn backend', async () => {
    const dataExec = vi.fn().mockResolvedValue([]);
    const lean = vi.fn().mockReturnValue({ exec: dataExec });
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    const find = vi.fn().mockReturnValue({ sort });
    const countExec = vi.fn().mockResolvedValue(42);
    const countDocuments = vi.fn().mockReturnValue({ exec: countExec });
    const service = new AuditLogService({ find, countDocuments } as never);

    const result = await service.findAll({
      search: 'NV001',
      actorType: 'SYSTEM',
      module: 'WORKSPACE',
      actionGroup: 'UPDATE',
      outcome: AuditOutcome.FAILED,
      page: 2,
      limit: 10,
    });

    const filter = find.mock.calls[0][0] as Record<string, unknown>;
    expect(filter.outcome).toBe(AuditOutcome.FAILED);
    expect(filter['actor.userId']).toEqual({ $exists: false });
    expect(filter.$or).toHaveLength(8);
    expect(filter.$and).toEqual([
      { 'resource.type': { $in: ['WORKSPACE_MODULE'] } },
      { action: expect.any(RegExp) },
    ]);
    expect((filter.$and as Array<{ action?: RegExp }>)[1].action?.test('WORKSPACE_MODULE.UPDATED')).toBe(true);
    expect(skip).toHaveBeenCalledWith(10);
    expect(limit).toHaveBeenCalledWith(10);
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 42, totalPages: 5 });
  });

  it('từ chối khoảng ngày có Đến ngày nhỏ hơn Từ ngày', async () => {
    const service = new AuditLogService({} as never);

    await expect(service.findAll({
      startDate: '2026-11-12T00:00:00.000Z',
      endDate: '2026-11-11T23:59:59.999Z',
      page: 1,
      limit: 20,
    })).rejects.toThrow('Đến ngày phải lớn hơn hoặc bằng Từ ngày.');
  });

  it('trả danh sách người thực hiện duy nhất và hỗ trợ tìm theo danh tính', async () => {
    const actors = [{ id: '64b64b64b64b64b64b64b640', fullName: 'Trần Chí Hào', employeeCode: '123', email: 'hao@nexasport.local' }];
    const exec = vi.fn().mockResolvedValue(actors);
    const aggregate = vi.fn().mockReturnValue({ exec });
    const service = new AuditLogService({ aggregate } as never);

    const result = await service.findActorOptions({ search: 'Hào', limit: 30 });

    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect((pipeline[0].$match as { $or: unknown[] }).$or).toHaveLength(3);
    expect(pipeline[2]).toEqual(expect.objectContaining({
      $group: expect.objectContaining({ _id: '$actor.userId' }),
    }));
    expect(result).toEqual(actors);
  });
});

describe('AuditLogService refresh-token noise', () => {
  it('không ghi nhật ký cho endpoint làm mới access token', async () => {
    const create = vi.fn();
    const service = new AuditLogService({ create } as never);

    await service.recordForResolvedActor({
      method: 'POST',
      originalUrl: '/api/auth/refresh',
      headers: {},
    } as never, undefined, {
      action: 'USER.SESSION_REVOKED',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'USER_SESSION', id: '64b64b64b64b64b64b64b640' },
    });

    expect(create).not.toHaveBeenCalled();
  });
});
