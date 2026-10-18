import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { requestStatuses, type RequestStatus } from '../schemas/request.schema.js';

const trim = ({ value }: { value: unknown }): unknown => (
  typeof value === 'string' ? value.trim() : value
);

export class RequestIdParamDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123' })
  @IsMongoId()
  id: string;
}

export class CreateRequestDto {
  @ApiProperty({ description: 'MongoDB ObjectId của Form Definition đang PUBLISHED.' })
  @IsMongoId()
  formDefinitionId: string;
}

export class UpdateRequestDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  formData?: Record<string, unknown>;
}

export class RequestReasonDto {
  @ApiProperty({ maxLength: 1000, example: 'Không còn nhu cầu xử lý phiếu này.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export const requestSortFields = [
  'requestNo',
  'title',
  'status',
  'createdAt',
  'updatedAt',
  'submittedAt',
  'completedAt',
] as const;
export type RequestSortField = (typeof requestSortFields)[number];
export const requestStatusGroups = [
  'DRAFT',
  'IN_PROGRESS',
  'REVISION_REQUESTED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RequestStatusGroup = (typeof requestStatusGroups)[number];

export class ListRequestsDto {
  @ApiPropertyOptional({ description: 'Tìm theo số phiếu hoặc tiêu đề.', maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: requestStatuses })
  @IsOptional()
  @IsIn(requestStatuses)
  status?: RequestStatus;

  @ApiPropertyOptional({ enum: requestStatusGroups, description: 'Nhóm trạng thái dùng cho các tab danh sách.' })
  @IsOptional()
  @IsIn(requestStatusGroups)
  statusGroup?: RequestStatusGroup;

  @ApiPropertyOptional({ description: 'Lọc theo Form Definition.' })
  @IsOptional()
  @IsMongoId()
  formDefinitionId?: string;

  @ApiPropertyOptional({ description: 'Ngày tạo từ thời điểm ISO-8601.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Ngày tạo đến thời điểm ISO-8601.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: requestSortFields, default: 'createdAt' })
  @IsOptional()
  @IsIn(requestSortFields)
  sortBy: RequestSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class RequestAvailableActionsDto {
  @ApiProperty() canEdit: boolean;
  @ApiProperty() canSubmit: boolean;
  @ApiProperty() canResubmit: boolean;
  @ApiProperty() canCancel: boolean;
  @ApiProperty() canApprove: boolean;
  @ApiProperty() canReject: boolean;
  @ApiProperty() canRequestRevision: boolean;
  @ApiProperty() canVoid: boolean;
  @ApiProperty() canDelete: boolean;
  @ApiProperty() canRecreate: boolean;
}

export class RequestDefinitionSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() version: number;
}

export class RequestDefinitionVersionDto {
  @ApiProperty({ enum: ['CURRENT', 'OUTDATED', 'SNAPSHOT_LOCKED'] })
  status: 'CURRENT' | 'OUTDATED' | 'SNAPSHOT_LOCKED';

  @ApiPropertyOptional({ type: RequestDefinitionSummaryDto })
  currentForm?: RequestDefinitionSummaryDto;

  @ApiPropertyOptional({ type: RequestDefinitionSummaryDto })
  currentWorkflow?: RequestDefinitionSummaryDto;
}

export class RequestResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() requestNo: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: requestStatuses }) status: RequestStatus;
  @ApiPropertyOptional({ description: 'Task PENDING hiện hành của người gọi, nếu có.' })
  currentApprovalTaskId?: string;
  @ApiPropertyOptional({ type: RequestAvailableActionsDto })
  availableActions?: RequestAvailableActionsDto;
  @ApiPropertyOptional({ type: RequestDefinitionVersionDto })
  definitionVersion?: RequestDefinitionVersionDto;
}
