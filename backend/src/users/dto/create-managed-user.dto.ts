import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsMongoId, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateManagedUserDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123', description: 'MongoDB ObjectId của nhân viên.' })
  @IsMongoId()
  employeeId: string;

  @ApiProperty({ example: 'employee@workflow.local', format: 'email', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Temporary123!', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword: string;

  @ApiProperty({ type: [String], example: ['66d0f0b74d5b5d4e65e75124'], description: 'Các MongoDB ObjectId của role.' })
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) roleIds: string[];

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
