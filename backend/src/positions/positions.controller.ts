import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { dataResponse } from '../common/http/api-response.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreatePositionDto, ListPositionsDto, PositionIdParamDto, UpdatePositionDto } from './dto/position.dto.js';
import { PositionsService } from './positions.service.js';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiDataResponseDto, ApiResourceConflict, ApiResourceNotFound, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('positions')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Vị trí')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class PositionsController {
  constructor(private readonly service: PositionsService) {}

  @Get() @RequirePermissions('POSITION.VIEW') @ApiOperation({ summary: 'Danh sách vị trí', description: 'Yêu cầu quyền: POSITION.VIEW.' }) @ApiQuery({ name: 'active', required: false, type: Boolean }) @ApiQuery({ name: 'isActive', required: false, type: Boolean }) @ApiQuery({ name: 'departmentId', required: false }) @ApiOkResponse({ description: 'Danh sách vị trí.', type: [Object] }) @ApiValidationError() findAll(@Query() query: ListPositionsDto) { return this.service.findAll(query); }
  @Get(':id') @RequirePermissions('POSITION.VIEW') @ApiOperation({ summary: 'Chi tiết vị trí', description: 'Yêu cầu quyền: POSITION.VIEW.' }) @ApiParam({ name: 'id', description: 'MongoDB ObjectId của vị trí.' }) @ApiOkResponse({ description: 'Chi tiết vị trí.', type: ApiDataResponseDto }) @ApiResourceNotFound() @ApiValidationError() async findOne(@Param() params: PositionIdParamDto) { return dataResponse(await this.service.findOne(params.id)); }
  @Post() @RequirePermissions('POSITION.CREATE') @ApiOperation({ summary: 'Tạo vị trí', description: 'Yêu cầu quyền: POSITION.CREATE.' }) @ApiBody({ type: CreatePositionDto }) @ApiCreatedResponse({ description: 'Tạo vị trí thành công.', type: ApiDataResponseDto }) @ApiResourceConflict() @ApiValidationError() async create(@Req() request: RequestWithContext, @Body() input: CreatePositionDto) { return dataResponse(await this.service.create(request, input)); }
  @Patch(':id') @RequirePermissions('POSITION.UPDATE') @ApiOperation({ summary: 'Cập nhật vị trí', description: 'Yêu cầu quyền: POSITION.UPDATE.' }) @ApiParam({ name: 'id', description: 'MongoDB ObjectId của vị trí.' }) @ApiBody({ type: UpdatePositionDto }) @ApiOkResponse({ description: 'Vị trí sau cập nhật.', type: ApiDataResponseDto }) @ApiResourceConflict() @ApiResourceNotFound() @ApiValidationError() async update(@Req() request: RequestWithContext, @Param() params: PositionIdParamDto, @Body() input: UpdatePositionDto) { return dataResponse(await this.service.update(request, params.id, input)); }
}
