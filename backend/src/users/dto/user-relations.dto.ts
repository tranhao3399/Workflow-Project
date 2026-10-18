import { ArrayNotEmpty, IsArray, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkUserEmployeeDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123', description: 'MongoDB ObjectId của nhân viên.' })
  @IsMongoId()
  employeeId: string;
}

export class UpdateUserRolesDto {
  @ApiProperty({ type: [String], example: ['66d0f0b74d5b5d4e65e75124'], description: 'Các MongoDB ObjectId của role.' })
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  roleIds: string[];
}
