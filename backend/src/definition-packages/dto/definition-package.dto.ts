import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional } from 'class-validator';
import { definitionStatuses, type DefinitionStatus } from '../../form-definitions/schemas/form-definition.schema.js';

export const definitionPackagePublishModes = ['FULL_PACKAGE', 'WORKFLOW_ONLY'] as const;
export type DefinitionPackagePublishMode = (typeof definitionPackagePublishModes)[number];

export class DefinitionPackageDto {
  @ApiProperty({ example: '66f3f9894de2297e43de1201', description: 'MongoDB ObjectId của Form Definition.' })
  @IsMongoId()
  formDefinitionId: string;

  @ApiProperty({ example: '66f3f9894de2297e43de1202', description: 'MongoDB ObjectId của Workflow Definition.' })
  @IsMongoId()
  workflowDefinitionId: string;
}

export class PublishDefinitionPackageDto extends DefinitionPackageDto {
  @ApiPropertyOptional({
    enum: definitionPackagePublishModes,
    description: 'Bỏ trống để backend tự suy ra từ trạng thái Form và Workflow.',
  })
  @IsOptional()
  @IsIn(definitionPackagePublishModes)
  publishMode?: DefinitionPackagePublishMode;
}

export class DefinitionPackageItemResponseDto {
  @ApiProperty({ example: '66f3f9894de2297e43de1201' })
  id: string;

  @ApiProperty({ example: 'LEAVE_REQUEST' })
  code: string;

  @ApiProperty({ example: 2 })
  version: number;

  @ApiProperty({ enum: definitionStatuses, example: 'PUBLISHED' })
  status: DefinitionStatus;
}

export class DefinitionPackageResponseDto {
  @ApiProperty({ enum: definitionStatuses, example: 'PUBLISHED' })
  status: DefinitionStatus;

  @ApiProperty({ type: DefinitionPackageItemResponseDto })
  formDefinition: DefinitionPackageItemResponseDto;

  @ApiProperty({ type: DefinitionPackageItemResponseDto })
  workflowDefinition: DefinitionPackageItemResponseDto;

  @ApiPropertyOptional({ enum: definitionPackagePublishModes })
  publishMode?: DefinitionPackagePublishMode;
}
