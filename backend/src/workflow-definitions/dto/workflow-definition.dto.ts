import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { definitionStatuses, type DefinitionStatus } from '../../form-definitions/schemas/form-definition.schema.js';
import {
  approvalModes,
  assigneeRuleTypes,
  workflowConditionOperators,
  workflowConditionSources,
  workflowEndResults,
  workflowStepTypes,
  MAX_BPMN_XML_CHARACTERS,
  WORKFLOW_BPMN_EXTENSION_NAMESPACE,
  type ApprovalMode,
  type AssigneeRuleType,
  type WorkflowConditionOperator,
  type WorkflowConditionSource,
  type WorkflowEndResult,
  type WorkflowStepType,
} from '../schemas/workflow-definition.schema.js';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class WorkflowUiPositionDto {
  @ApiProperty({ example: 320 }) @Type(() => Number) @IsNumber() x: number;
  @ApiProperty({ example: 180 }) @Type(() => Number) @IsNumber() y: number;
}

export class WorkflowAssigneeRuleDto {
  @ApiProperty({ enum: assigneeRuleTypes }) @IsIn(assigneeRuleTypes) type: AssigneeRuleType;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsMongoId({ each: true }) roleIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsMongoId({ each: true }) positionIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayUnique() @IsMongoId({ each: true }) userIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsMongoId() departmentId?: string;
  @ApiProperty({ default: false }) @IsBoolean() includeInactive: boolean;
}

export class WorkflowConditionDto {
  @ApiProperty({ enum: workflowConditionSources }) @IsIn(workflowConditionSources) source: WorkflowConditionSource;
  @ApiProperty({ example: 'amount' }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80) fieldKey: string;
  @ApiProperty({ enum: workflowConditionOperators }) @IsIn(workflowConditionOperators) operator: WorkflowConditionOperator;
  @ApiProperty({ example: 1000000 }) @IsDefined() value: unknown;
}

export class WorkflowStepDto {
  @ApiProperty({ example: 'MANAGER_APPROVAL' }) @Transform(upper) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) @MaxLength(80) stepKey: string;
  @ApiProperty({ example: 'Quản lý phê duyệt' }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @ApiProperty({ enum: workflowStepTypes }) @IsIn(workflowStepTypes) type: WorkflowStepType;
  @ApiPropertyOptional({ type: WorkflowUiPositionDto }) @IsOptional() @ValidateNested() @Type(() => WorkflowUiPositionDto) uiPosition?: WorkflowUiPositionDto;
  @ApiPropertyOptional({ type: WorkflowAssigneeRuleDto }) @IsOptional() @ValidateNested() @Type(() => WorkflowAssigneeRuleDto) assigneeRule?: WorkflowAssigneeRuleDto;
  @ApiPropertyOptional({ enum: approvalModes }) @IsOptional() @IsIn(approvalModes) approvalMode?: ApprovalMode;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() allowSelfApproval?: boolean;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) dueInHours?: number;
  @ApiPropertyOptional({ type: WorkflowConditionDto }) @IsOptional() @ValidateNested() @Type(() => WorkflowConditionDto) condition?: WorkflowConditionDto;
  @ApiPropertyOptional({ enum: workflowEndResults }) @IsOptional() @IsIn(workflowEndResults) endResult?: WorkflowEndResult;
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) onApproveStepKey?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) onRejectStepKey?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) onRevisionStepKey?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) onTrueStepKey?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) onFalseStepKey?: string;
}

