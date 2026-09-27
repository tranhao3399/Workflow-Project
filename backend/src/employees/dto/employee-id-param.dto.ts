import { IsMongoId } from 'class-validator';

export class EmployeeIdParamDto {
  @IsMongoId()
  id: string;
}
