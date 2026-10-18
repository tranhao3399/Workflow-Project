import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { ModuleKeyParamDto } from './dto/module-key-param.dto.js';
import { UpdateWorkspaceModuleDto } from './dto/update-workspace-module.dto.js';
import { WorkspaceModulesService } from './workspace-modules.service.js';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiResourceNotFound, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('workspace-modules')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Quản lý không gian làm việc')
export class WorkspaceModulesController {
  constructor(private readonly workspaceModulesService: WorkspaceModulesService) {}

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Menu module đang bật', description: 'Yêu cầu Bearer access token. Trả các module đang bật toàn hệ thống; frontend tiếp tục lọc theo effective permission của user.' })
  @ApiOkResponse({ description: 'Danh sách module đang bật.', type: [Object] })
  findMyMenu(@Req() request: RequestWithContext) {
    return this.workspaceModulesService.findEnabled(request.user?.permissionKeys ?? []);
  }

  @Get()
  @RequirePermissions('WORKSPACE_MODULE.VIEW')
  @ApiBearerAuth('access-token')
  @ApiAuthenticationErrors()
  @ApiOperation({ summary: 'Danh sách cấu hình module', description: 'Yêu cầu quyền: WORKSPACE_MODULE.VIEW. Đây là cấu hình toàn hệ thống, không gán trực tiếp module cho role.' })
  @ApiOkResponse({ description: 'Danh sách cấu hình module.', type: [Object] })
  findAll() {
    return this.workspaceModulesService.findAll();
  }

  @Patch(':moduleKey')
  @RequirePermissions('WORKSPACE_MODULE.UPDATE')
  @ApiBearerAuth('access-token')
  @ApiAuthenticationErrors()
  @ApiOperation({ summary: 'Cập nhật cấu hình module', description: 'Yêu cầu quyền: WORKSPACE_MODULE.UPDATE. Bật/tắt module toàn hệ thống.' })
  @ApiParam({ name: 'moduleKey', description: 'Khóa module in hoa, ví dụ EMPLOYEES.', example: 'EMPLOYEES' })
  @ApiBody({ type: UpdateWorkspaceModuleDto })
  @ApiOkResponse({ description: 'Cấu hình module sau cập nhật.', type: Object })
  @ApiResourceNotFound()
  @ApiValidationError()
  update(
    @Req() request: RequestWithContext,
    @Param() params: ModuleKeyParamDto,
    @Body() updateDto: UpdateWorkspaceModuleDto,
  ) {
    return this.workspaceModulesService.update(request, params.moduleKey, updateDto);
  }
}
