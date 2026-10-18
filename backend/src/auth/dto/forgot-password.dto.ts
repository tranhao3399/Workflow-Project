import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const normalizeEmail = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ForgotPasswordRequestDto {
  @ApiProperty({ example: 'employee@workflow.local', format: 'email', maxLength: 255 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class ForgotPasswordVerifyDto {
  @ApiProperty({ example: 'employee@workflow.local', format: 'email', maxLength: 255 })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6, writeOnly: true })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

export class ForgotPasswordResetDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  resetToken: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword: string;
}
