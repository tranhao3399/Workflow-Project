import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationUnitType } from './enums/organization-unit-type.enum.js';
import { DepartmentsService } from './departments.service.js';

function query<T>(value: T) {
  const chain = {
    select: vi.fn(),
    sort: vi.fn(),
    populate: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn().mockResolvedValue(value),
  };
  chain.select.mockReturnValue(chain);
  chain.sort.mockReturnValue(chain);
  chain.populate.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

function createService() {
  const departments = {
    findById: vi.fn(),
    countDocuments: vi.fn(),
    find: vi.fn(),
  };
  const employees = {
    find: vi.fn(),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn().mockReturnValue(query([])),
  };
  const departmentPositions = { find: vi.fn() };
  const organizationScope = {
    resolve: vi.fn().mockResolvedValue({
      fullAccess: true,
      managedRootDepartmentIds: [],
      departmentIds: [],
    }),
  };
  const service = new DepartmentsService(
    departments as never,
    employees as never,
    {} as never,
    departmentPositions as never,
    {} as never,
    organizationScope as never,
  );
  return {
    service,
    departments,
    employees,
    departmentPositions,
    organizationScope,
  };
}

type RelationValidator = {
  ensureRelations(
    currentId: string | undefined,
    unitType: OrganizationUnitType,
    parentId?: string,
    managerId?: string,
  ): Promise<void>;
  toOrganizationUnit(item: Record<string, unknown>): Record<string, unknown>;
};

describe('DepartmentsService organization hierarchy', () => {
  it('given a department outside the actor scope, when its detail URL is requested, then the record is hidden as not found', async () => {
    const { service, departments, organizationScope } = createService();
    organizationScope.resolve.mockResolvedValue({
      fullAccess: false,
      managedRootDepartmentIds: ['allowed-department'],
      departmentIds: ['allowed-department'],
    });

    await expect(
      service.findOne('scoped-user', 'blocked-department'),
    ).rejects.toThrow('Không tìm thấy phòng ban.');
    expect(departments.findById).not.toHaveBeenCalled();
  });

  it('given a scoped manager, when the catalog loads, then only allowed department identifiers are queried', async () => {
    const { service, departments, organizationScope } = createService();
    organizationScope.resolve.mockResolvedValue({
      fullAccess: false,
      managedRootDepartmentIds: ['region-hcm'],
      departmentIds: ['region-hcm', 'store-hcm-01'],
    });
    departments.find.mockReturnValue(query([]));

    await service.findCatalog('scoped-user', {});

    expect(departments.find).toHaveBeenCalledWith({
      $and: [{}, { _id: { $in: ['region-hcm', 'store-hcm-01'] } }],
    });
  });

  it('given an allowed department whose parent is outside scope, when detail loads, then parent information is not exposed', async () => {
    const { service, departments, organizationScope } = createService();
    organizationScope.resolve.mockResolvedValue({
      fullAccess: false,
      managedRootDepartmentIds: ['region-hcm'],
      departmentIds: ['region-hcm'],
    });
    departments.findById.mockReturnValue(query({
      _id: 'region-hcm',
      code: 'REGION_HCM',
      name: 'Khu vực TP.HCM',
      parentId: { _id: 'company', code: 'NEXASPORT', name: 'NexaSport' },
    }));

    const result = await service.findOne('scoped-user', 'region-hcm');

    expect(result.parentId).toBeUndefined();
    expect(result.parentName).toBeUndefined();
  });

  it.each([
    { positionNames: [], count: 0 },
    { positionNames: ['Accountant'], count: 1 },
    { positionNames: ['Accountant', 'Analyst', 'Manager'], count: 3 },
  ])(
    'given $count assigned job titles, when the organization catalog loads, then that unit returns the real assigned titles and count',
    async ({ positionNames, count }) => {
      const { service, departments, departmentPositions } = createService();
      const unit = {
        _id: 'unit-1',
        code: 'FINANCE',
        name: 'Kế toán',
        unitType: OrganizationUnitType.FUNCTIONAL,
        isActive: true,
      };
      departments.find.mockReturnValue(query([unit]));
      departmentPositions.find.mockReturnValue(
        query(
          positionNames.map((name, index) => ({
            departmentId: 'unit-1',
            positionId: {
              _id: `position-${index}`,
              code: `POSITION_${index}`,
              name,
              isActive: true,
            },
          })),
        ),
      );

      const result = (await service.findCatalog('admin', {
        active: true,
      } as never)) as Array<{
        positionCount: number;
        positions: Array<{ name: string }>;
      }>;

      expect(result[0].positionCount).toBe(count);
      expect(result[0].positions.map((position) => position.name)).toEqual(
        positionNames,
      );
      expect(departmentPositions.find).toHaveBeenCalledTimes(1);
      expect(departmentPositions.find).toHaveBeenCalledWith({
        departmentId: { $in: ['unit-1'] },
      });
    },
  );

  it('given an assignment is added or removed, when the organization catalog is requested again, then the updated linked titles are returned', async () => {
    const { service, departments, departmentPositions } = createService();
    departments.find.mockReturnValue(
      query([
        {
          _id: 'unit-1',
          code: 'FINANCE',
          name: 'Kế toán',
          unitType: OrganizationUnitType.FUNCTIONAL,
          isActive: true,
        },
      ]),
    );
    let currentAssignments: Array<Record<string, unknown>> = [];
    departmentPositions.find.mockImplementation(() =>
      query(currentAssignments),
    );

    const withoutTitles = (await service.findCatalog('admin', {
      active: true,
    } as never)) as Array<{
      positionCount: number;
      positions: Array<{ name: string }>;
    }>;
    currentAssignments = [
      {
        departmentId: 'unit-1',
        positionId: {
          _id: 'position-1',
          code: 'ACCOUNTANT',
          name: 'Kế toán viên',
          isActive: true,
        },
      },
    ];
    const afterAssign = (await service.findCatalog('admin', {
      active: true,
    } as never)) as typeof withoutTitles;
    currentAssignments = [];
    const afterRemove = (await service.findCatalog('admin', {
      active: true,
    } as never)) as typeof withoutTitles;

    expect(withoutTitles[0].positionCount).toBe(0);
    expect(afterAssign[0].positions.map((position) => position.name)).toEqual([
      'Kế toán viên',
    ]);
    expect(afterRemove[0].positionCount).toBe(0);
    expect(departmentPositions.find).toHaveBeenCalledTimes(3);
  });

  it('given active employees assigned to work units and functional departments, when the catalog loads, then each unit uses the matching employee relation', async () => {
    const { service, departments, employees, departmentPositions } =
      createService();
    departments.find.mockReturnValue(
      query([
        {
          _id: 'unit-1',
          code: 'STORE_1',
          name: 'Cửa hàng 1',
          unitType: OrganizationUnitType.STORE,
          isActive: true,
        },
        {
          _id: 'unit-2',
          code: 'ACCOUNTING',
          name: 'Kế toán',
          unitType: OrganizationUnitType.DEPARTMENT,
          isActive: true,
        },
      ]),
    );
    departmentPositions.find.mockReturnValue(query([]));
    employees.aggregate
      .mockReturnValueOnce(query([{ _id: 'unit-1', count: 7 }]))
      .mockReturnValueOnce(query([{ _id: 'unit-2', count: 4 }]));

    const result = (await service.findCatalog('admin', {
      active: true,
    } as never)) as Array<{ employeeCount: number }>;

    expect(result.map((unit) => unit.employeeCount)).toEqual([7, 4]);
    expect(employees.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          workUnitId: { $in: ['unit-1', 'unit-2'] },
          isActive: { $ne: false },
        },
      },
      { $group: { _id: '$workUnitId', count: { $sum: 1 } } },
    ]);
    expect(employees.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          departmentId: { $in: ['unit-1', 'unit-2'] },
          isActive: { $ne: false },
        },
      },
      { $group: { _id: '$departmentId', count: { $sum: 1 } } },
    ]);
  });

  it('given a store, when its parent is a company instead of a region, then the hierarchy is rejected', async () => {
    const { service, departments } = createService();
    departments.findById.mockReturnValue(
      query({ _id: 'company', unitType: OrganizationUnitType.COMPANY }),
    );

    await expect(
      (service as unknown as RelationValidator).ensureRelations(
        undefined,
        OrganizationUnitType.STORE,
        'company',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('given a headquarters unit without a company parent, when relations are validated, then the missing parent is rejected', async () => {
    const { service } = createService();

    await expect(
      (service as unknown as RelationValidator).ensureRelations(
        undefined,
        OrganizationUnitType.HEADQUARTERS,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('given a department under a store, when relations are validated, then the invalid parent type is rejected', async () => {
    const { service, departments } = createService();
    departments.findById.mockReturnValue(
      query({ _id: 'store', unitType: OrganizationUnitType.STORE }),
    );

    await expect(
      (service as unknown as RelationValidator).ensureRelations(
        undefined,
        OrganizationUnitType.DEPARTMENT,
        'store',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('given a company parent, when creating a department directly under the company, then the hierarchy is accepted', async () => {
    const { service, departments } = createService();
    departments.findById.mockReturnValue(
      query({ _id: 'company', unitType: OrganizationUnitType.COMPANY }),
    );

    await expect(
      (service as unknown as RelationValidator).ensureRelations(
        undefined,
        OrganizationUnitType.DEPARTMENT,
        'company',
      ),
    ).resolves.toBeUndefined();
  });

  it('given a department under a company, when relations are validated, then the hierarchy is accepted', async () => {
    const { service, departments } = createService();
    departments.findById.mockReturnValue(
      query({ _id: 'company', unitType: OrganizationUnitType.COMPANY }),
    );

    await expect(
      (service as unknown as RelationValidator).ensureRelations(
        undefined,
        OrganizationUnitType.DEPARTMENT,
        'company',
      ),
    ).resolves.toBeUndefined();
  });

  it('given a region with store children, when its type changes to department, then the change is rejected before writing', async () => {
    const { service, departments } = createService();
    departments.findById.mockImplementation((id: string) =>
      query(
        id === 'region'
          ? {
              _id: 'region',
              id: 'region',
              code: 'HCM',
              name: 'TP.HCM',
              unitType: OrganizationUnitType.REGION,
              parentId: 'hq',
              isActive: true,
            }
          : { _id: id, unitType: OrganizationUnitType.HEADQUARTERS },
      ),
    );
    departments.find.mockReturnValue(
      query([{ unitType: OrganizationUnitType.STORE }]),
    );

    await expect(
      service.update({ user: { id: 'admin' } } as never, 'region', {
        unitType: OrganizationUnitType.DEPARTMENT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('given an existing hierarchy, when a unit is moved below its own descendant, then a cycle is rejected', async () => {
    const { service, departments } = createService();
    departments.findById.mockImplementation((id: string) =>
      query(
        id === 'descendant'
          ? {
              _id: id,
              unitType: OrganizationUnitType.FUNCTIONAL,
              parentId: 'current',
            }
          : { _id: id },
      ),
    );

    await expect(
      (service as unknown as RelationValidator).ensureRelations(
        'current',
        OrganizationUnitType.FUNCTIONAL,
        'descendant',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('given a pre-existing parent cycle, when a new department selects that hierarchy, then validation stops and rejects the cycle', async () => {
    const { service, departments } = createService();
    departments.findById.mockImplementation((id: string) =>
      query({
        _id: id,
        unitType: OrganizationUnitType.FUNCTIONAL,
        parentId: id === 'department-a' ? 'department-b' : 'department-a',
      }),
    );

    await expect(
      (service as unknown as RelationValidator).ensureRelations(
        undefined,
        OrganizationUnitType.FUNCTIONAL,
        'department-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(departments.findById).toHaveBeenCalledTimes(3);
  });

  it('given a legacy department without a type, when it is returned, then it remains available as unclassified', () => {
    const { service } = createService();

    const result = (service as unknown as RelationValidator).toOrganizationUnit(
      { _id: 'legacy', code: 'OLD', name: 'Legacy' },
    );

    expect(result.unitType).toBe(OrganizationUnitType.UNCLASSIFIED);
  });

  it('given a unit with active children, when an admin deactivates it, then the operation is rejected without changing data', async () => {
    const { service, departments, employees } = createService();
    departments.findById.mockReturnValue(
      query({ _id: 'region', id: 'region', isActive: true }),
    );
    departments.countDocuments.mockReturnValue(query(1));
    employees.countDocuments.mockReturnValue(query(0));

    await expect(
      service.update({ user: { id: 'admin' } } as never, 'region', {
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('given active employees with both functional department and work unit, when manager options are loaded, then both unit relations are returned', async () => {
    const { service, employees } = createService();
    employees.find.mockReturnValue(
      query([
        {
          _id: 'emp-1',
          employeeCode: 'NV001',
          fullName: 'Nguyễn Văn A',
          departmentId: 'dept-sales',
          workUnitId: 'region-hcm',
        },
        {
          _id: 'emp-2',
          employeeCode: 'NV002',
          fullName: 'Trần Thị B',
          departmentId: 'dept-finance',
        },
      ]),
    );

    const options = await service.findManagerOptions();

    expect(options).toEqual([
      {
        id: 'emp-1',
        employeeCode: 'NV001',
        fullName: 'Nguyễn Văn A',
        departmentId: 'dept-sales',
        workUnitId: 'region-hcm',
      },
      {
        id: 'emp-2',
        employeeCode: 'NV002',
        fullName: 'Trần Thị B',
        departmentId: 'dept-finance',
      },
    ]);
  });

  it('given an active employee from another department, when assigned to manage the finance department, then relations are accepted', async () => {
    const { service, departments, employees } = createService();
    departments.findById.mockReturnValue(
      query({ _id: 'company', unitType: OrganizationUnitType.COMPANY }),
    );
    employees.findOne.mockReturnValue(
      query({
        _id: 'emp-cross-department-manager',
        departmentId: 'dept-sales',
        workUnitId: 'region-hcm',
      }),
    );

    await expect(
      (service as unknown as RelationValidator).ensureRelations(
        'dept-finance',
        OrganizationUnitType.DEPARTMENT,
        'company',
        'emp-cross-department-manager',
      ),
    ).resolves.toBeUndefined();
  });

  it('given updated positionIds, when department is updated, then removed and added positions are synchronized on save', async () => {
    const departmentDoc = {
      _id: 'dept-finance',
      id: 'dept-finance',
      code: 'FINANCE',
      name: 'Phòng Tài chính',
      unitType: OrganizationUnitType.DEPARTMENT,
      parentId: 'company',
      isActive: true,
      sortOrder: 1,
      toObject: () => ({
        _id: 'dept-finance',
        code: 'FINANCE',
        name: 'Phòng Tài chính',
        unitType: OrganizationUnitType.DEPARTMENT,
        parentId: 'company',
        isActive: true,
        sortOrder: 1,
      }),
    };
    const departments = {
      findById: vi.fn().mockImplementation((id: string) =>
        query(id === 'company' ? { _id: 'company', unitType: OrganizationUnitType.COMPANY } : departmentDoc),
      ),
      findByIdAndUpdate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(departmentDoc),
      }),
    };
    const employees = { findOne: vi.fn() };
    const positions = {
      find: vi
        .fn()
        .mockReturnValueOnce(query([{ _id: 'pos-new', name: 'Kế toán trưởng' }]))
        .mockReturnValueOnce(query([{ _id: 'pos-old', name: 'Chuyên viên cũ' }])),
    };
    const departmentPositions = {
      find: vi.fn().mockReturnValue(
        query([
          { _id: 'assign-old', positionId: 'pos-old' },
          { _id: 'assign-keep', positionId: 'pos-keep' },
        ]),
      ),
      deleteMany: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) }),
      insertMany: vi.fn().mockResolvedValue([]),
    };
    const auditLogs = { record: vi.fn().mockResolvedValue(undefined) };
    const organizationScope = {
      resolve: vi.fn().mockResolvedValue({
        fullAccess: true,
        managedRootDepartmentIds: [],
        departmentIds: [],
      }),
    };
    const service = new DepartmentsService(
      departments as never,
      employees as never,
      positions as never,
      departmentPositions as never,
      auditLogs as never,
      organizationScope as never,
    );

    await service.update(
      { user: { id: 'admin-1' } } as never,
      'dept-finance',
      { positionIds: ['pos-keep', 'pos-new'] },
    );

    expect(departmentPositions.deleteMany).toHaveBeenCalledWith({
      _id: { $in: ['assign-old'] },
      departmentId: 'dept-finance',
    });
    expect(departmentPositions.insertMany).toHaveBeenCalledWith([
      {
        departmentId: 'dept-finance',
        positionId: 'pos-new',
        createdBy: 'admin-1',
      },
    ]);
  });
});
