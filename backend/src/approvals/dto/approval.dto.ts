import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { requestStatuses, type RequestStatus } from '../../requests/schemas/request.schema.js';
import { approvalModes, type ApprovalMode } from '../../workflow-definitions/schemas/workflow-definition.schema.js';
import {
  approvalTaskStatuses,
  type ApprovalTaskStatus,
} from '../schemas/approval-task.schema.js';

const trim = ({ value }: { value: unknown }): unknown => (
  typeof value === 'string' ? value.trim() : value
);

export const approvalInboxScopes = ['pending', 'processed', 'closed'] as const;
export type ApprovalInboxScope = (typeof approvalInboxScopes)[number];

export const approvalTaskSortFields = [
  'assignedAt',
  'dueAt',
  'actedAt',
  'status',
  'stepNameSnapshot',
  'updatedAt',
] as const;
export type ApprovalTaskSortField = (typeof approvalTaskSortFields)[number];

export class ApprovalTaskIdParamDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123' })
  @IsMongoId()
  id: string;
}

export class ListApprovalInboxDto {
  @ApiPropertyOptional({ enum: approvalInboxScopes, default: 'pending' })
  @IsOptional()
  @IsIn(approvalInboxScopes)
  scope: ApprovalInboxScope = 'pending';

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: approvalTaskStatuses })
  @IsOptional()
  @IsIn(approvalTaskStatuses)
  status?: ApprovalTaskStatus;

  @ApiPropertyOptional({ enum: approvalModes })
  @IsOptional()
  @IsIn(approvalModes)
  approvalMode?: ApprovalMode;

  @ApiPropertyOptional({ enum: requestStatuses })
  @IsOptional()
  @IsIn(requestStatuses)
  requestStatus?: RequestStatus;

  @ApiPropertyOptional({ description: 'Chỉ lấy task PENDING đã quá dueAt.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Lọc assignedAt từ thời điểm ISO-8601.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Lọc assignedAt đến thời điểm ISO-8601.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: approvalTaskSortFields, default: 'assignedAt' })
  @IsOptional()
  @IsIn(approvalTaskSortFields)
  sortBy: ApprovalTaskSortField = 'assignedAt';

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

export class ApproveTaskDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class RequiredDecisionCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment: string;
}

export class ReassignApprovalTaskDto {
  @ApiProperty({ description: 'User nhận task mới.' })
  @IsMongoId()
  newAssigneeUserId: string;

  @ApiProperty({ maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
