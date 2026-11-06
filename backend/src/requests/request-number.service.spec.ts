import { describe, expect, it, vi } from 'vitest';
import type { ClientSession } from 'mongoose';
import { formatRequestNumber, RequestNumberService } from './request-number.service.js';

describe('RequestNumberService', () => {
  it('given requests from the same form, when formatting allocated sequences, then the prefix stays the same and only the numeric suffix changes', () => {
    expect(formatRequestNumber('purchase_request', 1)).toBe('PURCHASE_REQUEST-000001');
    expect(formatRequestNumber('purchase_request', 25)).toBe('PURCHASE_REQUEST-000025');
  });

  it('given a form code and an active transaction, when allocating a request number, then the counter is incremented atomically in that session', async () => {
    const session = {} as ClientSession;
    const exec = vi.fn().mockResolvedValue({ formCode: 'LEAVE_REQUEST', sequence: 7 });
    const lean = vi.fn().mockReturnValue({ exec });
    const findOneAndUpdate = vi.fn().mockReturnValue({ lean });
    const service = new RequestNumberService({ findOneAndUpdate } as never);

    await expect(service.next('leave_request', session)).resolves.toBe('LEAVE_REQUEST-000007');
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { formCode: 'LEAVE_REQUEST' },
      {
        $inc: { sequence: 1 },
        $setOnInsert: { formCode: 'LEAVE_REQUEST' },
      },
      expect.objectContaining({ new: true, upsert: true, session }),
    );
  });
});
