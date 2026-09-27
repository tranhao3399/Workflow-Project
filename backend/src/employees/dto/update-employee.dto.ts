import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { EmploymentType } from '../enums/employment-type.enum.js';

const trimValue = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class UpdateEmployeeDto {
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @Transform(trimValue)
  @IsEmail()
  @MaxLength(255)
  workEmail?: string;

  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  position?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined) @IsMongoId() departmentId?: string | null;
  @ValidateIf((_, value) => value !== null && value !== undefined) @IsMongoId() positionId?: string | null;

  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9+() .-]+$/)
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsDateString()
  hiredAt?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsMongoId()
  managerId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsMongoId()
  userId?: string | null;
}

export class UpdateEmployeeStatusDto {
  @IsBoolean()
  isActive: boolean;
}
