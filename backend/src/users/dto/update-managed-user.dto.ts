import { IsArray, IsBoolean, IsEmail, IsMongoId, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_COMPLEXITY_PATTERN, PASSWORD_POLICY_MESSAGE } from '../../common/validation/password-policy.js';

export class UpdateManagedUserDto {
  @ApiPropertyOptional({ example: 'employee@workflow.local', format: 'email', maxLength: 255 })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ type: [String], example: ['66d0f0b74d5b5d4e65e75124'] })
  @IsOptional() @IsArray() @IsMongoId({ each: true }) roleIds?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'NewPassword123!', minLength: 8, maxLength: 128, writeOnly: true })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_COMPLEXITY_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  newPassword?: string;
}

export class UpdateManagedUserStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}
