import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { ApprovalTask, ApprovalTaskSchema } from '../approvals/schemas/approval-task.schema.js';
import { FormDefinition, FormDefinitionSchema } from '../form-definitions/schemas/form-definition.schema.js';
import { Request, RequestSchema } from '../requests/schemas/request.schema.js';
import { FileAccessService } from './file-access.service.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { StoredFile, StoredFileSchema } from './schemas/stored-file.schema.js';
import { LocalPrivateStorageAdapter } from './storage/local-private-storage.adapter.js';
import { FILE_STORAGE } from './storage/storage-adapter.js';
import { TemporaryFileCleanupService } from './temporary-file-cleanup.service.js';

@Module({
  imports: [
    AuditLogModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: StoredFile.name, schema: StoredFileSchema },
      { name: Request.name, schema: RequestSchema },
      { name: ApprovalTask.name, schema: ApprovalTaskSchema },
      { name: FormDefinition.name, schema: FormDefinitionSchema },
    ]),
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    FileAccessService,
    TemporaryFileCleanupService,
    LocalPrivateStorageAdapter,
    { provide: FILE_STORAGE, useExisting: LocalPrivateStorageAdapter },
  ],
  exports: [FilesService],
})
export class FilesModule {}
