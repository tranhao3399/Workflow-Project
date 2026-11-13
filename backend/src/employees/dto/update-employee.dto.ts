import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType } from '../enums/employment-type.enum.js';
import { Gender } from '../enums/gender.enum.js';

const trimValue = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'Nguyen Van A', maxLength: 100 })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'nguyenvana@workflow.local',
    format: 'email',
    maxLength: 255,
  })
  @IsOptional()
  @Transform(trimValue)
  @IsEmail()
  @MaxLength(255)
  workEmail?: string;

  @ApiPropertyOptional({ nullable: true, example: '66d0f0b74d5b5d4e65e75123' })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsMongoId()
  departmentId?: string | null;

  @ApiPropertyOptional({ example: '66d0f0b74d5b5d4e65e75126' })
  @IsOptional()
  @IsMongoId()
  workUnitId?: string;

  @ApiPropertyOptional({ nullable: true, example: '66d0f0b74d5b5d4e65e75124' })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsMongoId()
  positionId?: string | null;

  @ApiPropertyOptional({ example: '0901234567', maxLength: 30 })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9+() .-]+$/)
  phone?: string;

  @ApiPropertyOptional({
    example: '123 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    maxLength: 255,
  })
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({
    example: '1996-05-18T00:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender, nullable: true, example: Gender.MALE })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '079123456789',
    description: 'Số căn cước công dân gồm đúng 12 chữ số.',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Transform(trimValue)
  @IsString()
  @Matches(/^\d{12}$/, {
    message: 'Số CCCD phải gồm đúng 12 chữ số.',
  })
  citizenId?: string | null;

  @ApiPropertyOptional({
    example: 12,
    minimum: 0,
    maximum: 365,
    nullable: true,
    description: 'Số ngày nghỉ phép năm được cấp cho nhân viên.',
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(365)
  annualLeaveDays?: number | null;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  hiredAt?: string;

  @ApiPropertyOptional({
    enum: EmploymentType,
    example: EmploymentType.FULL_TIME,
  })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ nullable: true, example: '66d0f0b74d5b5d4e65e75125' })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsMongoId()
  managerId?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEmployeeStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}
