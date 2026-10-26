import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_COMPLEXITY_PATTERN, PASSWORD_POLICY_MESSAGE } from '../../common/validation/password-policy.js';

export class CreateManagedUserDto {
  @ApiPropertyOptional({ example: '66d0f0b74d5b5d4e65e75123', description: 'MongoDB ObjectId của nhân viên nếu có liên kết.' })
  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  @ApiProperty({ example: 'employee@workflow.local', format: 'email', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Temporary123!', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_COMPLEXITY_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  temporaryPassword: string;

  @ApiProperty({ type: [String], example: ['66d0f0b74d5b5d4e65e75124'], description: 'Các MongoDB ObjectId của role.' })
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) roleIds: string[];

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
