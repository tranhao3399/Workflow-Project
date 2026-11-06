import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EmploymentType } from '../enums/employment-type.enum.js';

export const employeeSortFields = ['employeeCode', 'fullName', 'workEmail', 'employmentType', 'isActive', 'createdAt'] as const;
export type EmployeeSortField = (typeof employeeSortFields)[number];

export class ListEmployeesDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @IsOptional()
  @IsMongoId()
  workUnitId?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(employeeSortFields)
  sortBy: EmployeeSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;
}
