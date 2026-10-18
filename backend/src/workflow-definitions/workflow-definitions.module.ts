import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { FormDefinition, FormDefinitionSchema } from '../form-definitions/schemas/form-definition.schema.js';
import { Request, RequestSchema } from '../requests/schemas/request.schema.js';
import { WorkflowDefinition, WorkflowDefinitionSchema } from './schemas/workflow-definition.schema.js';
import { WorkflowGraphValidatorService } from './workflow-graph-validator.service.js';
import { WorkflowDefinitionsController } from './workflow-definitions.controller.js';
import { WorkflowDefinitionsService } from './workflow-definitions.service.js';
import { Role, RoleSchema } from '../roles/schemas/role.schema.js';
import { Position, PositionSchema } from '../positions/schemas/position.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { BpmnWorkflowCompilerService } from './bpmn-workflow-compiler.service.js';

@Module({
  imports: [
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: WorkflowDefinition.name, schema: WorkflowDefinitionSchema },
      { name: FormDefinition.name, schema: FormDefinitionSchema },
      { name: Request.name, schema: RequestSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Position.name, schema: PositionSchema },
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  controllers: [WorkflowDefinitionsController],
  providers: [WorkflowDefinitionsService, WorkflowGraphValidatorService, BpmnWorkflowCompilerService],
  exports: [WorkflowDefinitionsService, WorkflowGraphValidatorService, BpmnWorkflowCompilerService],
})
export class WorkflowDefinitionsModule {}
