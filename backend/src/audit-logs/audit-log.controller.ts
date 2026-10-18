import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuditLogService } from './audit-log.service.js';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Nhật ký hệ thống')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermissions('AUDIT_LOG.VIEW')
  @ApiOperation({ summary: 'Tra cứu nhật ký hệ thống', description: 'Yêu cầu quyền: AUDIT_LOG.VIEW. API chỉ phục vụ tra cứu và không trả dữ liệu nhạy cảm.' })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'resourceType', required: false })
  @ApiQuery({ name: 'resourceId', required: false })
  @ApiQuery({ name: 'startDate', required: false, format: 'date-time' })
  @ApiQuery({ name: 'endDate', required: false, format: 'date-time' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Danh sách audit log theo response runtime.', type: Object })
  @ApiValidationError()
  findAll(@Query() query: ListAuditLogsDto) {
    return this.auditLogService.findAll(query);
  }
}
