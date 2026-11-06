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
