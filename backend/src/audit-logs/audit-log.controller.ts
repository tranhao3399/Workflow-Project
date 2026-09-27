import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuditLogService } from './audit-log.service.js';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermissions('AUDIT_LOG.VIEW')
  findAll(@Query() query: ListAuditLogsDto) {
    return this.auditLogService.findAll(query);
  }
}
