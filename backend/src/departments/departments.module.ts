import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';
import { Department, DepartmentSchema } from './schemas/department.schema.js';
import { Position, PositionSchema } from '../positions/schemas/position.schema.js';
import { DepartmentPosition, DepartmentPositionSchema } from './schemas/department-position.schema.js';

@Module({
  imports: [
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Department.name, schema: DepartmentSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Position.name, schema: PositionSchema },
      { name: DepartmentPosition.name, schema: DepartmentPositionSchema },
    ]),
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
