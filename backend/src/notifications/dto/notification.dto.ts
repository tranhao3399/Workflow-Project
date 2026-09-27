import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { notificationTypes, type NotificationType } from '../schemas/notification.schema.js';

export class NotificationIdParamDto { @IsMongoId() id: string; }
export class ListNotificationsDto {
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() isRead?: boolean;
  @IsOptional() @Type(() => Number) @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(50) limit = 20;
}
export class CreateNotificationDto {
  @IsOptional() @IsMongoId() userId?: string;
  @IsEnum(notificationTypes) type: NotificationType;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(160) title: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @IsNotEmpty() @MaxLength(500) description: string;
  @IsOptional() @IsString() @MaxLength(200) link?: string;
}
export class UpdateNotificationReadDto { @IsBoolean() isRead: boolean; }
