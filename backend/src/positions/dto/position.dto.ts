import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;
export class CreatePositionDto { @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(40) code: string; @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name: string; @IsOptional() @IsMongoId() departmentId?: string; @IsOptional() @IsBoolean() isActive?: boolean; @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sortOrder?: number; }
export class UpdatePositionDto { @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(40) code?: string; @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name?: string; @ValidateIf((_, value) => value !== null && value !== undefined) @IsMongoId() departmentId?: string | null; @IsOptional() @IsBoolean() isActive?: boolean; @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sortOrder?: number; }
export class PositionIdParamDto { @IsMongoId() id: string; }
export class CreateJobTitleDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Z0-9_]+$/, { message: 'code must contain only A-Z, 0-9, and underscores' }) code: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateJobTitleDto {
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Z0-9_]+$/, { message: 'code must contain only A-Z, 0-9, and underscores' }) code?: string;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class ListPositionsDto {
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() active?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() isActive?: boolean;
  @IsOptional() @IsMongoId() departmentId?: string;
}
