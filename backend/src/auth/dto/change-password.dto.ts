import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_COMPLEXITY_PATTERN, PASSWORD_POLICY_MESSAGE } from '../../common/validation/password-policy.js';

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentPassword123!', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_COMPLEXITY_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  newPassword: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_COMPLEXITY_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  confirmPassword: string;
}
