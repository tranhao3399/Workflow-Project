import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateWorkspaceModuleDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
