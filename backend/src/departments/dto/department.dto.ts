import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class CreateDepartmentDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Z0-9_]+$/, { message: 'code must contain only A-Z, 0-9, and underscores' }) code: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsMongoId({ each: true }) positionIds?: string[];
}

export class UpdateDepartmentDto {
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Z0-9_]+$/, { message: 'code must contain only A-Z, 0-9, and underscores' }) code?: string;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @ValidateIf((_, value) => value !== null && value !== undefined) @IsMongoId() parentId?: string | null;
  @ValidateIf((_, value) => value !== null && value !== undefined) @IsMongoId() managerEmployeeId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class DepartmentIdParamDto { @IsMongoId() id: string; }

export class DepartmentJobTitleIdParamDto {
  @IsMongoId() id: string;
  @IsMongoId() assignmentId: string;
}

export class ApplyDepartmentJobTitlesDto {
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsMongoId({ each: true }) jobTitleIds: string[];
}

export class RemoveDepartmentPositionsDto {
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsMongoId({ each: true }) assignmentIds: string[];
}

export class UpdateDepartmentStatusDto {
  @IsBoolean() isActive: boolean;
}

export class ListDepartmentsDto {
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
