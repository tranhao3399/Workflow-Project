import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Department, DepartmentSchema } from '../departments/schemas/department.schema.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { ApprovalTask, ApprovalTaskSchema } from '../approvals/schemas/approval-task.schema.js';
import { AuditLog, AuditLogSchema } from '../audit-logs/schemas/audit-log.schema.js';
import { OrganizationScopeModule } from '../common/organization/organization-scope.module.js';
import { FormDefinition, FormDefinitionSchema } from '../form-definitions/schemas/form-definition.schema.js';
import { Position, PositionSchema } from '../positions/schemas/position.schema.js';
import { Request, RequestSchema } from '../requests/schemas/request.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { WorkflowDefinition, WorkflowDefinitionSchema } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { WorkspaceModule, WorkspaceModuleSchema } from '../workspace-modules/schemas/workspace-module.schema.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    OrganizationScopeModule,
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Position.name, schema: PositionSchema },
      { name: Request.name, schema: RequestSchema },
      { name: ApprovalTask.name, schema: ApprovalTaskSchema },
      { name: FormDefinition.name, schema: FormDefinitionSchema },
      { name: WorkflowDefinition.name, schema: WorkflowDefinitionSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: WorkspaceModule.name, schema: WorkspaceModuleSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
