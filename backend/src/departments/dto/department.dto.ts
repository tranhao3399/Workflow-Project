import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class CreateDepartmentDto {
  @ApiProperty({ example: 'ENGINEERING', pattern: '^[A-Z0-9_]+$', maxLength: 40 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Z0-9_]+$/, { message: 'code must contain only A-Z, 0-9, and underscores' }) code: string;
  @ApiProperty({ example: 'Khối Kỹ thuật', maxLength: 120 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: [String], example: ['66d0f0b74d5b5d4e65e75124'], description: 'Các ObjectId chức danh áp dụng.' })
  @IsOptional() @IsArray() @ArrayUnique() @IsMongoId({ each: true }) positionIds?: string[];
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ example: 'ENGINEERING', pattern: '^[A-Z0-9_]+$', maxLength: 40 })
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Z0-9_]+$/, { message: 'code must contain only A-Z, 0-9, and underscores' }) code?: string;
  @ApiPropertyOptional({ example: 'Khối Kỹ thuật', maxLength: 120 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @ApiPropertyOptional({ nullable: true, example: '66d0f0b74d5b5d4e65e75124' })
  @ValidateIf((_, value) => value !== null && value !== undefined) @IsMongoId() parentId?: string | null;
  @ApiPropertyOptional({ nullable: true, example: '66d0f0b74d5b5d4e65e75124' })
  @ValidateIf((_, value) => value !== null && value !== undefined) @IsMongoId() managerEmployeeId?: string | null;
  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: 10000 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class DepartmentIdParamDto { @IsMongoId() id: string; }

export class DepartmentJobTitleIdParamDto {
  @IsMongoId() id: string;
  @IsMongoId() assignmentId: string;
}

export class ApplyDepartmentJobTitlesDto {
  @ApiProperty({ type: [String], example: ['66d0f0b74d5b5d4e65e75124'], description: 'Các ObjectId chức danh cần thêm.' })
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsMongoId({ each: true }) jobTitleIds: string[];
}

export class RemoveDepartmentPositionsDto {
  @ApiProperty({ type: [String], example: ['66d0f0b74d5b5d4e65e75125'], description: 'Các ObjectId liên kết DepartmentPosition cần xóa.' })
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsMongoId({ each: true }) assignmentIds: string[];
}

export class UpdateDepartmentStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean() isActive: boolean;
}

export class ListDepartmentsDto {
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
