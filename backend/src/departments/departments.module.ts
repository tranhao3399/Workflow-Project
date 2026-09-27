import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { AdminGuard } from '../audit-logs/guards/admin.guard.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';
import { Department, DepartmentSchema } from './schemas/department.schema.js';
import { Position, PositionSchema } from '../positions/schemas/position.schema.js';
import { DepartmentPosition, DepartmentPositionSchema } from './schemas/department-position.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';

@Module({
  imports: [
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Department.name, schema: DepartmentSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Position.name, schema: PositionSchema },
      { name: DepartmentPosition.name, schema: DepartmentPositionSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService, AdminGuard],
  exports: [DepartmentsService, MongooseModule],
})
export class DepartmentsModule {}
