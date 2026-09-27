import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AdminGuard } from '../audit-logs/guards/admin.guard.js';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { Role, RoleSchema } from '../roles/schemas/role.schema.js';
import { UserSession, UserSessionSchema } from '../auth/schemas/user-session.schema.js';
import { UsersController } from './users.controller.js';
import { User, UserSchema } from './schemas/user.schema.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: Employee.name, schema: EmployeeSchema }, { name: Role.name, schema: RoleSchema }, { name: UserSession.name, schema: UserSessionSchema }]),
  ],
  controllers: [UsersController],
  providers: [UsersService, AdminGuard],
  exports: [UsersService],
})
export class UsersModule {}
