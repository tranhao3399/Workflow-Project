import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { FormDefinitionsModule } from '../form-definitions/form-definitions.module.js';
import { DefinitionPackagesController } from './definition-packages.controller.js';
import { DefinitionPublishingService } from './definition-publishing.service.js';
import { WorkflowDefinitionsModule } from '../workflow-definitions/workflow-definitions.module.js';

@Module({
  imports: [
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    FormDefinitionsModule,
    WorkflowDefinitionsModule,
  ],
  controllers: [DefinitionPackagesController],
  providers: [DefinitionPublishingService],
})
export class DefinitionPackagesModule {}