export class CreateWorkflowDefinitionDto {
  @ApiProperty({ example: 'LEAVE_APPROVAL' }) @Transform(upper) @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/) @MaxLength(80) code: string;
  @ApiProperty({ example: 'Quy trình nghỉ phép' }) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) description?: string;
  @ApiProperty({ description: 'Form DRAFT cho full package hoặc Form PUBLISHED khi chỉ cập nhật Workflow.' }) @IsMongoId() formDefinitionId: string;
  @ApiProperty({
    description: `BPMN 2.0 XML do bpmn-js sinh ra. Dùng wf:approval, wf:condition hoặc wf:end trong bpmn:extensionElements với namespace ${WORKFLOW_BPMN_EXTENSION_NAMESPACE}.`,
    maxLength: MAX_BPMN_XML_CHARACTERS,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BPMN_XML_CHARACTERS)
  bpmnXml: string;
}

export class UpdateWorkflowDefinitionDto {
  @ApiProperty({ minimum: 0, description: 'Revision hiện tại của document để chống ghi đè.' }) @Type(() => Number) @IsInt() @Min(0) expectedRevision: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({
    description: 'BPMN XML mới. Backend biên dịch và cập nhật đồng thời steps; client không được gửi steps trực tiếp.',
    maxLength: MAX_BPMN_XML_CHARACTERS,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BPMN_XML_CHARACTERS)
  bpmnXml?: string;
}

export class CloneWorkflowDefinitionDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ description: 'Form DRAFT cho full package hoặc Form PUBLISHED khi chỉ tạo version Workflow.' }) @IsOptional() @IsMongoId() formDefinitionId?: string;
}

export class ValidateWorkflowDefinitionDto {
  @ApiPropertyOptional({
    description: 'BPMN XML chưa lưu cần kiểm tra. Bỏ trống để kiểm tra XML đang lưu trong Workflow.',
    maxLength: MAX_BPMN_XML_CHARACTERS,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BPMN_XML_CHARACTERS)
  bpmnXml?: string;
}

export class WorkflowDefinitionIdParamDto {
  @ApiProperty() @IsMongoId() id: string;
}

export const workflowDefinitionSortFields = ['code', 'name', 'status', 'version', 'createdAt', 'updatedAt'] as const;
export type WorkflowDefinitionSortField = (typeof workflowDefinitionSortFields)[number];

export class ListWorkflowDefinitionsDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: definitionStatuses }) @IsOptional() @IsIn(definitionStatuses) status?: DefinitionStatus;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() formDefinitionId?: string;
  @ApiPropertyOptional({ enum: workflowDefinitionSortFields, default: 'updatedAt' }) @IsOptional() @IsIn(workflowDefinitionSortFields) sortBy: WorkflowDefinitionSortField = 'updatedAt';
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' }) @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'desc';
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class WorkflowGraphValidationErrorDto {
  @ApiProperty() code: string;
  @ApiProperty() path: string;
  @ApiPropertyOptional() stepKey?: string;
  @ApiPropertyOptional({ description: 'ID của BPMN element để frontend tô sáng node/flow bị lỗi.' }) elementId?: string;
  @ApiProperty() message: string;
}

export class WorkflowGraphValidationResponseDto {
  @ApiProperty() valid: boolean;
  @ApiProperty({ type: [WorkflowGraphValidationErrorDto] }) errors: WorkflowGraphValidationErrorDto[];
}

export class WorkflowDefinitionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() version: number;
  @ApiProperty() revision: number;
  @ApiPropertyOptional() previousVersionId?: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() formDefinitionId: string;
  @ApiPropertyOptional() formDefinition?: { id: string; code: string; name: string; version: number; status: DefinitionStatus };
  @ApiProperty({ enum: definitionStatuses }) status: DefinitionStatus;
  @ApiPropertyOptional({ description: 'Có trong response chi tiết; danh sách không trả XML để giới hạn payload.' }) bpmnXml?: string;
  @ApiProperty() startStepKey: string;
  @ApiProperty({ type: [WorkflowStepDto] }) steps: WorkflowStepDto[];
  @ApiProperty() createdBy: string;
  @ApiPropertyOptional() updatedBy?: string;
  @ApiPropertyOptional() publishedBy?: string;
  @ApiPropertyOptional() publishedAt?: Date;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
