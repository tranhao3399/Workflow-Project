import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { SafeUser } from '../users/users.service.js';
import { Department } from '../departments/schemas/department.schema.js';
import { Employee } from '../employees/schemas/employee.schema.js';
import { Position } from '../positions/schemas/position.schema.js';
import { User } from '../users/schemas/user.schema.js';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Department.name) private readonly departments: Model<Department>,
    @InjectModel(Position.name) private readonly positions: Model<Position>,
  ) {}

  async getDashboard(user: SafeUser) {
    const [activeEmployees, activeUsers, activeDepartments, activePositions] = await Promise.all([
      this.employees.countDocuments({ isActive: { $ne: false } }).exec(),
      this.users.countDocuments({ isActive: { $ne: false } }).exec(),
      this.departments.countDocuments({ isActive: { $ne: false } }).exec(),
      this.positions.countDocuments({ isActive: { $ne: false } }).exec(),
    ]);
    return {
      role: user.role,
      greeting: `Xin chào, ${user.fullName}.`,
      metrics: [
        { label: 'Nhân viên đang làm việc', value: String(activeEmployees), description: 'Dữ liệu hồ sơ nhân viên hiện có.', tone: 'neutral' },
        { label: 'Tài khoản hoạt động', value: String(activeUsers), description: 'Dữ liệu tài khoản hiện có.', tone: 'success' },
        { label: 'Phòng ban hoạt động', value: String(activeDepartments), description: 'Danh mục cơ cấu tổ chức.', tone: 'neutral' },
        { label: 'Chức danh hoạt động', value: String(activePositions), description: 'Danh mục chức danh dùng chung.', tone: 'neutral' },
      ],
      requests: [],
      approvals: [],
      activitySummary: [
        { label: 'Nhân viên', value: String(activeEmployees), description: 'Đang làm việc' },
        { label: 'Tài khoản', value: String(activeUsers), description: 'Hoạt động' },
      ],
    };
  }
}
