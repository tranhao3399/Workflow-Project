import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { dataResponse } from '../common/http/api-response.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import {
  ApiAuthenticationErrors,
  ApiDataResponseDto,
  ApiResourceConflict,
  ApiResourceNotFound,
  ApiValidationError,
} from '../common/http/swagger-response.dto.js';
import {
  CloneFormDefinitionDto,
  CreateFormDefinitionDto,
  DynamicFormValidationResponseDto,
  FormDefinitionIdParamDto,
  FormDefinitionResponseDto,
  ListFormDefinitionsDto,
  UpdateFormDefinitionDto,
  ValidateDynamicFormDto,
  formDefinitionSortFields,
} from './dto/form-definition.dto.js';
import { FormDefinitionsService } from './form-definitions.service.js';
import { definitionStatuses } from './schemas/form-definition.schema.js';

@Controller('form-definitions')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Form Builder')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class FormDefinitionsController {
  constructor(private readonly service: FormDefinitionsService) {}

  @Get()
  @RequirePermissions('FORM_BUILDER.VIEW')
  @ApiOperation({ summary: 'Danh sách biểu mẫu', description: 'Yêu cầu quyền: FORM_BUILDER.VIEW.' })
  @ApiQuery({ name: 'search', required: false, description: 'Tìm theo mã hoặc tên.' })
  @ApiQuery({ name: 'status', required: false, enum: definitionStatuses })
  @ApiQuery({ name: 'sortBy', required: false, enum: formDefinitionSortFields })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Danh sách biểu mẫu có phân trang.', type: Object })
  @ApiValidationError()
  findAll(@Query() query: ListFormDefinitionsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('FORM_BUILDER.VIEW')
  @ApiOperation({ summary: 'Chi tiết biểu mẫu', description: 'Yêu cầu quyền: FORM_BUILDER.VIEW.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của biểu mẫu.' })
  @ApiOkResponse({ description: 'Chi tiết biểu mẫu.', type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async findOne(@Param() params: FormDefinitionIdParamDto) {
    return dataResponse(await this.service.findOne(params.id));
  }

  @Post()
  @RequirePermissions('FORM_BUILDER.CREATE')
  @ApiOperation({ summary: 'Tạo biểu mẫu DRAFT', description: 'Yêu cầu quyền: FORM_BUILDER.CREATE. Version đầu tiên luôn là 1.' })
  @ApiBody({ type: CreateFormDefinitionDto })
  @ApiCreatedResponse({ description: 'Biểu mẫu DRAFT vừa tạo.', type: FormDefinitionResponseDto })
  @ApiResourceConflict()
  @ApiValidationError()
  async create(@Req() request: RequestWithContext, @Body() input: CreateFormDefinitionDto) {
    return dataResponse(await this.service.create(request, input));
  }

  @Patch(':id')
  @RequirePermissions('FORM_BUILDER.UPDATE')
  @ApiOperation({ summary: 'Cập nhật biểu mẫu DRAFT', description: 'Yêu cầu quyền: FORM_BUILDER.UPDATE. Không sửa trực tiếp bản PUBLISHED.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của biểu mẫu.' })
  @ApiBody({ type: UpdateFormDefinitionDto })
  @ApiOkResponse({ description: 'Biểu mẫu sau cập nhật.', type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async update(
    @Req() request: RequestWithContext,
    @Param() params: FormDefinitionIdParamDto,
    @Body() input: UpdateFormDefinitionDto,
  ) {
    return dataResponse(await this.service.update(request, params.id, input));
  }

  @Post(':id/validate')
  @RequirePermissions('FORM_BUILDER.VIEW')
  @ApiOperation({ summary: 'Validate dữ liệu động', description: 'Backend kiểm tra formData theo đúng Form Definition, không tin validation frontend.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của biểu mẫu.' })
  @ApiBody({ type: ValidateDynamicFormDto })
  @ApiOkResponse({ description: 'Kết quả validation.', type: DynamicFormValidationResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async validate(@Param() params: FormDefinitionIdParamDto, @Body() input: ValidateDynamicFormDto) {
    return dataResponse(await this.service.validate(params.id, input.formData));
  }

  @Post(':id/clone')
  @RequirePermissions('FORM_BUILDER.CREATE')
  @ApiOperation({ summary: 'Clone biểu mẫu thành version mới', description: 'Yêu cầu quyền: FORM_BUILDER.CREATE. Bản clone luôn là DRAFT và giữ previousVersionId.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của biểu mẫu nguồn.' })
  @ApiBody({ type: CloneFormDefinitionDto })
  @ApiCreatedResponse({ description: 'Version DRAFT mới.', type: FormDefinitionResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async clone(
    @Req() request: RequestWithContext,
    @Param() params: FormDefinitionIdParamDto,
    @Body() input: CloneFormDefinitionDto,
  ) {
    return dataResponse(await this.service.clone(request, params.id, input));
  }

  @Delete(':id')
  @RequirePermissions('FORM_BUILDER.DELETE_DRAFT')
  @ApiOperation({ summary: 'Xóa biểu mẫu DRAFT', description: 'Yêu cầu quyền: FORM_BUILDER.DELETE_DRAFT. Không xóa biểu mẫu đang được Workflow hoặc Request tham chiếu.' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của biểu mẫu.' })
  @ApiOkResponse({ description: 'Id biểu mẫu đã xóa.', type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async remove(
    @Req() request: RequestWithContext,
    @Param() params: FormDefinitionIdParamDto,
  ) {
    return dataResponse(await this.service.remove(request, params.id));
  }
}
