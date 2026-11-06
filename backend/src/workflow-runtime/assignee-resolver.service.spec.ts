import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationUnitType } from '../departments/enums/organization-unit-type.enum.js';
import { AssigneeResolverService } from './assignee-resolver.service.js';
import type { RuntimeAssigneeRule } from './workflow-runtime.types.js';

function query<T>(value: T) {
  const chain = {
    select: vi.fn(),
    session: vi.fn(),
    exec: vi.fn().mockResolvedValue(value),
  };
  chain.select.mockReturnValue(chain);
  chain.session.mockReturnValue(chain);
  return chain;
}

type RuleResolver = {
  resolveRuleUsers(
    request: unknown,
    rule: RuntimeAssigneeRule,
    session: unknown,
  ): Promise<Array<{ _id: Types.ObjectId }>>;
};

describe('AssigneeResolverService organization hierarchy rules', () => {
  it('given a requester in a store, when the parent-manager rule is resolved, then the region manager account is selected', async () => {
    const storeId = new Types.ObjectId();
    const functionalDepartmentId = new Types.ObjectId();
    const regionId = new Types.ObjectId();
    const managerEmployeeId = new Types.ObjectId();
    const managerUser = {
      _id: new Types.ObjectId(),
      employeeId: managerEmployeeId,
      isActive: true,
    };
    const departments = {
      findOne: vi
        .fn()
        .mockImplementation((filter: { _id: Types.ObjectId }) =>
          query(
            filter._id.equals(storeId)
              ? { _id: storeId, parentId: regionId }
              : {
                  _id: regionId,
                  managerEmployeeId,
                  unitType: OrganizationUnitType.REGION,
                },
          ),
        ),
    };
    const employees = {
      find: vi
        .fn()
        .mockReturnValue(query([{ _id: managerEmployeeId, isActive: true }])),
    };
    const users = { find: vi.fn().mockReturnValue(query([managerUser])) };
    const service = new AssigneeResolverService(
      users as never,
      employees as never,
      {} as never,
      departments as never,
      {} as never,
    );

    const resolved = await (
      service as unknown as RuleResolver
    ).resolveRuleUsers(
      {
        requesterSnapshot: {
          departmentId: functionalDepartmentId,
          workUnitId: storeId,
        },
      },
      { type: 'REQUESTER_PARENT_DEPARTMENT_MANAGER', includeInactive: false },
      {},
    );

    expect(resolved).toEqual([managerUser]);
  });

  it('given a requester below a region, when the company-manager rule is resolved, then the company manager account is selected', async () => {
    const storeId = new Types.ObjectId();
    const functionalDepartmentId = new Types.ObjectId();
    const regionId = new Types.ObjectId();
    const companyId = new Types.ObjectId();
    const directorEmployeeId = new Types.ObjectId();
    const directorUser = {
      _id: new Types.ObjectId(),
      employeeId: directorEmployeeId,
      isActive: true,
    };
    const departments = {
      findOne: vi.fn().mockImplementation((filter: { _id: Types.ObjectId }) => {
        if (filter._id.equals(storeId))
          return query({
            _id: storeId,
            parentId: regionId,
            unitType: OrganizationUnitType.STORE,
          });
        if (filter._id.equals(regionId))
          return query({
            _id: regionId,
            parentId: companyId,
            unitType: OrganizationUnitType.REGION,
          });
        return query({
          _id: companyId,
          managerEmployeeId: directorEmployeeId,
          unitType: OrganizationUnitType.COMPANY,
        });
      }),
    };
    const employees = {
      find: vi
        .fn()
        .mockReturnValue(query([{ _id: directorEmployeeId, isActive: true }])),
    };
    const users = { find: vi.fn().mockReturnValue(query([directorUser])) };
    const service = new AssigneeResolverService(
      users as never,
      employees as never,
      {} as never,
      departments as never,
      {} as never,
    );

    const resolved = await (
      service as unknown as RuleResolver
    ).resolveRuleUsers(
      {
        requesterSnapshot: {
          departmentId: functionalDepartmentId,
          workUnitId: storeId,
        },
      },
      { type: 'COMPANY_MANAGER', includeInactive: false },
      {},
    );

    expect(resolved).toEqual([directorUser]);
  });
});
