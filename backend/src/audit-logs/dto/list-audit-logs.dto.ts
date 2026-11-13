import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuditOutcome } from '../enums/audit-outcome.enum.js';

export class ListAuditLogsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsMongoId()
  actorId?: string;

  @IsOptional()
  @IsIn(['SYSTEM'])
  actorType?: string;

  @IsOptional()
  @IsIn(['AUTH_ACCOUNT', 'EMPLOYEE', 'ORGANIZATION', 'JOB_TITLE', 'WORKSPACE', 'WORKFLOW_FORM'])
  module?: string;

  @IsOptional()
  @IsIn(['LOGIN_LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'APPROVAL'])
  actionGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceId?: string;

  @IsOptional()
  @IsEnum(AuditOutcome)
  outcome?: AuditOutcome;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
