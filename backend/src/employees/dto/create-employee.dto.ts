import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength, Matches, ValidateIf } from 'class-validator';
import { EmploymentType } from '../enums/employment-type.enum.js';

const trimValue = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class CreateEmployeeDto {
  @Transform(trimValue)
  @ValidateIf((object) => !object.departmentId)
  @IsString() @IsNotEmpty()
  @MaxLength(40)
  employeeCode: string;

  @Transform(trimValue)
  @ValidateIf((object) => !object.positionId)
  @IsString() @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @Transform(trimValue)
  @IsEmail()
  @MaxLength(255)
  workEmail: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  department: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  position: string;

  @IsOptional() @IsMongoId() departmentId?: string;
  @IsOptional() @IsMongoId() positionId?: string;

  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MaxLength(30)
  @Matches(/^[0-9+() .-]+$/)
  phone?: string;

  @IsOptional()
  @IsDateString()
  hiredAt?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsMongoId()
  managerId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsMongoId()
  userId?: string;
}
