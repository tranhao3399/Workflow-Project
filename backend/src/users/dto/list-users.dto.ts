import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { UserRole } from '../enums/user-role.enum.js';

export class ListUsersDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit = 20;
}
