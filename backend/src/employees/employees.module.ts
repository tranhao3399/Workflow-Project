import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { AdminGuard } from '../audit-logs/guards/admin.guard.js';
import { UsersModule } from '../users/users.module.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';
import { Employee, EmployeeSchema } from './schemas/employee.schema.js';
import { Department, DepartmentSchema } from '../departments/schemas/department.schema.js';
import { Position, PositionSchema } from '../positions/schemas/position.schema.js';
import { AVATAR_STORAGE } from './avatar-storage/avatar-storage.adapter.js';
import { LocalAvatarStorageAdapter } from './avatar-storage/local-avatar-storage.adapter.js';

@Module({
  imports: [
    AuditLogModule,
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: Employee.name, schema: EmployeeSchema }, { name: Department.name, schema: DepartmentSchema }, { name: Position.name, schema: PositionSchema }]),
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService, AdminGuard, LocalAvatarStorageAdapter, { provide: AVATAR_STORAGE, useExisting: LocalAvatarStorageAdapter }],
  exports: [EmployeesService],
})
export class EmployeesModule {}
