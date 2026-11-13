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
  it('given a requester in a store, when the parent-work-unit-manager rule is resolved, then the region manager account is selected', async () => {
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
      { type: 'REQUESTER_PARENT_WORK_UNIT_MANAGER', includeInactive: false },
      {},
    );

    expect(resolved).toEqual([managerUser]);
  });

  it('given a requester assigned to a store and a functional department, when the work-unit-manager rule is resolved, then the store manager account is selected', async () => {
    const storeId = new Types.ObjectId();
    const functionalDepartmentId = new Types.ObjectId();
    const storeManagerEmployeeId = new Types.ObjectId();
    const storeManagerUser = {
      _id: new Types.ObjectId(),
      employeeId: storeManagerEmployeeId,
      isActive: true,
    };
    const departments = {
      findOne: vi.fn().mockReturnValue(
        query({ _id: storeId, managerEmployeeId: storeManagerEmployeeId }),
      ),
    };
    const employees = {
      find: vi.fn().mockReturnValue(
        query([{ _id: storeManagerEmployeeId, isActive: true }]),
      ),
    };
    const users = { find: vi.fn().mockReturnValue(query([storeManagerUser])) };
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
      { type: 'REQUESTER_WORK_UNIT_MANAGER', includeInactive: false },
      {},
    );

    expect(resolved).toEqual([storeManagerUser]);
    expect(departments.findOne).toHaveBeenCalledWith({
      _id: storeId,
      isActive: true,
    });
  });

  it('given a requester assigned to a store and a functional department, when the functional-department-manager rule is resolved, then the department manager account is selected', async () => {
    const storeId = new Types.ObjectId();
    const functionalDepartmentId = new Types.ObjectId();
    const departmentManagerEmployeeId = new Types.ObjectId();
    const departmentManagerUser = {
      _id: new Types.ObjectId(),
      employeeId: departmentManagerEmployeeId,
      isActive: true,
    };
    const departments = {
      findOne: vi.fn().mockReturnValue(
        query({
          _id: functionalDepartmentId,
          managerEmployeeId: departmentManagerEmployeeId,
        }),
      ),
    };
    const employees = {
      find: vi.fn().mockReturnValue(
        query([{ _id: departmentManagerEmployeeId, isActive: true }]),
      ),
    };
    const users = {
      find: vi.fn().mockReturnValue(query([departmentManagerUser])),
    };
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
      {
        type: 'REQUESTER_FUNCTIONAL_DEPARTMENT_MANAGER',
        includeInactive: false,
      },
      {},
    );

    expect(resolved).toEqual([departmentManagerUser]);
    expect(departments.findOne).toHaveBeenCalledWith({
      _id: functionalDepartmentId,
      isActive: true,
    });
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

  it('given a requester without a functional department, when the functional-department-manager rule is resolved, then a specific business error is returned', async () => {
    const service = new AssigneeResolverService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      (service as unknown as RuleResolver).resolveRuleUsers(
        { requesterSnapshot: {} },
        {
          type: 'REQUESTER_FUNCTIONAL_DEPARTMENT_MANAGER',
          includeInactive: false,
        },
        {},
      ),
    ).rejects.toMatchObject({
      response: { code: 'REQUESTER_DEPARTMENT_REQUIRED' },
    });
  });

  it('given a cyclic organization hierarchy, when the company manager is resolved, then traversal stops and rejects corrupted data', async () => {
    const firstId = new Types.ObjectId();
    const secondId = new Types.ObjectId();
    const departments = {
      findOne: vi.fn().mockImplementation((filter: { _id: Types.ObjectId }) =>
        query({
          _id: filter._id,
          parentId: filter._id.equals(firstId) ? secondId : firstId,
          unitType: OrganizationUnitType.DEPARTMENT,
        }),
      ),
    };
    const service = new AssigneeResolverService(
      {} as never,
      {} as never,
      {} as never,
      departments as never,
      {} as never,
    );

    await expect(
      (service as unknown as RuleResolver).resolveRuleUsers(
        { requesterSnapshot: { departmentId: firstId } },
        { type: 'COMPANY_MANAGER', includeInactive: false },
        {},
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_ORGANIZATION_HIERARCHY' },
    });
    expect(departments.findOne).toHaveBeenCalledTimes(2);
  });
});
