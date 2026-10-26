import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequireBodyPermissions, RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { CreateManagedUserDto } from './dto/create-managed-user.dto.js';
import { UpdateManagedUserDto, UpdateManagedUserStatusDto } from './dto/update-managed-user.dto.js';
import { UserIdParamDto } from './dto/user-id-param.dto.js';
import { ListUsersDto } from './dto/list-users.dto.js';
import { ListUserEmployeeOptionsDto } from './dto/list-user-employee-options.dto.js';
import { UsersService } from './users.service.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { dataResponse } from '../common/http/api-response.js';
import { LinkUserEmployeeDto, UpdateUserRolesDto } from './dto/user-relations.dto.js';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiDataResponseDto, ApiResourceConflict, ApiResourceNotFound, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Tài khoản người dùng')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('USER.VIEW')
  @ApiOperation({ summary: 'Danh sách tài khoản', description: 'Yêu cầu quyền: USER.VIEW.' })
  @ApiQuery({ name: 'search', required: false, description: 'Tìm theo dữ liệu tài khoản.' })
  @ApiQuery({ name: 'role', required: false, enum: ['ADMIN', 'DIRECTOR', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE'] })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiOkResponse({ description: 'Danh sách phân trang theo response runtime { data, pagination }.', type: Object })
  @ApiValidationError()
  findAll(@Query() query: ListUsersDto) { return this.usersService.findAllSafe(query); }

  @Get('employee-options')
  @RequirePermissions({ any: ['USER.VIEW', 'USER.CREATE', 'USER.LINK_EMPLOYEE'] })
  @ApiOperation({ summary: 'Danh sách nhân viên để liên kết tài khoản', description: 'Có thể chỉ lấy nhân viên hoạt động chưa có tài khoản; includeEmployeeId giữ lại một nhân viên đang được chọn khi cập nhật.' })
  @ApiQuery({ name: 'availableOnly', required: false, type: Boolean, description: 'Chỉ trả nhân viên hoạt động chưa liên kết tài khoản.' })
  @ApiQuery({ name: 'includeEmployeeId', required: false, description: 'Mã ObjectId nhân viên cần giữ trong danh sách dù đã liên kết.' })
  @ApiOkResponse({ description: 'Danh sách mã nhân viên dùng trong form tài khoản.', type: Object })
  async findEmployeeOptions(@Query() query: ListUserEmployeeOptionsDto) { return dataResponse(await this.usersService.findEmployeeOptions(query)); }

  @Post()
  @RequirePermissions('USER.CREATE')
  @ApiOperation({ summary: 'Tạo tài khoản', description: 'Yêu cầu quyền: USER.CREATE. temporaryPassword chỉ nhận trong request, không trả về response.' })
  @ApiBody({ type: CreateManagedUserDto })
  @ApiCreatedResponse({ description: 'Tạo tài khoản thành công.', type: ApiDataResponseDto })
  @ApiResourceConflict('Email, nhân viên hoặc role không hợp lệ/trùng lặp.')
  @ApiValidationError()
  async create(@Req() request: RequestWithContext, @Body() input: CreateManagedUserDto) { return dataResponse(await this.usersService.createManagedAccount(request, input)); }

  @Get(':id')
  @RequirePermissions('USER.VIEW')
  @ApiOperation({ summary: 'Chi tiết tài khoản', description: 'Yêu cầu quyền: USER.VIEW. Không trả password hoặc password hash.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tài khoản.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiOkResponse({ description: 'Chi tiết tài khoản.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async findOne(@Param() params: UserIdParamDto) { return dataResponse(await this.usersService.findSafeById(params.id)); }

  @Patch(':id')
  @RequirePermissions('USER.UPDATE')
  @RequireBodyPermissions({
    isActive: 'USER.CHANGE_STATUS',
    newPassword: 'USER.RESET_PASSWORD',
    roleIds: 'USER.MANAGE_ROLES',
  })
  @ApiOperation({ summary: 'Cập nhật tài khoản', description: 'Yêu cầu quyền: USER.UPDATE. Sửa isActive cần USER.CHANGE_STATUS, newPassword cần USER.RESET_PASSWORD và roleIds cần USER.MANAGE_ROLES.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tài khoản.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiBody({ type: UpdateManagedUserDto })
  @ApiOkResponse({ description: 'Tài khoản sau cập nhật.', type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async update(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: UpdateManagedUserDto) { return dataResponse(await this.usersService.updateManagedAccount(request, params.id, input)); }

  @Patch(':id/status')
  @RequirePermissions('USER.CHANGE_STATUS')
  @ApiOperation({ summary: 'Đổi trạng thái tài khoản', description: 'Yêu cầu quyền: USER.CHANGE_STATUS.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tài khoản.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiBody({ type: UpdateManagedUserStatusDto })
  @ApiOkResponse({ description: 'Tài khoản sau đổi trạng thái.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async updateStatus(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: UpdateManagedUserStatusDto) { return dataResponse(await this.usersService.updateManagedAccount(request, params.id, { isActive: input.isActive })); }

  @Patch(':id/employee')
  @RequirePermissions('USER.LINK_EMPLOYEE')
  @ApiOperation({ summary: 'Liên kết nhân viên', description: 'Yêu cầu quyền: USER.LINK_EMPLOYEE.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tài khoản.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiBody({ type: LinkUserEmployeeDto })
  @ApiOkResponse({ description: 'Tài khoản sau khi liên kết nhân viên.', type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async linkEmployee(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: LinkUserEmployeeDto) { return dataResponse(await this.usersService.linkManagedEmployee(request, params.id, input.employeeId)); }

  @Delete(':id/employee')
  @RequirePermissions('USER.LINK_EMPLOYEE')
  @ApiOperation({ summary: 'Gỡ liên kết nhân viên', description: 'Yêu cầu quyền: USER.LINK_EMPLOYEE.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tài khoản.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiOkResponse({ description: 'Tài khoản sau khi gỡ liên kết.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async unlinkEmployee(@Req() request: RequestWithContext, @Param() params: UserIdParamDto) { return dataResponse(await this.usersService.unlinkManagedEmployee(request, params.id)); }

  @Post(':id/roles')
  @RequirePermissions('USER.MANAGE_ROLES')
  @ApiOperation({ summary: 'Gán vai trò', description: 'Yêu cầu quyền: USER.MANAGE_ROLES.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tài khoản.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiBody({ type: UpdateUserRolesDto })
  @ApiOkResponse({ description: 'Tài khoản sau khi gán role.', type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async addRoles(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: UpdateUserRolesDto) { return dataResponse(await this.usersService.addManagedRoles(request, params.id, input.roleIds)); }

  @Delete(':id/roles')
  @RequirePermissions('USER.MANAGE_ROLES')
  @ApiOperation({ summary: 'Gỡ vai trò', description: 'Yêu cầu quyền: USER.MANAGE_ROLES.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của tài khoản.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiBody({ type: UpdateUserRolesDto })
  @ApiOkResponse({ description: 'Tài khoản sau khi gỡ role.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async removeRoles(@Req() request: RequestWithContext, @Param() params: UserIdParamDto, @Body() input: UpdateUserRolesDto) { return dataResponse(await this.usersService.removeManagedRoles(request, params.id, input.roleIds)); }
}
