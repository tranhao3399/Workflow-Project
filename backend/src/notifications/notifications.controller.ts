import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../common/authorization/permission.guard.js';
import { RequirePermissions } from '../common/authorization/require-permissions.decorator.js';
import { dataResponse } from '../common/http/api-response.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { CreateNotificationDto, ListNotificationsDto, NotificationIdParamDto, UpdateNotificationReadDto } from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() @RequirePermissions('NOTIFICATION.VIEW') findAll(@Req() request: RequestWithContext, @Query() query: ListNotificationsDto) { return this.service.findAll(request.user!, query); }
  @Get(':id') @RequirePermissions('NOTIFICATION.VIEW') async findOne(@Req() request: RequestWithContext, @Param() params: NotificationIdParamDto) { return dataResponse(await this.service.findOne(request.user!, params.id)); }
  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermissions('NOTIFICATION.CREATE')
  async create(@Req() request: RequestWithContext, @Body() input: CreateNotificationDto) { return dataResponse(await this.service.create(request, input)); }
  @Patch(':id/read') @RequirePermissions('NOTIFICATION.VIEW') async updateRead(@Req() request: RequestWithContext, @Param() params: NotificationIdParamDto, @Body() input: UpdateNotificationReadDto) { return dataResponse(await this.service.updateRead(request.user!, params.id, input.isRead)); }
}
