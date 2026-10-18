import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { dataResponse } from '../common/http/api-response.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { DashboardService } from './dashboard.service.js';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiDataResponseDto } from '../common/http/swagger-response.dto.js';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @RequirePermissions('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Dữ liệu dashboard', description: 'Yêu cầu quyền: DASHBOARD.VIEW.' })
  @ApiOkResponse({ description: 'Dữ liệu dashboard.', type: ApiDataResponseDto })
  async getDashboard(@Req() request: RequestWithContext) {
    return dataResponse(await this.service.getDashboard(request.user!));
  }
}
