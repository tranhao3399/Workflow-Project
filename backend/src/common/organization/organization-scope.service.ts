import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter, Types } from 'mongoose';
import { Department } from '../../departments/schemas/department.schema.js';
import { Employee } from '../../employees/schemas/employee.schema.js';
import { Role } from '../../roles/schemas/role.schema.js';
import { User } from '../../users/schemas/user.schema.js';

const FULL_SCOPE_ROLE_KEYS = new Set(['ADMIN', 'DIRECTOR', 'CEO']);

export interface OrganizationDataScope {
  fullAccess: boolean;
  employeeId?: string;
  homeDepartmentId?: string;
  homeWorkUnitId?: string;
  managedRootDepartmentIds: string[];
  departmentIds: string[];
}

@Injectable()
export class OrganizationScopeService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Role.name) private readonly roles: Model<Role>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Department.name)
    private readonly departments: Model<Department>,
  ) {}

  async resolve(userId: string): Promise<OrganizationDataScope> {
    const user = await this.users
      .findById(userId)
      .select({ employeeId: 1, roleIds: 1 })
      .lean()
      .exec();
    if (!user)
      throw new NotFoundException('Không tìm thấy tài khoản người dùng.');

    const roles = user.roleIds?.length
      ? await this.roles
          .find({ _id: { $in: user.roleIds }, isActive: true })
          .select({ key: 1 })
          .lean()
          .exec()
      : [];
    const fullAccess = roles.some((role) => FULL_SCOPE_ROLE_KEYS.has(role.key));
    const employee = user.employeeId
      ? await this.employees
          .findById(user.employeeId)
          .select({ departmentId: 1, workUnitId: 1 })
          .lean()
          .exec()
      : null;

    if (fullAccess) {
      const departments = await this.departments
        .find()
        .select({ _id: 1 })
        .lean()
        .exec();
      return {
        fullAccess: true,
        ...(user.employeeId ? { employeeId: user.employeeId.toString() } : {}),
        ...(employee
          ? { homeDepartmentId: employee.departmentId.toString() }
          : {}),
        ...(employee?.workUnitId
          ? { homeWorkUnitId: employee.workUnitId.toString() }
          : {}),
        managedRootDepartmentIds: [],
        departmentIds: departments.map((department) =>
          department._id.toString(),
        ),
      };
    }

    if (!user.employeeId || !employee) {
      return {
        fullAccess: false,
        managedRootDepartmentIds: [],
        departmentIds: [],
      };
    }

    const managedRoots = await this.departments
      .find({ managerEmployeeId: user.employeeId })
      .select({ _id: 1 })
      .lean()
      .exec();
    const managedRootDepartmentIds = managedRoots.map((department) =>
      department._id.toString(),
    );
    const departmentIds = await this.descendantIds(managedRootDepartmentIds);
    return {
      fullAccess: false,
      employeeId: user.employeeId.toString(),
      homeDepartmentId: employee.departmentId.toString(),
      ...(employee.workUnitId
        ? { homeWorkUnitId: employee.workUnitId.toString() }
        : {}),
      managedRootDepartmentIds,
      departmentIds,
    };
  }

  async employeeFilter(userId: string): Promise<QueryFilter<Employee>> {
    const scope = await this.resolve(userId);
    if (scope.fullAccess) return {};
    if (scope.departmentIds.length) {
      return {
        $or: [
          { workUnitId: { $in: scope.departmentIds } },
          {
            workUnitId: { $exists: false },
            departmentId: { $in: scope.departmentIds },
          },
        ],
      };
    }
    return scope.employeeId ? { _id: scope.employeeId } : { _id: { $in: [] } };
  }

  async canAccessEmployee(
    userId: string,
    employeeId: string,
  ): Promise<boolean> {
    const scope = await this.resolve(userId);
    if (scope.fullAccess || scope.employeeId === employeeId) return true;
    const employee = await this.employees
      .findById(employeeId)
      .select({ departmentId: 1, workUnitId: 1 })
      .lean()
      .exec();
    if (!employee) return false;
    return (
      scope.fullAccess ||
      scope.departmentIds.includes(
        (employee.workUnitId ?? employee.departmentId).toString(),
      )
    );
  }

  async managedRequestFilter(userId: string): Promise<Record<string, unknown>> {
    const scope = await this.resolve(userId);
    if (scope.fullAccess) return {};
    return {
      $or: [
        { 'requesterSnapshot.workUnitId': { $in: scope.departmentIds } },
        {
          'requesterSnapshot.workUnitId': { $exists: false },
          'requesterSnapshot.departmentId': { $in: scope.departmentIds },
        },
      ],
    };
  }

  async canAccessDepartment(
    userId: string,
    departmentId: string | Types.ObjectId,
  ): Promise<boolean> {
    const scope = await this.resolve(userId);
    return (
      scope.fullAccess || scope.departmentIds.includes(departmentId.toString())
    );
  }

  private async descendantIds(rootIds: readonly string[]): Promise<string[]> {
    const result = new Set(rootIds);
    let frontier = [...rootIds];
    while (frontier.length) {
      const children = await this.departments
        .find({ parentId: { $in: frontier } })
        .select({ _id: 1 })
        .lean()
        .exec();
      frontier = children
        .map((child) => child._id.toString())
        .filter((id) => !result.has(id));
      for (const id of frontier) result.add(id);
    }
    return [...result];
  }
}
