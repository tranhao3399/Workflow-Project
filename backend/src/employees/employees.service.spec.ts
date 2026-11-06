import { describe, expect, it, vi } from 'vitest';
import { EmployeesService } from './employees.service.js';

function query<T>(value: T) {
  const chain = {
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(value),
  };
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

type DescendantResolver = {
  descendantUnitIds(rootId: string): Promise<string[]>;
};

describe('EmployeesService organization-unit filtering', () => {
  it('given a region with stores, when descendant unit identifiers are resolved, then the region and every nested store are included once', async () => {
    const descendants = new Map<string, string[]>([
      ['region', ['store-1', 'store-2']],
      ['store-1', ['counter-1']],
      ['store-2', []],
      ['counter-1', []],
    ]);
    const departments = {
      findById: vi.fn().mockReturnValue(query({ _id: 'region' })),
      find: vi
        .fn()
        .mockImplementation((filter: { parentId: { $in: string[] } }) =>
          query(
            filter.parentId.$in
              .flatMap((id) => descendants.get(id) ?? [])
              .map((_id) => ({ _id })),
          ),
        ),
    };
    const service = new EmployeesService(
      {} as never,
      departments as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await (
      service as unknown as DescendantResolver
    ).descendantUnitIds('region');

    expect(result).toEqual(['region', 'store-1', 'store-2', 'counter-1']);
  });
});
