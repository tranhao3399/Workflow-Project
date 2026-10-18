import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Department } from '../departments/schemas/department.schema.js';
import { Employee, type EmployeeDocument } from '../employees/schemas/employee.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import type { RequestDocument } from '../requests/schemas/request.schema.js';
import { Role } from '../roles/schemas/role.schema.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import type { ResolvedAssignee, RuntimeAssigneeRule } from './workflow-runtime.types.js';

const APPROVER_PERMISSION = 'APPROVALS.APPROVE_ASSIGNED';

@Injectable()
export class AssigneeResolverService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Role.name) private readonly roles: Model<Role>,
    @InjectModel(Department.name) private readonly departments: Model<Department>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
  ) {}

  async resolve(
    request: RequestDocument,
    rule: RuntimeAssigneeRule,
    allowSelfApproval: boolean,
    session: ClientSession,
  ): Promise<ResolvedAssignee[]> {
    const initialUsers = await this.resolveRuleUsers(request, rule, session);
    const uniqueUsers = new Map(initialUsers.map((user) => [user._id.toString(), user]));
    if (!allowSelfApproval) uniqueUsers.delete(request.requesterUserId.toString());

    const candidates = [...uniqueUsers.values()];
    const employeeIds = candidates.flatMap((user) => user.employeeId ? [user.employeeId] : []);
    const employeeDocuments = employeeIds.length
      ? await this.employees.find({ _id: { $in: employeeIds }, isActive: true }).session(session).exec()
      : [];
    const employeesById = new Map(employeeDocuments.map((employee) => [employee._id.toString(), employee]));

    const roleIds = [...new Set(candidates.flatMap((user) => (user.roleIds ?? []).map((roleId) => roleId.toString())))];
    const approverRoles = roleIds.length
      ? await this.roles.find({ _id: { $in: roleIds }, isActive: true, permissionKeys: APPROVER_PERMISSION })
        .select({ _id: 1 })
        .session(session)
        .exec()
      : [];
    const approverRoleIds = new Set(approverRoles.map((role) => role._id.toString()));

    const eligible = candidates.filter((user) => {
      if (user.employeeId && !employeesById.has(user.employeeId.toString())) return false;
      return (user.roleIds ?? []).some((roleId) => approverRoleIds.has(roleId.toString()));
    });
    const snapshots = await this.snapshotAssignees(eligible, employeesById, session);
    if (!snapshots.length) {
      throw new ConflictException({
        code: 'NO_APPROVER_FOUND',
        message: 'Không tìm thấy người phê duyệt đang hoạt động và có quyền xử lý phiếu.',
      });
    }
    return snapshots.sort((first, second) => first.userId.toString().localeCompare(second.userId.toString()));
  }

  private async resolveRuleUsers(
    request: RequestDocument,
    rule: RuntimeAssigneeRule,
    session: ClientSession,
  ): Promise<UserDocument[]> {
    switch (rule.type) {
      case 'REQUESTER_DIRECT_MANAGER':
        return this.usersForEmployeeIds(
          request.requesterSnapshot.managerEmployeeId ? [request.requesterSnapshot.managerEmployeeId] : [],
          session,
        );
      case 'REQUESTER_DEPARTMENT_MANAGER': {
        const department = await this.departments.findOne({
          _id: request.requesterSnapshot.departmentId,
          isActive: true,
        }).select({ managerEmployeeId: 1 }).session(session).exec();
        return this.usersForEmployeeIds(department?.managerEmployeeId ? [department.managerEmployeeId] : [], session);
      }
      case 'ROLE': {
        const roleIds = await this.activeRuleRoleIds(rule.roleIds, session);
        if (!roleIds.length) return [];
        return this.users.find({ isActive: true, roleIds: { $in: roleIds } }).session(session).exec();
      }
      case 'ROLE_IN_REQUESTER_DEPARTMENT': {
        const roleIds = await this.activeRuleRoleIds(rule.roleIds, session);
        if (!roleIds.length) return [];
        const employeeIds = await this.activeEmployeeIds({ departmentId: request.requesterSnapshot.departmentId }, session);
        if (!employeeIds.length) return [];
        return this.users.find({ isActive: true, employeeId: { $in: employeeIds }, roleIds: { $in: roleIds } })
          .session(session)
          .exec();
      }
      case 'POSITION_IN_REQUESTER_DEPARTMENT': {
        const positionIds = await this.activeRulePositionIds(rule.positionIds, session);
        if (!positionIds.length) return [];
        const employeeIds = await this.activeEmployeeIds({
          departmentId: request.requesterSnapshot.departmentId,
          positionId: { $in: positionIds },
        }, session);
        return this.usersForEmployeeIds(employeeIds, session);
      }
      case 'SPECIFIC_USER':
        if (!rule.userIds?.length) return [];
        return this.users.find({ _id: { $in: rule.userIds }, isActive: true }).session(session).exec();
      default:
        throw new BadRequestException({
          code: 'WORKFLOW_ASSIGNEE_RULE_INVALID',
          message: 'Loại quy tắc người phê duyệt không được hỗ trợ.',
        });
    }
  }

  private async activeRuleRoleIds(roleIds: Types.ObjectId[] | undefined, session: ClientSession): Promise<Types.ObjectId[]> {
    if (!roleIds?.length) return [];
    const roles = await this.roles.find({ _id: { $in: roleIds }, isActive: true }).select({ _id: 1 }).session(session).exec();
    return roles.map((role) => role._id);
  }

  private async activeRulePositionIds(
    positionIds: Types.ObjectId[] | undefined,
    session: ClientSession,
  ): Promise<Types.ObjectId[]> {
    if (!positionIds?.length) return [];
    const positions = await this.positions.find({ _id: { $in: positionIds }, isActive: true })
      .select({ _id: 1 })
      .session(session)
      .exec();
    return positions.map((position) => position._id);
  }

  private async activeEmployeeIds(filter: Record<string, unknown>, session: ClientSession): Promise<Types.ObjectId[]> {
    const employees = await this.employees.find({ ...filter, isActive: true }).select({ _id: 1 }).session(session).exec();
    return employees.map((employee) => employee._id);
  }

  private async usersForEmployeeIds(employeeIds: Types.ObjectId[], session: ClientSession): Promise<UserDocument[]> {
    if (!employeeIds.length) return [];
    const activeEmployees = await this.employees.find({ _id: { $in: employeeIds }, isActive: true })
      .select({ _id: 1 })
      .session(session)
      .exec();
    if (!activeEmployees.length) return [];
    return this.users.find({ employeeId: { $in: activeEmployees.map((employee) => employee._id) }, isActive: true })
      .session(session)
      .exec();
  }

  private async snapshotAssignees(
    users: UserDocument[],
    employeesById: Map<string, EmployeeDocument>,
    session: ClientSession,
  ): Promise<ResolvedAssignee[]> {
    const employees = [...employeesById.values()];
    const departmentIds = [...new Set(employees.map((employee) => employee.departmentId.toString()))];
    const positionIds = [...new Set(employees.map((employee) => employee.positionId.toString()))];
    const departments = departmentIds.length
      ? await this.departments.find({ _id: { $in: departmentIds } }).select({ name: 1 }).session(session).exec()
      : [];
    const positions = positionIds.length
      ? await this.positions.find({ _id: { $in: positionIds } }).select({ name: 1 }).session(session).exec()
      : [];
    const departmentNames = new Map(departments.map((department) => [department._id.toString(), department.name]));
    const positionNames = new Map(positions.map((position) => [position._id.toString(), position.name]));

    return users.map((user) => {
      const employee = user.employeeId ? employeesById.get(user.employeeId.toString()) : undefined;
      return {
        userId: user._id,
        ...(employee ? { employeeId: employee._id } : {}),
        snapshot: {
          fullName: employee?.fullName ?? user.displayName ?? 'Người phê duyệt',
          ...(employee?.employeeCode ? { employeeCode: employee.employeeCode } : {}),
          ...(employee ? { departmentName: departmentNames.get(employee.departmentId.toString()) } : {}),
          ...(employee ? { positionName: positionNames.get(employee.positionId.toString()) } : {}),
        },
      };
    });
  }
}
