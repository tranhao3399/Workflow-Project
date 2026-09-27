import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { ApplyDepartmentJobTitlesDto, CreateDepartmentDto, DepartmentIdParamDto, DepartmentJobTitleIdParamDto, ListDepartmentsDto, RemoveDepartmentPositionsDto, UpdateDepartmentStatusDto, UpdateDepartmentDto } from './dto/department.dto.js';
import { dataResponse } from '../common/http/api-response.js';
import { DepartmentsService } from './departments.service.js';

@Controller('departments') @UseGuards(JwtAuthGuard, PermissionGuard)
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}
  @Get() @RequirePermissions('DEPARTMENT.VIEW') findAll(@Query() query: ListDepartmentsDto) { return this.service.findAll(query); }
  @Get(':id/positions') @RequirePermissions('DEPARTMENT.VIEW') findPositions(@Param() params: DepartmentIdParamDto) { return this.service.findPositions(params.id); }
  @Post(':id/positions') @RequirePermissions('DEPARTMENT.MANAGE_POSITIONS') async applyPositions(@Req() request: RequestWithContext, @Param() params: DepartmentIdParamDto, @Body() input: ApplyDepartmentJobTitlesDto) { return dataResponse(await this.service.applyPositions(request, params.id, input.jobTitleIds)); }
  @Delete(':id/positions') @RequirePermissions('DEPARTMENT.MANAGE_POSITIONS') async removePositions(@Req() request: RequestWithContext, @Param() params: DepartmentIdParamDto, @Body() input: RemoveDepartmentPositionsDto) { return dataResponse(await this.service.removePositions(request, params.id, input.assignmentIds)); }
  @Delete(':id/positions/:assignmentId') @RequirePermissions('DEPARTMENT.MANAGE_POSITIONS') async removePosition(@Req() request: RequestWithContext, @Param() params: DepartmentJobTitleIdParamDto) { return dataResponse(await this.service.removePosition(request, params.id, params.assignmentId)); }
  @Patch(':id/status') @RequirePermissions('DEPARTMENT.UPDATE') async updateStatus(@Req() request: RequestWithContext, @Param() params: DepartmentIdParamDto, @Body() input: UpdateDepartmentStatusDto) { return dataResponse(await this.service.update(request, params.id, { isActive: input.isActive })); }
  @Get(':id') @RequirePermissions('DEPARTMENT.VIEW') async findOne(@Param() params: DepartmentIdParamDto) { return dataResponse(await this.service.findOne(params.id)); }
  @Post() @RequirePermissions('DEPARTMENT.CREATE') async create(@Req() request: RequestWithContext, @Body() input: CreateDepartmentDto) { return dataResponse(await this.service.create(request, input)); }
  @Patch(':id') @RequirePermissions('DEPARTMENT.UPDATE') async update(@Req() request: RequestWithContext, @Param() params: DepartmentIdParamDto, @Body() input: UpdateDepartmentDto) { return dataResponse(await this.service.update(request, params.id, input)); }
  @Delete(':id') @RequirePermissions('DEPARTMENT.DELETE') async remove(@Req() request: RequestWithContext, @Param() params: DepartmentIdParamDto) { return dataResponse(await this.service.remove(request, params.id)); }
}
