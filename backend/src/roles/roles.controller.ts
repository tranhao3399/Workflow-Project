import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreateRoleDto, ListRolesDto, RoleIdParamDto, UpdateRoleDto, UpdateRoleStatusDto } from './dto/role.dto.js';
import { RoleUpdatePermissionsGuard } from './guards/role-update-permissions.guard.js';
import { RolesService } from './roles.service.js';
import { dataResponse } from '../common/http/api-response.js';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @RequirePermissions('ROLE.VIEW')
  findAll(@Query() query: ListRolesDto) { return this.service.findAll(query); }

  @Get('permission-registry')
  @RequirePermissions('ROLE.VIEW')
  permissionRegistry() { return this.service.permissionRegistry(); }

  @Get(':id')
  @RequirePermissions('ROLE.VIEW')
  async findOne(@Param() params: RoleIdParamDto) { return dataResponse(await this.service.findOne(params.id)); }

  @Post()
  @RequirePermissions('ROLE.CREATE')
  async create(@Req() request: RequestWithContext, @Body() input: CreateRoleDto) { return dataResponse(await this.service.create(request, input)); }

  @Patch(':id')
  @RequirePermissions('ROLE.UPDATE')
  @UseGuards(RoleUpdatePermissionsGuard)
  async update(@Req() request: RequestWithContext, @Param() params: RoleIdParamDto, @Body() input: UpdateRoleDto) { return dataResponse(await this.service.update(request, params.id, input)); }

  @Patch(':id/status')
  @RequirePermissions('ROLE.CHANGE_STATUS')
  async updateStatus(@Req() request: RequestWithContext, @Param() params: RoleIdParamDto, @Body() input: UpdateRoleStatusDto) { return dataResponse(await this.service.updateStatus(request, params.id, input.isActive)); }

  @Delete(':id')
  @RequirePermissions('ROLE.DELETE')
  async remove(@Req() request: RequestWithContext, @Param() params: RoleIdParamDto) {
    await this.service.remove(request, params.id);
    return dataResponse({ id: params.id });
  }
}
