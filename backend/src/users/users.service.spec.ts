import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';

describe('UsersService login failure tracking', () => {
  it('enables Mongoose update pipeline when atomically recording a failed login', async () => {
    const updatedUser = { id: '64b64b64b64b64b64b64b640', failedLoginCount: 1 };
    const exec = vi.fn().mockResolvedValue(updatedUser);
    const findByIdAndUpdate = vi.fn().mockReturnValue({ exec });
    const service = new UsersService(
      { findByIdAndUpdate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const now = new Date('2026-10-28T03:00:00.000Z');
    const windowStart = new Date('2026-10-28T02:45:00.000Z');
    const lockedUntil = new Date('2026-10-28T03:10:00.000Z');

    const result = await service.recordLoginFailure(
      updatedUser.id,
      now,
      windowStart,
      lockedUntil,
    );

    expect(result).toBe(updatedUser);
    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      updatedUser.id,
      expect.any(Array),
      { returnDocument: 'after', updatePipeline: true },
    );
    expect(exec).toHaveBeenCalledOnce();
  });
});

describe('UsersService server-side pagination', () => {
  it('áp dụng sắp xếp theo mã nhân viên trước khi phân trang tại MongoDB', async () => {
    const aggregateExec = vi.fn().mockResolvedValue([]);
    const aggregate = vi.fn().mockReturnValue({ exec: aggregateExec });
    const countExec = vi.fn().mockResolvedValue(125);
    const countDocuments = vi.fn().mockReturnValue({ exec: countExec });
    const service = new UsersService(
      { aggregate, countDocuments } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.findAllSafe({
      page: 3,
      limit: 20,
      sortBy: 'employeeCode',
      sortOrder: 'asc',
    });

    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(pipeline).toContainEqual({ $sort: { 'employeeProfile.employeeCode': 1, _id: 1 } });
    expect(pipeline).toContainEqual({ $skip: 40 });
    expect(pipeline).toContainEqual({ $limit: 20 });
    expect(result.pagination).toEqual({ page: 3, limit: 20, total: 125, totalPages: 7 });
  });
});
