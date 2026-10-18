import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { ApprovalHistory, ApprovalHistorySchema } from '../approvals/schemas/approval-history.schema.js';
import { ApprovalTask, ApprovalTaskSchema } from '../approvals/schemas/approval-task.schema.js';
import { Department, DepartmentSchema } from '../departments/schemas/department.schema.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { FilesModule } from '../files/files.module.js';
import { FormDefinitionsModule } from '../form-definitions/form-definitions.module.js';
import { FormDefinition, FormDefinitionSchema } from '../form-definitions/schemas/form-definition.schema.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { Position, PositionSchema } from '../positions/schemas/position.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { WorkflowDefinition, WorkflowDefinitionSchema } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { WorkflowRuntimeModule } from '../workflow-runtime/workflow-runtime.module.js';
import { WorkspaceModule, WorkspaceModuleSchema } from '../workspace-modules/schemas/workspace-module.schema.js';
import { RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';
import { Request, RequestSchema } from './schemas/request.schema.js';

@Module({
  imports: [
    AuditLogModule,
    NotificationsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    FormDefinitionsModule,
    FilesModule,
    WorkflowRuntimeModule,
    MongooseModule.forFeature([
      { name: Request.name, schema: RequestSchema },
      { name: FormDefinition.name, schema: FormDefinitionSchema },
      { name: WorkflowDefinition.name, schema: WorkflowDefinitionSchema },
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Position.name, schema: PositionSchema },
      { name: WorkspaceModule.name, schema: WorkspaceModuleSchema },
      { name: ApprovalTask.name, schema: ApprovalTaskSchema },
      { name: ApprovalHistory.name, schema: ApprovalHistorySchema },
    ]),
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
