import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { Department, DepartmentSchema } from '../departments/schemas/department.schema.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { Position, PositionSchema } from '../positions/schemas/position.schema.js';
import { Request, RequestSchema } from '../requests/schemas/request.schema.js';
import { Role, RoleSchema } from '../roles/schemas/role.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { WorkflowRuntimeModule } from '../workflow-runtime/workflow-runtime.module.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';
import { ApprovalHistory, ApprovalHistorySchema } from './schemas/approval-history.schema.js';
import { ApprovalTask, ApprovalTaskSchema } from './schemas/approval-task.schema.js';

@Module({
  imports: [
    AuditLogModule,
    NotificationsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    WorkflowRuntimeModule,
    MongooseModule.forFeature([
      { name: ApprovalTask.name, schema: ApprovalTaskSchema },
      { name: ApprovalHistory.name, schema: ApprovalHistorySchema },
      { name: Request.name, schema: RequestSchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Position.name, schema: PositionSchema },
    ]),
  ],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}
