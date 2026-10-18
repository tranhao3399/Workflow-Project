import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { Request, RequestSchema } from '../requests/schemas/request.schema.js';
import { WorkflowDefinition, WorkflowDefinitionSchema } from '../workflow-definitions/schemas/workflow-definition.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema.js';
import { DynamicFormValidatorService } from './dynamic-form-validator.service.js';
import { FormDefinitionsController } from './form-definitions.controller.js';
import { FormDefinitionsService } from './form-definitions.service.js';
import { FormDefinition, FormDefinitionSchema } from './schemas/form-definition.schema.js';

@Module({
  imports: [
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: FormDefinition.name, schema: FormDefinitionSchema },
      { name: WorkflowDefinition.name, schema: WorkflowDefinitionSchema },
      { name: Request.name, schema: RequestSchema },
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  controllers: [FormDefinitionsController],
  providers: [FormDefinitionsService, DynamicFormValidatorService],
  exports: [MongooseModule, DynamicFormValidatorService],
})
export class FormDefinitionsModule {}
