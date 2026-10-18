import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditLogModule } from './audit-logs/audit-log.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { UsersModule } from './users/users.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { DepartmentsModule } from './departments/departments.module.js';
import { PositionsModule } from './positions/positions.module.js';
import { RolesModule } from './roles/roles.module.js';
import { ReferenceDataModule } from './reference-data/reference-data.module.js';
import { WorkspaceModulesModule } from './workspace-modules/workspace-modules.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AuthorizationModule } from './common/authorization/authorization.module.js';
import { FormDefinitionsModule } from './form-definitions/form-definitions.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { ApprovalsModule } from './approvals/approvals.module.js';
import { FilesModule } from './files/files.module.js';
import { DefinitionPackagesModule } from './definition-packages/definition-packages.module.js';
import { WorkflowDefinitionsModule } from './workflow-definitions/workflow-definitions.module.js';
import { MongoTransactionReadinessService } from './common/database/mongo-transaction-readiness.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthorizationModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://127.0.0.1:27017/workflow_db?replicaSet=rs0',
        ),
      }),
    }),
    UsersModule,
    DepartmentsModule,
    PositionsModule,
    RolesModule,
    ReferenceDataModule,
    EmployeesModule,
    AuditLogModule,
    AuthModule,
    WorkspaceModulesModule,
    DashboardModule,
    NotificationsModule,
    FormDefinitionsModule,
    WorkflowDefinitionsModule,
    RequestsModule,
    ApprovalsModule,
    FilesModule,
    DefinitionPackagesModule,
  ],
  controllers: [AppController],
  providers: [AppService, MongoTransactionReadinessService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
