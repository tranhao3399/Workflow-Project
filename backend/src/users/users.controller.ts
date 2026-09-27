import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequireBodyPermissions, RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { CreateManagedUserDto } from './dto/create-managed-user.dto.js';
import { UpdateManagedUserDto, UpdateManagedUserStatusDto } from './dto/update-managed-user.dto.js';
import { UserIdParamDto } from './dto/user-id-param.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { UsersService } from './users.service.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { dataResponse } from '../common/http/api-response.js';
import { LinkUserEmployeeDto, UpdateUserRolesDto } from './dto/user-relations.dto.js';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('USER.VIEW')
  findAll(@Query() query: ListUsersDto) { return this.usersService.findAllSafe(query); }

  @Post()
  @RequirePermissions('USER.CREATE')
  async create(@Req() request: RequestWithContext, @Body() input: CreateManagedUserDto) { return dataResponse(await this.usersService.createManagedAccount(request, input)); }

  @Get(':id')
  @RequirePermissions('USER.VIEW')
  async findOne(@Param() params: UserIdParamDto) { return dataResponse(await this.usersService.findSafeById(params.id)); }

  @Patch(':id')
  @RequirePermissions('USER.UPDATE')
  @RequireBodyPermissions({
    isActive: 'USER.CHANGE_STATUS',
    newPassword: 'USER.RESET_PASSWORD',
    roleIds: 'USER.MANAGE_ROLES',
  })
  async update(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: UpdateManagedUserDto) { return dataResponse(await this.usersService.updateManagedAccount(request, params.id, input)); }

  @Patch(':id/status')
  @RequirePermissions('USER.CHANGE_STATUS')
  async updateStatus(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: UpdateManagedUserStatusDto) { return dataResponse(await this.usersService.updateManagedAccount(request, params.id, { isActive: input.isActive })); }

  @Patch(':id/employee')
  @RequirePermissions('USER.LINK_EMPLOYEE')
  async linkEmployee(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: LinkUserEmployeeDto) { return dataResponse(await this.usersService.linkManagedEmployee(request, params.id, input.employeeId)); }

  @Delete(':id/employee')
  @RequirePermissions('USER.LINK_EMPLOYEE')
  async unlinkEmployee(@Req() request: RequestWithContext, @Param() params: UserIdParamDto) { return dataResponse(await this.usersService.unlinkManagedEmployee(request, params.id)); }

  @Post(':id/roles')
  @RequirePermissions('USER.MANAGE_ROLES')
  async addRoles(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: UpdateUserRolesDto) { return dataResponse(await this.usersService.addManagedRoles(request, params.id, input.roleIds)); }

  @Delete(':id/roles')
  @RequirePermissions('USER.MANAGE_ROLES')
  async removeRoles(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: UpdateUserRolesDto) { return dataResponse(await this.usersService.removeManagedRoles(request, params.id, input.roleIds)); }
}
