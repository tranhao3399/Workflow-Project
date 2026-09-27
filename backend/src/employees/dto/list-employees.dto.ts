import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit = 10;
}
