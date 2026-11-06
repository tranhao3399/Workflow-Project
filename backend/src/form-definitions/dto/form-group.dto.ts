import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class CreateFormGroupDto {
  @ApiProperty({ example: 'HUMAN_RESOURCES', pattern: '^[A-Z][A-Z0-9_]*$', maxLength: 80 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @IsNotEmpty() @MaxLength(80) @Matches(/^[A-Z][A-Z0-9_]*$/)
  code: string;

  @ApiProperty({ example: 'Nhân sự', maxLength: 160 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 9999 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;
}

export class UpdateFormGroupDto {
  @ApiPropertyOptional({ example: 'Nhân sự', maxLength: 160 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(9999)
  sortOrder?: number;
}

export class FormGroupIdParamDto {
  @ApiProperty()
  @IsMongoId()
  id: string;
}
