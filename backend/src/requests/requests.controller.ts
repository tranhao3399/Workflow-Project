import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
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
  CreateRequestDto,
  ListRequestsDto,
  RequestIdParamDto,
  RequestReasonDto,
  RequestResponseDto,
  UpdateRequestDto,
  requestStatusGroups,
} from './dto/request.dto.js';
import { RequestsService } from './requests.service.js';

@Controller('requests')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Requests')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Get('available-forms')
  @RequirePermissions('REQUESTS.CREATE')
  @ApiOperation({ summary: 'Danh sách biểu mẫu có thể tạo phiếu' })
  @ApiOkResponse({ type: ApiDataResponseDto })
  async availableForms() {
    return dataResponse(await this.service.availableForms());
  }

  @Get('all')
  @RequirePermissions('REQUESTS.VIEW_ALL')
  @ApiOperation({ summary: 'Danh sách tất cả phiếu yêu cầu' })
  @ApiOkResponse({ description: 'Danh sách có phân trang.', type: Object })
  @ApiQuery({ name: 'statusGroup', required: false, enum: requestStatusGroups })
  @ApiValidationError()
  findAll(@Query() query: ListRequestsDto) {
    return this.service.findAll(query);
  }

  @Get()
  @RequirePermissions('REQUESTS.VIEW_OWN')
  @ApiOperation({ summary: 'Danh sách phiếu của người gọi' })
  @ApiOkResponse({ description: 'Danh sách có phân trang.', type: Object })
  @ApiQuery({ name: 'statusGroup', required: false, enum: requestStatusGroups })
  @ApiValidationError()
  findOwn(@Req() request: RequestWithContext, @Query() query: ListRequestsDto) {
    return this.service.findOwn(this.userId(request), query);
  }

  @Get(':id/history')
  @RequirePermissions({ any: ['REQUESTS.VIEW_OWN', 'APPROVALS.VIEW_ASSIGNED', 'REQUESTS.VIEW_ALL'] })
  @ApiOperation({ summary: 'Lịch sử xử lý phiếu' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của phiếu.' })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async history(@Req() request: RequestWithContext, @Param() params: RequestIdParamDto) {
    return dataResponse(await this.service.history(
      this.userId(request),
      params.id,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Get(':id')
  @RequirePermissions({ any: ['REQUESTS.VIEW_OWN', 'APPROVALS.VIEW_ASSIGNED', 'REQUESTS.VIEW_ALL'] })
  @ApiOperation({ summary: 'Chi tiết phiếu yêu cầu' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của phiếu.' })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceNotFound()
  @ApiValidationError()
  async findOne(@Req() request: RequestWithContext, @Param() params: RequestIdParamDto) {
    return dataResponse(await this.service.findOne(
      this.userId(request),
      params.id,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post()
  @RequirePermissions('REQUESTS.CREATE')
  @ApiOperation({ summary: 'Tạo phiếu DRAFT' })
  @ApiBody({ type: CreateRequestDto })
  @ApiCreatedResponse({ type: RequestResponseDto })
  @ApiResourceConflict()
  @ApiValidationError()
  async create(@Req() request: RequestWithContext, @Body() input: CreateRequestDto) {
    return dataResponse(await this.service.create(
      request,
      this.userId(request),
      input,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post(':id/recreate')
  @HttpCode(200)
  @RequirePermissions('REQUESTS.CREATE')
  @ApiOperation({ summary: 'Tạo phiếu DRAFT mới từ một bản nháp dùng Definition cũ' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của phiếu nháp nguồn.' })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async recreate(@Req() request: RequestWithContext, @Param() params: RequestIdParamDto) {
    return dataResponse(await this.service.recreateFromDraft(
      request,
      this.userId(request),
      params.id,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Patch(':id')
  @RequirePermissions('REQUESTS.UPDATE_OWN_DRAFT')
  @ApiOperation({ summary: 'Cập nhật dữ liệu phiếu chưa hoàn tất' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của phiếu.' })
  @ApiBody({ type: UpdateRequestDto })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async update(
    @Req() request: RequestWithContext,
    @Param() params: RequestIdParamDto,
    @Body() input: UpdateRequestDto,
  ) {
    return dataResponse(await this.service.update(
      request,
      this.userId(request),
      params.id,
      input,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermissions('REQUESTS.SUBMIT')
  @ApiOperation({ summary: 'Gửi phiếu DRAFT vào Workflow' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của phiếu.' })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async submit(@Req() request: RequestWithContext, @Param() params: RequestIdParamDto) {
    return dataResponse(await this.service.submit(
      request,
      this.userId(request),
      params.id,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post(':id/resubmit')
  @HttpCode(200)
  @RequirePermissions('REQUESTS.SUBMIT')
  @ApiOperation({ summary: 'Gửi lại phiếu đã được yêu cầu chỉnh sửa' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của phiếu.' })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async resubmit(@Req() request: RequestWithContext, @Param() params: RequestIdParamDto) {
    return dataResponse(await this.service.resubmit(
      request,
      this.userId(request),
      params.id,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('REQUESTS.CANCEL_OWN')
  @ApiOperation({ summary: 'Hủy phiếu của người gọi' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của phiếu.' })
  @ApiBody({ type: RequestReasonDto })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async cancel(
    @Req() request: RequestWithContext,
    @Param() params: RequestIdParamDto,
    @Body() input: RequestReasonDto,
  ) {
    return dataResponse(await this.service.cancel(
      request,
      this.userId(request),
      params.id,
      input.reason,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermissions('REQUESTS.VOID')
  @ApiOperation({ summary: 'Vô hiệu hóa phiếu' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của phiếu.' })
  @ApiBody({ type: RequestReasonDto })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async voidRequest(
    @Req() request: RequestWithContext,
    @Param() params: RequestIdParamDto,
    @Body() input: RequestReasonDto,
  ) {
    return dataResponse(await this.service.voidRequest(
      request,
      this.userId(request),
      params.id,
      input.reason,
      request.effectivePermissionKeys ?? [],
    ));
  }

  @Delete(':id')
  @RequirePermissions('REQUESTS.DELETE_OWN_DRAFT')
  @ApiOperation({ summary: 'Xóa phiếu DRAFT chưa từng gửi' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của phiếu.' })
  @ApiOkResponse({ type: ApiDataResponseDto })
  @ApiResourceConflict()
  @ApiResourceNotFound()
  @ApiValidationError()
  async remove(@Req() request: RequestWithContext, @Param() params: RequestIdParamDto) {
    return dataResponse(await this.service.remove(request, this.userId(request), params.id));
  }

  private userId(request: RequestWithContext): string {
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Không thể xác định người dùng hiện tại.');
    return userId;
  }
}
