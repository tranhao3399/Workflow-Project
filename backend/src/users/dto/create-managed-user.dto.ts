import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsMongoId, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateManagedUserDto {
  @IsMongoId()
  employeeId: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword: string;

  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) roleIds: string[];

  @IsBoolean()
  isActive: boolean;
}
