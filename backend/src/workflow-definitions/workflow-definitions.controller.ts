import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { dataResponse } from '../common/http/api-response.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { ApiAuthenticationErrors, ApiDataResponseDto, ApiResourceConflict, ApiResourceNotFound, ApiValidationError } from '../common/http/swagger-response.dto.js';
import { definitionStatuses } from '../form-definitions/schemas/form-definition.schema.js';
import {
  CloneWorkflowDefinitionDto,
  CreateWorkflowDefinitionDto,
  ListWorkflowDefinitionsDto,
  UpdateWorkflowDefinitionDto,
  ValidateWorkflowDefinitionDto,
  WorkflowDefinitionIdParamDto,
  WorkflowDefinitionResponseDto,
  WorkflowGraphValidationResponseDto,
  workflowDefinitionSortFields,
} from './dto/workflow-definition.dto.js';
import { WorkflowDefinitionsService } from './workflow-definitions.service.js';

@Controller('workflow-definitions')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Workflow Builder')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class WorkflowDefinitionsController {
  constructor(private readonly service: WorkflowDefinitionsService) {}

  @Get()
  @RequirePermissions('WORKFLOW_BUILDER.VIEW')
  @ApiOperation({ summary: 'Danh sách Workflow Definition' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: definitionStatuses })
  @ApiQuery({ name: 'formDefinitionId', required: false })
  @ApiQuery({ name: 'sortBy', required: false, enum: workflowDefinitionSortFields })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: Object })
  @ApiValidationError()
  findAll(@Query() query: ListWorkflowDefinitionsDto) { return this.service.findAll(query); }

  @Get('reference-data')
  @RequirePermissions('WORKFLOW_BUILDER.VIEW')
  @ApiOperation({ summary: 'Dữ liệu tham chiếu cho Workflow Builder' })
  @ApiOkResponse({ type: Object })
  referenceData() { return this.service.referenceData(); }

  @Get(':id')
  @RequirePermissions('WORKFLOW_BUILDER.VIEW')
  @ApiOperation({ summary: 'Chi tiết Workflow Definition' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: WorkflowDefinitionResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async findOne(@Param() params: WorkflowDefinitionIdParamDto) { return dataResponse(await this.service.findOne(params.id)); }

  @Post()
  @RequirePermissions('WORKFLOW_BUILDER.CREATE')
  @ApiOperation({ summary: 'Tạo Workflow DRAFT', description: 'Workflow có thể liên kết Form DRAFT hoặc Form PUBLISHED.' })
  @ApiBody({ type: CreateWorkflowDefinitionDto })
  @ApiCreatedResponse({ type: WorkflowDefinitionResponseDto })
  @ApiResourceConflict()
  @ApiValidationError()
  async create(@Req() request: RequestWithContext, @Body() input: CreateWorkflowDefinitionDto) { return dataResponse(await this.service.create(request, input)); }

  @Patch(':id')
  @RequirePermissions('WORKFLOW_BUILDER.UPDATE')
  @ApiOperation({ summary: 'Cập nhật Workflow DRAFT' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateWorkflowDefinitionDto })
  @ApiOkResponse({ type: WorkflowDefinitionResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async update(@Req() request: RequestWithContext, @Param() params: WorkflowDefinitionIdParamDto, @Body() input: UpdateWorkflowDefinitionDto) { return dataResponse(await this.service.update(request, params.id, input)); }

  @Post(':id/validate')
  @RequirePermissions('WORKFLOW_BUILDER.VIEW')
  @ApiOperation({ summary: 'Biên dịch và kiểm tra BPMN XML cùng graph Workflow' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: ValidateWorkflowDefinitionDto, required: false })
  @ApiOkResponse({ type: WorkflowGraphValidationResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async validate(@Param() params: WorkflowDefinitionIdParamDto, @Body() input: ValidateWorkflowDefinitionDto) { return dataResponse(await this.service.validate(params.id, input)); }

  @Post(':id/clone')
  @RequirePermissions('WORKFLOW_BUILDER.CREATE')
  @ApiOperation({ summary: 'Clone Workflow thành version DRAFT mới', description: 'Có thể giữ Form PUBLISHED hiện tại hoặc chọn Form DRAFT của full package mới.' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: CloneWorkflowDefinitionDto })
  @ApiCreatedResponse({ type: WorkflowDefinitionResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async clone(@Req() request: RequestWithContext, @Param() params: WorkflowDefinitionIdParamDto, @Body() input: CloneWorkflowDefinitionDto) { return dataResponse(await this.service.clone(request, params.id, input)); }

  @Delete(':id')
  @RequirePermissions('WORKFLOW_BUILDER.DELETE_DRAFT')
  @ApiOperation({ summary: 'Xóa Workflow DRAFT' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async remove(@Req() request: RequestWithContext, @Param() params: WorkflowDefinitionIdParamDto) { return dataResponse(await this.service.remove(request, params.id)); }
}
