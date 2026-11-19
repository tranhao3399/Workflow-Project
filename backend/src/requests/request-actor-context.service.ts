import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { Types } from 'mongoose';
import { Department } from '../departments/schemas/department.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { User } from '../users/schemas/user.schema.js';
import {
  extractEffectiveLeaveDeductionConfig,
  extractLeaveDaysFromFormData,
  roundLeaveDays,
} from './leave-deduction.helper.js';
import { Request, type RequesterSnapshot } from './schemas/request.schema.js';

export interface RequestActorAutoFillProfile {
  employeeCode: string;
  fullName: string;
  email: string;
  phone?: string;
  departmentName: string;
  workUnitName: string;
  positionName: string;
  directManagerName?: string;
  annualLeaveDays?: number;
  pendingHeldLeaveDays?: number;
  availableAnnualLeaveDays?: number;
}

export interface RequestActorContext {
  userId: Types.ObjectId;
  employeeId: Types.ObjectId;
  requesterSnapshot: RequesterSnapshot;
  autoFillProfile: RequestActorAutoFillProfile;
}

@Injectable()
export class RequestActorContextService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Department.name)
    private readonly departments: Model<Department>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
    @InjectModel(Request.name) private readonly requests: Model<Request>,
  ) {}

  async resolve(
    userId: string,
    session?: ClientSession,
    options?: { excludeRequestId?: Types.ObjectId | string },
  ): Promise<RequestActorContext> {
    const querySession = session ?? null;
    const user = await this.users
      .findOne({ _id: userId, isActive: true })
      .select({ _id: 1, email: 1, employeeId: 1 })
      .session(querySession)
      .lean()
      .exec();
    if (!user?.employeeId) throw this.activeEmployeeRequired();

    const employee = await this.employees
      .findOne({ _id: user.employeeId, isActive: true })
      .select({
        employeeCode: 1,
        fullName: 1,
        workEmail: 1,
        phone: 1,
        departmentId: 1,
        workUnitId: 1,
        positionId: 1,
        managerId: 1,
        annualLeaveDays: 1,
      })
      .session(querySession)
      .lean()
      .exec();
    if (!employee) throw this.activeEmployeeRequired();

    const excludeId = options?.excludeRequestId
      ? new Types.ObjectId(options.excludeRequestId.toString())
      : undefined;

    const [department, position, workUnit, manager, pendingLeaveRequests] = await Promise.all([
      this.departments
        .findById(employee.departmentId)
        .select({ name: 1 })
        .session(querySession)
        .lean()
        .exec(),
      this.positions
        .findById(employee.positionId)
        .select({ name: 1 })
        .session(querySession)
        .lean()
        .exec(),
      employee.workUnitId
        ? this.departments
            .findById(employee.workUnitId)
            .select({ name: 1 })
            .session(querySession)
            .lean()
            .exec()
        : Promise.resolve(null),
      employee.managerId
        ? this.employees
            .findById(employee.managerId)
            .select({ fullName: 1 })
            .session(querySession)
            .lean()
            .exec()
        : Promise.resolve(null),
      this.requests
        .find({
          requesterEmployeeId: employee._id,
          status: { $in: ['IN_PROGRESS', 'REVISION_REQUESTED'] },
          $or: [
            { 'formSnapshot.settings.leaveDeduction.enabled': true },
            { 'workflowSnapshot.steps': { $elemMatch: { type: 'ACTION', 'actionConfig.actionType': 'BALANCE_DEDUCT' } } },
          ],
          leaveDeductionApplied: { $exists: false },
          ...(excludeId ? { _id: { $ne: excludeId } } : {}),
        })
        .select({ formData: 1, 'formSnapshot.settings.leaveDeduction': 1, 'workflowSnapshot.steps': 1 })
        .session(querySession)
        .lean()
        .exec(),
    ]);
    if (!department || !position) {
      throw new ConflictException({
        code: 'EMPLOYEE_ORGANIZATION_INVALID',
        message:
          'Thông tin phòng ban hoặc chức danh của nhân viên không hợp lệ.',
      });
    }

    let pendingHeldLeaveDays = 0;
    for (const pending of pendingLeaveRequests) {
      const cfg = extractEffectiveLeaveDeductionConfig(
        (pending.formSnapshot as { settings?: unknown } | undefined)?.settings,
        (pending.workflowSnapshot as { steps?: unknown } | undefined)?.steps,
      );
      if (!cfg?.enabled) continue;
      const days = extractLeaveDaysFromFormData(pending.formData, cfg.fieldKey);
      if (days !== undefined && days > 0) {
        pendingHeldLeaveDays = roundLeaveDays(pendingHeldLeaveDays + days);
      }
    }
    const rawAnnualLeaveDays =
      typeof employee.annualLeaveDays === 'number' && Number.isFinite(employee.annualLeaveDays)
        ? roundLeaveDays(employee.annualLeaveDays)
        : undefined;
    const availableAnnualLeaveDays = rawAnnualLeaveDays !== undefined
      ? roundLeaveDays(rawAnnualLeaveDays - pendingHeldLeaveDays)
      : undefined;

    return {
      userId: user._id,
      employeeId: employee._id,
      requesterSnapshot: {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        departmentId: employee.departmentId,
        departmentName: department.name,
        ...(employee.workUnitId && workUnit
          ? { workUnitId: employee.workUnitId, workUnitName: workUnit.name }
          : {}),
        positionId: employee.positionId,
        positionName: position.name,
        managerEmployeeId: employee.managerId,
      },
      autoFillProfile: {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        email: employee.workEmail || user.email,
        ...(employee.phone ? { phone: employee.phone } : {}),
        departmentName: department.name,
        workUnitName: workUnit?.name ?? department.name,
        positionName: position.name,
        ...(manager?.fullName ? { directManagerName: manager.fullName } : {}),
        ...(rawAnnualLeaveDays !== undefined ? {
          annualLeaveDays: rawAnnualLeaveDays,
          pendingHeldLeaveDays,
          availableAnnualLeaveDays,
        } : {}),
      },
    };
  }

  private activeEmployeeRequired(): ConflictException {
    return new ConflictException({
      code: 'ACTIVE_EMPLOYEE_REQUIRED',
      message: 'Tài khoản phải liên kết với một nhân viên đang hoạt động.',
    });
  }
}
