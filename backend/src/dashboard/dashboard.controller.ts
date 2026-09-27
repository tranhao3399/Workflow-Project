import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { dataResponse } from '../common/http/api-response.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @RequirePermissions('DASHBOARD.VIEW')
  async getDashboard(@Req() request: RequestWithContext) {
    return dataResponse(await this.service.getDashboard(request.user!));
  }
}
