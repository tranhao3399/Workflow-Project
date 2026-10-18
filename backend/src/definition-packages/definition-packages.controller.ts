import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { dataResponse } from '../common/http/api-response.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import {
  ApiAuthenticationErrors,
  ApiErrorResponseDto,
  ApiResourceNotFound,
  ApiValidationError,
} from '../common/http/swagger-response.dto.js';
import { DefinitionPublishingService } from './definition-publishing.service.js';
import {
  DefinitionPackageDto,
  DefinitionPackageResponseDto,
  PublishDefinitionPackageDto,
} from './dto/definition-package.dto.js';

@Controller('definition-packages')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Definition Packages')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class DefinitionPackagesController {
  constructor(private readonly service: DefinitionPublishingService) {}

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('WORKFLOW_BUILDER.PUBLISH')
  @ApiOperation({
    summary: 'Xuất bản Form–Workflow hoặc chỉ Workflow',
    description: 'Workflow-only cần WORKFLOW_BUILDER.PUBLISH; full package cần thêm FORM_BUILDER.PUBLISH.',
  })
  @ApiBody({ type: PublishDefinitionPackageDto })
  @ApiOkResponse({ description: 'Gói Form–Workflow đã được xuất bản.', type: DefinitionPackageResponseDto })
  @ApiConflictResponse({ description: 'Trạng thái không phù hợp hoặc có thao tác publish đồng thời.', type: ApiErrorResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async publish(@Req() request: RequestWithContext, @Body() input: PublishDefinitionPackageDto) {
    return dataResponse(await this.service.publish(request, input));
  }

  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ all: ['FORM_BUILDER.CHANGE_STATUS', 'WORKFLOW_BUILDER.CHANGE_STATUS'] })
  @ApiOperation({
    summary: 'Ngưng hoạt động gói Form–Workflow',
    description: 'Yêu cầu đồng thời FORM_BUILDER.CHANGE_STATUS và WORKFLOW_BUILDER.CHANGE_STATUS.',
  })
  @ApiBody({ type: DefinitionPackageDto })
  @ApiOkResponse({ description: 'Gói Form–Workflow đã ngưng hoạt động.', type: DefinitionPackageResponseDto })
  @ApiConflictResponse({ description: 'Gói không ở trạng thái PUBLISHED hoặc trạng thái cặp không đồng bộ.', type: ApiErrorResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async deactivate(@Req() request: RequestWithContext, @Body() input: DefinitionPackageDto) {
    return dataResponse(await this.service.deactivate(request, input));
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ all: ['FORM_BUILDER.CHANGE_STATUS', 'WORKFLOW_BUILDER.CHANGE_STATUS'] })
  @ApiOperation({
    summary: 'Kích hoạt lại gói Form–Workflow',
    description: 'Gói ARCHIVED không thể kích hoạt lại.',
  })
  @ApiBody({ type: DefinitionPackageDto })
  @ApiOkResponse({ description: 'Gói Form–Workflow đã được kích hoạt lại.', type: DefinitionPackageResponseDto })
  @ApiConflictResponse({ description: 'Gói không thể kích hoạt lại hoặc đã có phiên bản khác đang được xuất bản.', type: ApiErrorResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async reactivate(@Req() request: RequestWithContext, @Body() input: DefinitionPackageDto) {
    return dataResponse(await this.service.reactivate(request, input));
  }

  @Post('archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions({ all: ['FORM_BUILDER.CHANGE_STATUS', 'WORKFLOW_BUILDER.CHANGE_STATUS'] })
  @ApiOperation({
    summary: 'Lưu trữ gói Form–Workflow',
    description: 'ARCHIVED là trạng thái kết thúc và không thể kích hoạt lại.',
  })
  @ApiBody({ type: DefinitionPackageDto })
  @ApiOkResponse({ description: 'Gói Form–Workflow đã được lưu trữ.', type: DefinitionPackageResponseDto })
  @ApiConflictResponse({ description: 'Trạng thái cặp không phù hợp hoặc không đồng bộ.', type: ApiErrorResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async archive(@Req() request: RequestWithContext, @Body() input: DefinitionPackageDto) {
    return dataResponse(await this.service.archive(request, input));
  }
}
