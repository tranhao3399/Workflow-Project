import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalHistory, ApprovalHistorySchema } from '../approvals/schemas/approval-history.schema.js';
import { ApprovalTask, ApprovalTaskSchema } from '../approvals/schemas/approval-task.schema.js';
import { Department, DepartmentSchema } from '../departments/schemas/department.schema.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { Position, PositionSchema } from '../positions/schemas/position.schema.js';
import { Request, RequestSchema } from '../requests/schemas/request.schema.js';
import { Role, RoleSchema } from '../roles/schemas/role.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { AssigneeResolverService } from './assignee-resolver.service.js';
import { ConditionEvaluatorService } from './condition-evaluator.service.js';
import { WorkflowHistoryService } from './workflow-history.service.js';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Request.name, schema: RequestSchema },
      { name: ApprovalTask.name, schema: ApprovalTaskSchema },
      { name: ApprovalHistory.name, schema: ApprovalHistorySchema },
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Position.name, schema: PositionSchema },
    ]),
  ],
  providers: [
    WorkflowRuntimeService,
    AssigneeResolverService,
    ConditionEvaluatorService,
    WorkflowHistoryService,
  ],
  exports: [
    WorkflowRuntimeService,
    WorkflowHistoryService,
  ],
})
export class WorkflowRuntimeModule {}
