import { Transform } from 'class-transformer';
import { IsBoolean, IsMongoId, IsOptional } from 'class-validator';

export class ListUserEmployeeOptionsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  availableOnly?: boolean;

  @IsOptional()
  @IsMongoId()
  includeEmployeeId?: string;
}
