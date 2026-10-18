import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequireBodyPermissions, RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreateJobTitleDto, ListPositionsDto, PositionIdParamDto, UpdateJobTitleDto, UpdateJobTitleStatusDto } from './dto/position.dto.js';
import { PositionsService } from './positions.service.js';
import { dataResponse } from '../common/http/api-response.js';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiDataResponseDto, ApiResourceConflict, ApiResourceNotFound, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('job-titles')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Chức danh')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class JobTitlesController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @RequirePermissions('JOB_TITLE.VIEW')
  @ApiOperation({ summary: 'Danh sách chức danh', description: 'Yêu cầu quyền: JOB_TITLE.VIEW.' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'departmentId', required: false, description: 'MongoDB ObjectId phòng ban.' })
  @ApiOkResponse({ description: 'Danh sách chức danh.', type: [Object] })
  @ApiValidationError()
  findAll(@Query() query: ListPositionsDto) {
    return this.positions.findCatalog(query);
  }

  @Get(':id')
  @RequirePermissions('JOB_TITLE.VIEW')
  @ApiOperation({ summary: 'Chi tiết chức danh', description: 'Yêu cầu quyền: JOB_TITLE.VIEW.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của chức danh.' })
  @ApiOkResponse({ description: 'Chi tiết chức danh.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async findOne(@Param() params: PositionIdParamDto) { return dataResponse(await this.positions.findCatalogOne(params.id)); }

  @Post()
  @RequirePermissions('JOB_TITLE.CREATE')
  @ApiOperation({ summary: 'Tạo chức danh', description: 'Yêu cầu quyền: JOB_TITLE.CREATE.' })
  @ApiBody({ type: CreateJobTitleDto })
  @ApiCreatedResponse({ description: 'Tạo chức danh thành công.', type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiValidationError()
  async create(@Req() request: RequestWithContext, @Body() input: CreateJobTitleDto) { return dataResponse(await this.positions.createCatalog(request, input)); }

  @Patch(':id')
  @RequirePermissions('JOB_TITLE.UPDATE')
  @RequireBodyPermissions({ isActive: 'JOB_TITLE.CHANGE_STATUS' })
  @ApiOperation({ summary: 'Cập nhật chức danh', description: 'Yêu cầu quyền: JOB_TITLE.UPDATE. Sửa isActive cần JOB_TITLE.CHANGE_STATUS.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của chức danh.' })
  @ApiBody({ type: UpdateJobTitleDto })
  @ApiOkResponse({ description: 'Chức danh sau cập nhật.', type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async update(@Req() request: RequestWithContext, @Param() params: PositionIdParamDto, @Body() input: UpdateJobTitleDto) { return dataResponse(await this.positions.updateCatalog(request, params.id, input)); }

  @Patch(':id/status')
  @RequirePermissions('JOB_TITLE.CHANGE_STATUS')
  @ApiOperation({ summary: 'Đổi trạng thái chức danh', description: 'Yêu cầu quyền: JOB_TITLE.CHANGE_STATUS.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của chức danh.' })
  @ApiBody({ type: UpdateJobTitleStatusDto })
  @ApiOkResponse({ description: 'Chức danh sau đổi trạng thái.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async updateStatus(@Req() request: RequestWithContext, @Param() params: PositionIdParamDto, @Body() input: UpdateJobTitleStatusDto) { return dataResponse(await this.positions.updateCatalog(request, params.id, { isActive: input.isActive })); }

  @Delete(':id')
  @RequirePermissions('JOB_TITLE.DELETE')
  @ApiOperation({ summary: 'Xóa chức danh', description: 'Yêu cầu quyền: JOB_TITLE.DELETE.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của chức danh.' })
  @ApiOkResponse({ description: 'Kết quả xóa chức danh.', type: ApiDataResponseDto })
  @ApiResourceConflict('Không thể xóa chức danh đang được tham chiếu.')
  @ApiResourceNotFound()
  @ApiValidationError()
  async remove(@Req() request: RequestWithContext, @Param() params: PositionIdParamDto) { return dataResponse(await this.positions.removeCatalog(request, params.id)); }
}
