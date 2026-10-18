import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWorkspaceModuleDto {
  @ApiPropertyOptional({ example: true, description: 'Bật hoặc tắt module trên toàn hệ thống.' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
