import { IsString, Matches } from 'class-validator';

export class ModuleKeyParamDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'moduleKey must use uppercase letters, numbers, and underscores' })
  moduleKey: string;
}
