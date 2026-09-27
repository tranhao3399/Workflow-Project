import { ArrayNotEmpty, IsArray, IsMongoId } from 'class-validator';

export class LinkUserEmployeeDto {
  @IsMongoId()
  employeeId: string;
}

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  roleIds: string[];
}
