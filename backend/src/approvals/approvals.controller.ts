import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
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
  ApprovalTaskIdParamDto,
  ApproveTaskDto,
  ListApprovalInboxDto,
  ReassignApprovalTaskDto,
  RequiredDecisionCommentDto,
} from './dto/approval.dto.js';
import { ApprovalsService } from './approvals.service.js';

@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Approvals')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get('inbox')
  @RequirePermissions('APPROVALS.VIEW_ASSIGNED')
  @ApiOperation({ summary: 'Hộp task phê duyệt của người gọi' })
  @ApiOkResponse({ description: 'Danh sách task có phân trang.', type: Object })
  @ApiValidationError()
  inbox(@Req() request: RequestWithContext, @Query() query: ListApprovalInboxDto) {
    return this.service.inbox(this.userId(request), query);
  }

  @Get('tasks/:id')
  @RequirePermissions({ any: ['APPROVALS.VIEW_ASSIGNED', 'REQUESTS.VIEW_ALL'] })
  @ApiOperation({ summary: 'Chi tiết task phê duyệt' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của task.' })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async findOne(@Req() request: RequestWithContext, @Param() params: ApprovalTaskIdParamDto) {
    return dataResponse(await this.service.findOne(
      this.userId(request),
      params.id,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post('tasks/:id/approve')
  @HttpCode(200)
  @RequirePermissions('APPROVALS.APPROVE_ASSIGNED')
  @ApiOperation({ summary: 'Phê duyệt task được giao' })
  @ApiBody({ type: ApproveTaskDto })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async approve(
    @Req() request: RequestWithContext,
    @Param() params: ApprovalTaskIdParamDto,
    @Body() input: ApproveTaskDto,
  ) {
    return dataResponse(await this.service.approve(
      request,
      this.userId(request),
      params.id,
      input.comment,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post('tasks/:id/reject')
  @HttpCode(200)
  @RequirePermissions('APPROVALS.APPROVE_ASSIGNED')
  @ApiOperation({ summary: 'Từ chối task được giao' })
  @ApiBody({ type: RequiredDecisionCommentDto })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async reject(
    @Req() request: RequestWithContext,
    @Param() params: ApprovalTaskIdParamDto,
    @Body() input: RequiredDecisionCommentDto,
  ) {
    return dataResponse(await this.service.reject(
      request,
      this.userId(request),
      params.id,
      input.comment,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post('tasks/:id/request-revision')
  @HttpCode(200)
  @RequirePermissions('APPROVALS.APPROVE_ASSIGNED')
  @ApiOperation({ summary: 'Yêu cầu người gửi chỉnh sửa phiếu' })
  @ApiBody({ type: RequiredDecisionCommentDto })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async requestRevision(
    @Req() request: RequestWithContext,
    @Param() params: ApprovalTaskIdParamDto,
    @Body() input: RequiredDecisionCommentDto,
  ) {
    return dataResponse(await this.service.requestRevision(
      request,
      this.userId(request),
      params.id,
      input.comment,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post('tasks/:id/reassign')
  @HttpCode(200)
  @RequirePermissions('APPROVALS.REASSIGN')
  @ApiOperation({ summary: 'Chuyển task cho người phê duyệt khác' })
  @ApiBody({ type: ReassignApprovalTaskDto })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async reassign(
    @Req() request: RequestWithContext,
    @Param() params: ApprovalTaskIdParamDto,
    @Body() input: ReassignApprovalTaskDto,
  ) {
    return dataResponse(await this.service.reassign(
      request,
      this.userId(request),
      params.id,
      input.newAssigneeUserId,
      input.reason,
      request.effectivePermissionKeys ?? [],
    ));
  }

  private userId(request: RequestWithContext): string {
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Không thể xác định người dùng hiện tại.');
    return userId;
  }
}
