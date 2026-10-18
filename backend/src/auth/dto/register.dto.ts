import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/enums/user-role.enum.js';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyen Van A', maxLength: 100 })
  @IsString() @IsNotEmpty() @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: 'nguyenvana@workflow.local', format: 'email', maxLength: 255 })
  @IsEmail() @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString() @MinLength(8) @MaxLength(128)
  password: string;

  @ApiProperty({ enum: UserRole, example: UserRole.EMPLOYEE })
  @IsEnum(UserRole)
  role: UserRole;
}
