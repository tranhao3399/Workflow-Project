import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { AdminGuard } from '../audit-logs/guards/admin.guard.js';
import { WorkspaceModulesController } from './workspace-modules.controller.js';
import { WorkspaceModulesService } from './workspace-modules.service.js';
import { WorkspaceModule, WorkspaceModuleSchema } from './schemas/workspace-module.schema.js';

@Module({
  imports: [
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([{ name: WorkspaceModule.name, schema: WorkspaceModuleSchema }]),
  ],
  controllers: [WorkspaceModulesController],
  providers: [WorkspaceModulesService, AdminGuard],
})
export class WorkspaceModulesModule {}
