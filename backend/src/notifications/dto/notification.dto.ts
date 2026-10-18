import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { notificationTypes, type NotificationType } from '../schemas/notification.schema.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationIdParamDto { @IsMongoId() id: string; }
export class ListNotificationsDto {
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() isRead?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
export class CreateNotificationDto {
  @ApiPropertyOptional({ example: '66d0f0b74d5b5d4e65e75123', description: 'ObjectId người nhận; bỏ trống khi service hỗ trợ broadcast.' })
  @IsOptional() @IsMongoId() userId?: string;
  @ApiProperty({ enum: notificationTypes })
  @IsEnum(notificationTypes) type: NotificationType;
  @ApiProperty({ example: 'Yêu cầu mới', maxLength: 160 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(160) title: string;
  @ApiProperty({ example: 'Bạn có một yêu cầu đang chờ xử lý.', maxLength: 500 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(500) description: string;
  @ApiPropertyOptional({ example: '/requests/66d0f0b74d5b5d4e65e75123', maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200) link?: string;
  @ApiPropertyOptional({ example: 'REQUEST:REQ-001:STEP:MANAGER:ASSIGNED:RUN:1', maxLength: 160 })
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(160) dedupeKey?: string;
}
export class UpdateNotificationReadDto { @ApiProperty({ example: true }) @IsBoolean() isRead: boolean; }
