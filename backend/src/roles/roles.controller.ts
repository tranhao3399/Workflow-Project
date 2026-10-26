import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreateRoleDto, ListRolesDto, PermissionRegistryItemResponseDto, RoleDataResponseDto, RoleIdParamDto, RoleResponseDto, UpdateRoleDto, UpdateRoleStatusDto } from './dto/role.dto.js';
import { RoleUpdatePermissionsGuard } from './guards/role-update-permissions.guard.js';
import { RolesService } from './roles.service.js';
import { dataResponse } from '../common/http/api-response.js';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiDataResponseDto, ApiResourceConflict, ApiResourceNotFound, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Vai trò và phân quyền')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @RequirePermissions('ROLE.VIEW')
  @ApiOperation({ summary: 'Danh sách vai trò', description: 'Yêu cầu quyền: ROLE.VIEW.' })
  @ApiQuery({ name: 'active', required: false, type: Boolean, description: 'Lọc trạng thái hoạt động.' })
  @ApiOkResponse({ description: 'Mảng vai trò, mỗi phần tử có assignedUserCount.', type: [RoleResponseDto] })
  @ApiValidationError()
  findAll(@Query() query: ListRolesDto) { return this.service.findAll(query); }

  @Get('permission-registry')
  @RequirePermissions('ROLE.VIEW')
  @ApiOperation({ summary: 'Permission Registry', description: 'Yêu cầu quyền: ROLE.VIEW. Trả registry backend gồm key, module, moduleLabel, label và matrixColumn.' })
  @ApiOkResponse({ description: 'Mảng permission registry.', type: [PermissionRegistryItemResponseDto] })
  permissionRegistry() { return this.service.permissionRegistry(); }

  @Get(':id')
  @RequirePermissions('ROLE.VIEW')
  @ApiOperation({ summary: 'Chi tiết vai trò', description: 'Yêu cầu quyền: ROLE.VIEW.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của vai trò.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiOkResponse({ description: 'Chi tiết vai trò.', type: RoleDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async findOne(@Param() params: RoleIdParamDto) { return dataResponse(await this.service.findOne(params.id)); }

  @Post()
  @RequirePermissions('ROLE.CREATE')
  @ApiOperation({ summary: 'Tạo vai trò', description: 'Yêu cầu quyền: ROLE.CREATE. permissionKeys được kiểm tra theo Permission Registry; backend tự thêm <MODULE>.VIEW khi cần.' })
  @ApiBody({ type: CreateRoleDto })
  @ApiCreatedResponse({ description: 'Tạo vai trò thành công.', type: RoleDataResponseDto })
  @ApiResourceConflict('Mã hoặc tên vai trò đã tồn tại.')
  @ApiValidationError()
  async create(@Req() request: RequestWithContext, @Body() input: CreateRoleDto) { return dataResponse(await this.service.create(request, input)); }

  @Patch(':id')
  @RequirePermissions('ROLE.UPDATE')
  @UseGuards(RoleUpdatePermissionsGuard)
  @ApiOperation({ summary: 'Cập nhật vai trò', description: 'Yêu cầu quyền: ROLE.UPDATE. Sửa permissionKeys cần ROLE.MANAGE_PERMISSIONS; sửa isActive cần ROLE.CHANGE_STATUS.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của vai trò.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiOkResponse({ description: 'Vai trò sau cập nhật.', type: RoleDataResponseDto })
  @ApiResourceConflict('Không thể đổi mã vai trò ADMIN hoặc ngưng vai trò đang được gán.')
  @ApiResourceNotFound()
  @ApiValidationError()
  async update(@Req() request: RequestWithContext, @Param() params: RoleIdParamDto, @Body() input: UpdateRoleDto) { return dataResponse(await this.service.update(request, params.id, input)); }

  @Patch(':id/status')
  @RequirePermissions('ROLE.CHANGE_STATUS')
  @ApiOperation({ summary: 'Đổi trạng thái vai trò', description: 'Yêu cầu quyền: ROLE.CHANGE_STATUS. Không thể ngưng Role ADMIN hoạt động cuối cùng.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của vai trò.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiBody({ type: UpdateRoleStatusDto })
  @ApiOkResponse({ description: 'Vai trò sau đổi trạng thái.', type: RoleDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async updateStatus(@Req() request: RequestWithContext, @Param() params: RoleIdParamDto, @Body() input: UpdateRoleStatusDto) { return dataResponse(await this.service.updateStatus(request, params.id, input.isActive)); }

  @Delete(':id')
  @RequirePermissions('ROLE.DELETE')
  @ApiOperation({ summary: 'Xóa vai trò', description: 'Yêu cầu quyền: ROLE.DELETE. Không xóa được role hệ thống hoặc role đang được User gán.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của vai trò.', example: '66d0f0b74d5b5d4e65e75123' })
  @ApiOkResponse({ description: 'Trả id vai trò đã xóa.', type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async remove(@Req() request: RequestWithContext, @Param() params: RoleIdParamDto) {
    await this.service.remove(request, params.id);
    return dataResponse({ id: params.id });
  }
}
