import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { dataResponse } from '../common/http/api-response.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreatePositionDto, ListPositionsDto, PositionIdParamDto, UpdatePositionDto } from './dto/position.dto.js';
import { PositionsService } from './positions.service.js';

@Controller('positions')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PositionsController {
  constructor(private readonly service: PositionsService) {}

  @Get() @RequirePermissions('POSITION.VIEW') findAll(@Query() query: ListPositionsDto) { return this.service.findAll(query); }
  @Get(':id') @RequirePermissions('POSITION.VIEW') async findOne(@Param() params: PositionIdParamDto) { return dataResponse(await this.service.findOne(params.id)); }
  @Post() @RequirePermissions('POSITION.CREATE') async create(@Req() request: RequestWithContext, @Body() input: CreatePositionDto) { return dataResponse(await this.service.create(request, input)); }
  @Patch(':id') @RequirePermissions('POSITION.UPDATE') async update(@Req() request: RequestWithContext, @Param() params: PositionIdParamDto, @Body() input: UpdatePositionDto) { return dataResponse(await this.service.update(request, params.id, input)); }
}
