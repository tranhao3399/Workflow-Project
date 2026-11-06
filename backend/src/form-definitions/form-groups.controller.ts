import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { dataResponse } from '../common/http/api-response.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreateFormGroupDto, FormGroupIdParamDto, UpdateFormGroupDto } from './dto/form-group.dto.js';
import { FormGroupsService } from './form-groups.service.js';

@Controller('form-groups')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Form Builder - Nhóm biểu mẫu')
@ApiBearerAuth('access-token')
export class FormGroupsController {
  constructor(private readonly service: FormGroupsService) {}

  @Get()
  @RequirePermissions('FORM_BUILDER.VIEW')
  @ApiOperation({ summary: 'Danh sách nhóm biểu mẫu' })
  async findAll() {
    return dataResponse(await this.service.findAll());
  }

  @Post()
  @RequirePermissions('FORM_BUILDER.CREATE')
  @ApiOperation({ summary: 'Tạo nhóm biểu mẫu' })
  async create(@Req() request: RequestWithContext, @Body() input: CreateFormGroupDto) {
    return dataResponse(await this.service.create(request, input));
  }

  @Patch(':id')
  @RequirePermissions('FORM_BUILDER.UPDATE')
  @ApiOperation({ summary: 'Cập nhật nhóm biểu mẫu' })
  async update(
    @Req() request: RequestWithContext,
    @Param() params: FormGroupIdParamDto,
    @Body() input: UpdateFormGroupDto,
  ) {
    return dataResponse(await this.service.update(request, params.id, input));
  }

  @Delete(':id')
  @RequirePermissions('FORM_BUILDER.DELETE_DRAFT')
  @ApiOperation({ summary: 'Xóa nhóm biểu mẫu không có biểu mẫu' })
  async remove(@Req() request: RequestWithContext, @Param() params: FormGroupIdParamDto) {
    return dataResponse(await this.service.remove(request, params.id));
  }
}
