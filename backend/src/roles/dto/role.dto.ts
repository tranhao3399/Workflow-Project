import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsMongoId, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'REPORT_VIEWER', pattern: '^[A-Z][A-Z0-9_]*$', maxLength: 60 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) @MaxLength(60)
  key: string;

  @ApiProperty({ example: 'Nguoi xem bao cao', maxLength: 100 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Vai tro chi xem cac bao cao.', maxLength: 500 })
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['USER.VIEW', 'USER.CREATE'], description: 'Permission keys tu Permission Registry. Backend tu them <MODULE>.VIEW khi can.' })
  @IsOptional() @IsArray() @IsString({ each: true })
  permissionKeys?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'REPORT_VIEWER', pattern: '^[A-Z][A-Z0-9_]*$', maxLength: 60 })
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) @MaxLength(60)
  key?: string;

  @ApiPropertyOptional({ example: 'Nguoi xem bao cao', maxLength: 100 })
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Vai tro chi xem cac bao cao.', maxLength: 500 })
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['USER.VIEW', 'USER.CREATE'], description: 'Permission keys tu Permission Registry.' })
  @IsOptional() @IsArray() @IsString({ each: true })
  permissionKeys?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateRoleStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}

export class RoleIdParamDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123' })
  @IsMongoId()
  id: string;
}

export class ListRolesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean()
  active?: boolean;
}

export class PermissionRegistryItemResponseDto {
  @ApiProperty({ example: 'USER.VIEW' })
  key: string;

  @ApiProperty({ example: 'USER' })
  module: string;

  @ApiProperty({ example: 'Tài khoản người dùng' })
  moduleLabel: string;

  @ApiProperty({ example: 'Xem tài khoản' })
  label: string;

  @ApiProperty({ enum: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'SPECIAL'], example: 'VIEW' })
  matrixColumn: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SPECIAL';
}

export class RoleResponseDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123' })
  id: string;

  @ApiProperty({ example: 'ACCOUNTANT' })
  key: string;

  @ApiProperty({ example: 'Kế toán' })
  name: string;

  @ApiPropertyOptional({ example: 'Vai trò kế toán.' })
  description?: string;

  @ApiProperty({ type: [String], example: ['USER.VIEW', 'USER.CREATE'] })
  permissionKeys: string[];

  @ApiProperty({ example: false })
  isSystem: boolean;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ example: 2 })
  assignedUserCount?: number;
}

export class RoleDataResponseDto {
  @ApiProperty({ type: RoleResponseDto })
  data: RoleResponseDto;
}
