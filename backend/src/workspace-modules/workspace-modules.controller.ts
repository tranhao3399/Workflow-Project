import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { ModuleKeyParamDto } from './dto/module-key-param.dto.js';
import { UpdateWorkspaceModuleDto } from './dto/update-workspace-module.dto.js';
import { WorkspaceModulesService } from './workspace-modules.service.js';

@Controller('workspace-modules')
export class WorkspaceModulesController {
  constructor(private readonly workspaceModulesService: WorkspaceModulesService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  findMyMenu() {
    return this.workspaceModulesService.findEnabled();
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions('WORKSPACE_MODULE.VIEW')
  findAll() {
    return this.workspaceModulesService.findAll();
  }

  @Patch(':moduleKey')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions('WORKSPACE_MODULE.UPDATE')
  update(
    @Req() request: RequestWithContext,
    @Param() params: ModuleKeyParamDto,
    @Body() updateDto: UpdateWorkspaceModuleDto,
  ) {
    return this.workspaceModulesService.update(request, params.moduleKey, updateDto);
  }
}
