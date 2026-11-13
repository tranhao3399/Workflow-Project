import { describe, expect, it, vi } from 'vitest';
import { EmployeeCodeService } from './employee-code.service.js';

function query<T>(value: T) {
  const chain = {
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(value),
  };
  chain.lean.mockReturnValue(chain);
  return chain;
}

describe('EmployeeCodeService', () => {
  it('given an initialized sequence, when the next code is previewed, then no number is consumed', async () => {
    const sequences = {
      findOne: vi.fn().mockReturnValue(query({ sequence: 41 })),
      findOneAndUpdate: vi.fn(),
    };
    const employees = { aggregate: vi.fn() };
    const service = new EmployeeCodeService(
      sequences as never,
      employees as never,
    );

    await expect(service.previewNext()).resolves.toBe('NV-042');
    expect(sequences.findOneAndUpdate).not.toHaveBeenCalled();
    expect(employees.aggregate).not.toHaveBeenCalled();
  });

  it('given an initialized sequence, when a code is allocated, then MongoDB atomically increments and returns it', async () => {
    const sequences = {
      findOne: vi.fn().mockReturnValue(query({ sequence: 41 })),
      findOneAndUpdate: vi.fn().mockReturnValue(query({ sequence: 42 })),
    };
    const service = new EmployeeCodeService(
      sequences as never,
      { aggregate: vi.fn() } as never,
    );

    await expect(service.allocateNext()).resolves.toBe('NV-042');
    expect(sequences.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'EMPLOYEE' },
      { $inc: { sequence: 1 } },
      { returnDocument: 'after' },
    );
  });

  it('given legacy employee codes and no sequence, when allocation starts, then the counter is seeded from the largest code', async () => {
    const sequences = {
      findOne: vi.fn().mockReturnValue(query(null)),
      findOneAndUpdate: vi
        .fn()
        .mockReturnValueOnce(query({ sequence: 105 }))
        .mockReturnValueOnce(query({ sequence: 106 })),
    };
    const employees = {
      aggregate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([{ sequence: 105 }]),
      }),
    };
    const service = new EmployeeCodeService(
      sequences as never,
      employees as never,
    );

    await expect(service.allocateNext()).resolves.toBe('NV-106');
    expect(employees.aggregate).toHaveBeenCalledOnce();
  });
});
