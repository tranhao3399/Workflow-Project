import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import {
  DepartmentPosition,
  DepartmentPositionSchema,
} from '../departments/schemas/department-position.schema.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { JobTitlesController } from './job-titles.controller.js';
import { PositionsController } from './positions.controller.js';
import { PositionsService } from './positions.service.js';
import { Position, PositionSchema } from './schemas/position.schema.js';

@Module({
  imports: [
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: Position.name, schema: PositionSchema },
      { name: DepartmentPosition.name, schema: DepartmentPositionSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  controllers: [PositionsController, JobTitlesController],
  providers: [PositionsService],
  exports: [PositionsService],
})
export class PositionsModule {}
