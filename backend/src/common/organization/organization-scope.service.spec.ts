import { describe, expect, it, vi } from 'vitest';
import { OrganizationScopeService } from './organization-scope.service.js';

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

const ids = {
  hcmRegion: '64b64b64b64b64b64b64b601',
  hcmStore1: '64b64b64b64b64b64b64b602',
  hcmStore2: '64b64b64b64b64b64b64b603',
  hanoiRegion: '64b64b64b64b64b64b64b604',
  hanoiStore: '64b64b64b64b64b64b64b605',
  employee: '64b64b64b64b64b64b64b610',
  manager: '64b64b64b64b64b64b64b611',
};

function createService(options: {
  roleKey: string;
  employeeId?: string;
  homeDepartmentId?: string;
  homeWorkUnitId?: string;
  managedRootIds?: string[];
}) {
  const users = {
    findById: vi.fn().mockReturnValue(
      query({
        employeeId: options.employeeId,
        roleIds: ['64b64b64b64b64b64b64b620'],
      }),
    ),
  };
  const roles = {
    find: vi.fn().mockReturnValue(query([{ key: options.roleKey }])),
  };
  const employees = {
    findById: vi.fn().mockImplementation((employeeId: string) =>
      query(
        employeeId
          ? {
              _id: employeeId,
              departmentId: options.homeDepartmentId ?? ids.hcmStore1,
              ...(options.homeWorkUnitId
                ? { workUnitId: options.homeWorkUnitId }
                : {}),
            }
          : null,
      ),
    ),
  };
  const children = new Map<string, string[]>([
    [ids.hcmRegion, [ids.hcmStore1, ids.hcmStore2]],
    [ids.hanoiRegion, [ids.hanoiStore]],
  ]);
  const allDepartmentIds = Object.values(ids).filter((id) =>
    id.startsWith('64b64b64b64b64b64b64b60'),
  );
  const departments = {
    find: vi.fn().mockImplementation((filter?: Record<string, unknown>) => {
      if (!filter || Object.keys(filter).length === 0)
        return query(allDepartmentIds.map((_id) => ({ _id })));
      if ('managerEmployeeId' in filter)
        return query((options.managedRootIds ?? []).map((_id) => ({ _id })));
      const parentFilter = filter.parentId as { $in?: string[] } | undefined;
      const childIds = (parentFilter?.$in ?? []).flatMap(
        (parentId) => children.get(parentId) ?? [],
      );
      return query(childIds.map((_id) => ({ _id })));
    }),
  };
  return new OrganizationScopeService(
    users as never,
    roles as never,
    employees as never,
    departments as never,
  );
}

describe('OrganizationScopeService', () => {
  it('given a store manager, when scope is resolved, then only the managed store subtree is returned', async () => {
    const service = createService({
      roleKey: 'MANAGER',
      employeeId: ids.manager,
      managedRootIds: [ids.hcmStore1],
    });

    const scope = await service.resolve('64b64b64b64b64b64b64b630');

    expect(scope.fullAccess).toBe(false);
    expect(scope.departmentIds).toEqual([ids.hcmStore1]);
    await expect(
      service.canAccessDepartment('64b64b64b64b64b64b64b630', ids.hanoiStore),
    ).resolves.toBe(false);
  });

  it('given the Ho Chi Minh region manager, when scope is resolved, then all Ho Chi Minh stores are included and Hanoi is excluded', async () => {
    const service = createService({
      roleKey: 'MANAGER',
      employeeId: ids.manager,
      managedRootIds: [ids.hcmRegion],
    });

    const scope = await service.resolve('64b64b64b64b64b64b64b631');

    expect(scope.departmentIds).toEqual(
      expect.arrayContaining([ids.hcmRegion, ids.hcmStore1, ids.hcmStore2]),
    );
    expect(scope.departmentIds).not.toContain(ids.hanoiRegion);
    expect(scope.departmentIds).not.toContain(ids.hanoiStore);
  });

  it('given a manager with a separate functional department, when employee scope is built, then work-unit descendants determine visibility', async () => {
    const service = createService({
      roleKey: 'MANAGER',
      employeeId: ids.manager,
      homeDepartmentId: '64b64b64b64b64b64b64b699',
      homeWorkUnitId: ids.hcmRegion,
      managedRootIds: [ids.hcmRegion],
    });

    await expect(
      service.employeeFilter('64b64b64b64b64b64b64b631'),
    ).resolves.toEqual({
      $or: [
        { workUnitId: { $in: [ids.hcmRegion, ids.hcmStore1, ids.hcmStore2] } },
        {
          workUnitId: { $exists: false },
          departmentId: { $in: [ids.hcmRegion, ids.hcmStore1, ids.hcmStore2] },
        },
      ],
    });
  });

  it('given an employee who manages no unit, when employee scope is requested, then only that employee is returned', async () => {
    const service = createService({
      roleKey: 'EMPLOYEE',
      employeeId: ids.employee,
      managedRootIds: [],
    });

    await expect(
      service.employeeFilter('64b64b64b64b64b64b64b632'),
    ).resolves.toEqual({ _id: ids.employee });
  });

  it('given a CEO role, when scope is resolved, then every organization unit is available without granting operation permissions', async () => {
    const service = createService({ roleKey: 'CEO', employeeId: ids.manager });

    const scope = await service.resolve('64b64b64b64b64b64b64b633');

    expect(scope.fullAccess).toBe(true);
    expect(scope.departmentIds).toEqual(
      expect.arrayContaining([ids.hcmRegion, ids.hanoiRegion]),
    );
  });
});
