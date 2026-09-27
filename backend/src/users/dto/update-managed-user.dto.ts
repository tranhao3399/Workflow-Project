import { IsArray, IsBoolean, IsEmail, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateManagedUserDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional() @IsArray() @IsMongoId({ each: true }) roleIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword?: string;
}

export class UpdateManagedUserStatusDto {
  @IsBoolean()
  isActive: boolean;
}
