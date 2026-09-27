import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequireBodyPermissions, RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreateJobTitleDto, ListPositionsDto, PositionIdParamDto, UpdateJobTitleDto } from './dto/position.dto.js';
import { PositionsService } from './positions.service.js';
import { dataResponse } from '../common/http/api-response.js';

/** Read-only catalog endpoint for department-to-job-title assignment. */
@Controller('job-titles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class JobTitlesController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @RequirePermissions('JOB_TITLE.VIEW')
  findAll(@Query() query: ListPositionsDto) {
    return this.positions.findCatalog(query);
  }

  @Get(':id')
  @RequirePermissions('JOB_TITLE.VIEW')
  async findOne(@Param() params: PositionIdParamDto) { return dataResponse(await this.positions.findCatalogOne(params.id)); }

  @Post()
  @RequirePermissions('JOB_TITLE.CREATE')
  async create(@Req() request: RequestWithContext, @Body() input: CreateJobTitleDto) { return dataResponse(await this.positions.createCatalog(request, input)); }

  @Patch(':id')
  @RequirePermissions('JOB_TITLE.UPDATE')
  @RequireBodyPermissions({ isActive: 'JOB_TITLE.CHANGE_STATUS' })
  async update(@Req() request: RequestWithContext, @Param() params: PositionIdParamDto, @Body() input: UpdateJobTitleDto) { return dataResponse(await this.positions.updateCatalog(request, params.id, input)); }

  @Patch(':id/status')
  @RequirePermissions('JOB_TITLE.CHANGE_STATUS')
  async updateStatus(@Req() request: RequestWithContext, @Param() params: PositionIdParamDto, @Body() input: UpdateJobTitleDto) { return dataResponse(await this.positions.updateCatalog(request, params.id, { isActive: input.isActive })); }

  @Delete(':id')
  @RequirePermissions('JOB_TITLE.DELETE')
  async remove(@Req() request: RequestWithContext, @Param() params: PositionIdParamDto) { return dataResponse(await this.positions.removeCatalog(request, params.id)); }
}
