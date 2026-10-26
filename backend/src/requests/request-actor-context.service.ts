import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { Types } from 'mongoose';
import { Department } from '../departments/schemas/department.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { User } from '../users/schemas/user.schema.js';
import type { RequesterSnapshot } from './schemas/request.schema.js';

export interface RequestActorContext {
  userId: Types.ObjectId;
  employeeId: Types.ObjectId;
  requesterSnapshot: RequesterSnapshot;
}

@Injectable()
export class RequestActorContextService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(Department.name) private readonly departments: Model<Department>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
  ) {}

  async resolve(userId: string, session: ClientSession): Promise<RequestActorContext> {
    const user = await this.users.findOne({ _id: userId, isActive: true })
      .select({ _id: 1, employeeId: 1 }).session(session).lean().exec();
    if (!user?.employeeId) throw this.activeEmployeeRequired();

    const employee = await this.employees.findOne({ _id: user.employeeId, isActive: true })
      .select({ employeeCode: 1, fullName: 1, departmentId: 1, positionId: 1, managerId: 1 })
      .session(session).lean().exec();
    if (!employee) throw this.activeEmployeeRequired();

    const [department, position] = await Promise.all([
      this.departments.findById(employee.departmentId).select({ name: 1 }).session(session).lean().exec(),
      this.positions.findById(employee.positionId).select({ name: 1 }).session(session).lean().exec(),
    ]);
    if (!department || !position) {
      throw new ConflictException({
        code: 'EMPLOYEE_ORGANIZATION_INVALID',
        message: 'Thông tin phòng ban hoặc chức danh của nhân viên không hợp lệ.',
      });
    }
    return {
      userId: user._id,
      employeeId: employee._id,
      requesterSnapshot: {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        departmentId: employee.departmentId,
        departmentName: department.name,
        positionId: employee.positionId,
        positionName: position.name,
        managerEmployeeId: employee.managerId,
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
