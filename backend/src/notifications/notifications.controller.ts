import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { dataResponse } from '../common/http/api-response.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreateNotificationDto, ListNotificationsDto, NotificationIdParamDto, UpdateNotificationReadDto } from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiDataResponseDto, ApiResourceNotFound, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiTags('Thông báo')
@ApiBearerAuth('access-token')
@ApiAuthenticationErrors()
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() @RequirePermissions('NOTIFICATION.VIEW') @ApiOperation({ summary: 'Danh sách thông báo', description: 'Yêu cầu quyền: NOTIFICATION.VIEW.' }) @ApiQuery({ name: 'isRead', required: false, type: Boolean }) @ApiQuery({ name: 'page', required: false, type: Number }) @ApiQuery({ name: 'limit', required: false, type: Number }) @ApiOkResponse({ description: 'Danh sách thông báo theo response runtime.', type: Object }) @ApiValidationError() findAll(@Req() request: RequestWithContext, @Query() query: ListNotificationsDto) { return this.service.findAll(request.user!, query); }
  @Get(':id') @RequirePermissions('NOTIFICATION.VIEW') @ApiOperation({ summary: 'Chi tiết thông báo', description: 'Yêu cầu quyền: NOTIFICATION.VIEW.' }) @ApiParam({ name: 'id', description: 'MongoDB ObjectId của thông báo.' }) @ApiOkResponse({ description: 'Chi tiết thông báo.', type: ApiDataResponseDto }) @ApiResourceNotFound() @ApiValidationError() async findOne(@Req() request: RequestWithContext, @Param() params: NotificationIdParamDto) { return dataResponse(await this.service.findOne(request.user!, params.id)); }
  @Post()
  @RequirePermissions('NOTIFICATION.CREATE')
  @ApiOperation({ summary: 'Tạo thông báo', description: 'Yêu cầu quyền: NOTIFICATION.CREATE.' })
  @ApiBody({ type: CreateNotificationDto })
  @ApiCreatedResponse({ description: 'Tạo thông báo thành công.', type: ApiDataResponseDto })
  @ApiValidationError()
  async create(@Req() request: RequestWithContext, @Body() input: CreateNotificationDto) { return dataResponse(await this.service.create(request, input)); }
  @Patch('read-all') @RequirePermissions('NOTIFICATION.VIEW') @ApiOperation({ summary: 'Đánh dấu tất cả thông báo đã đọc', description: 'Yêu cầu quyền: NOTIFICATION.VIEW.' }) @ApiOkResponse({ description: 'Số thông báo vừa được đánh dấu đã đọc.', type: ApiDataResponseDto }) async markAllRead(@Req() request: RequestWithContext) { return dataResponse(await this.service.markAllRead(request.user!)); }
  @Patch(':id/read') @RequirePermissions('NOTIFICATION.VIEW') @ApiOperation({ summary: 'Đánh dấu đã đọc', description: 'Yêu cầu quyền: NOTIFICATION.VIEW.' }) @ApiParam({ name: 'id', description: 'MongoDB ObjectId của thông báo.' }) @ApiBody({ type: UpdateNotificationReadDto }) @ApiOkResponse({ description: 'Thông báo sau cập nhật trạng thái đọc.', type: ApiDataResponseDto }) @ApiResourceNotFound() @ApiValidationError() async updateRead(@Req() request: RequestWithContext, @Param() params: NotificationIdParamDto, @Body() input: UpdateNotificationReadDto) { return dataResponse(await this.service.updateRead(request.user!, params.id, input.isRead)); }
}
