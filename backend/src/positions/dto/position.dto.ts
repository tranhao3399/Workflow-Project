import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class CreatePositionDto {
  @ApiProperty({ example: 'TEAM_LEAD', maxLength: 40 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(40)
  code: string;
  @ApiProperty({ example: 'Truong nhom', maxLength: 120 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean()
  isActive?: boolean;
  @ApiPropertyOptional({ example: 10 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000)
  sortOrder?: number;
}

export class UpdatePositionDto {
  @ApiPropertyOptional({ example: 'TEAM_LEAD', maxLength: 40 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(40)
  code?: string;
  @ApiPropertyOptional({ example: 'Truong nhom', maxLength: 120 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean()
  isActive?: boolean;
  @ApiPropertyOptional({ example: 10 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000)
  sortOrder?: number;
}

export class PositionIdParamDto { @IsMongoId() id: string; }

export class CreateJobTitleDto {
  @ApiProperty({ example: 'Ky su phan mem', maxLength: 120 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;
  @ApiProperty({ example: 'SOFTWARE_ENGINEER', pattern: '^[A-Z0-9_]+$', maxLength: 40 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Z0-9_]+$/, { message: 'code must contain only A-Z, 0-9, and underscores' })
  code: string;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateJobTitleDto {
  @ApiPropertyOptional({ example: 'SOFTWARE_ENGINEER', pattern: '^[A-Z0-9_]+$', maxLength: 40 })
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @IsNotEmpty() @MaxLength(40) @Matches(/^[A-Z0-9_]+$/, { message: 'code must contain only A-Z, 0-9, and underscores' })
  code?: string;
  @ApiPropertyOptional({ example: 'Ky su phan mem', maxLength: 120 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120)
  name?: string;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateJobTitleStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}

export class ListPositionsDto {
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean()
  active?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean()
  isActive?: boolean;
}
