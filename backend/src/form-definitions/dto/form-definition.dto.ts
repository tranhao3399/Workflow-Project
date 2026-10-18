import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  definitionStatuses,
  formFieldTypes,
  visibilityOperators,
  type DefinitionStatus,
  type FormFieldType,
  type VisibilityOperator,
} from '../schemas/form-definition.schema.js';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class FormFieldOptionDto {
  @ApiProperty({ example: 'ANNUAL_LEAVE', maxLength: 160 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160)
  value: string;

  @ApiProperty({ example: 'Nghỉ phép năm', maxLength: 160 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160)
  label: string;

  @ApiProperty({ example: 10, minimum: 0 })
  @Type(() => Number) @IsInt() @Min(0)
  order: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class FormFieldValidationDto {
  @ApiPropertyOptional({ example: 0 })
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false })
  min?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional() @Type(() => Number) @IsNumber({ allowInfinity: false, allowNaN: false })
  max?: number;

  @ApiPropertyOptional({ example: 3, minimum: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  minLength?: number;

  @ApiPropertyOptional({ example: 200, minimum: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  maxLength?: number;

  @ApiPropertyOptional({ example: '^[A-Za-z ]+$', maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  pattern?: string;

  @ApiPropertyOptional({ example: 'Giá trị không hợp lệ.', maxLength: 500 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  errorMessage?: string;
}

export class FormFieldVisibilityConditionDto {
  @ApiProperty({ example: 'leaveType', pattern: '^[A-Za-z][A-Za-z0-9_]*$' })
  @Transform(trim) @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_]*$/) @MaxLength(80)
  fieldKey: string;

  @ApiProperty({ enum: visibilityOperators, example: 'EQUALS' })
  @IsIn(visibilityOperators)
  operator: VisibilityOperator;

  @ApiProperty({ example: 'ANNUAL_LEAVE' })
  @IsDefined()
  value: unknown;
}

export class FormFileConfigDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  multiple: boolean;

  @ApiProperty({ type: [String], example: ['application/pdf', 'image/jpeg'] })
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsString({ each: true })
  allowedMimeTypes: string[];

  @ApiProperty({ example: 10485760, minimum: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  maxFileSizeBytes: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  maxFiles: number;
}

export class FormFieldDto {
  @ApiProperty({ example: 'reason', pattern: '^[A-Za-z][A-Za-z0-9_]*$', maxLength: 80 })
  @Transform(trim) @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_]*$/) @MaxLength(80)
  key: string;

  @ApiProperty({ example: 'Lý do', maxLength: 160 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160)
  label: string;

  @ApiProperty({ enum: formFieldTypes, example: 'TEXTAREA' })
  @IsIn(formFieldTypes)
  type: FormFieldType;

  @ApiProperty({ example: true })
  @IsBoolean()
  required: boolean;

  @ApiProperty({ example: 10, minimum: 0 })
  @Type(() => Number) @IsInt() @Min(0)
  order: number;

  @ApiPropertyOptional({ example: 'Nhập lý do', maxLength: 300 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  placeholder?: string;

  @ApiPropertyOptional({ example: 'Mô tả ngắn gọn lý do.', maxLength: 1000 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  helpText?: string;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ type: [FormFieldOptionDto] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FormFieldOptionDto)
  options?: FormFieldOptionDto[];

  @ApiPropertyOptional({ type: FormFieldValidationDto })
  @IsOptional() @ValidateNested() @Type(() => FormFieldValidationDto)
  validation?: FormFieldValidationDto;

  @ApiPropertyOptional({ type: FormFieldVisibilityConditionDto })
  @IsOptional() @ValidateNested() @Type(() => FormFieldVisibilityConditionDto)
  visibilityCondition?: FormFieldVisibilityConditionDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional() @IsObject()
  layout?: Record<string, unknown>;

  @ApiPropertyOptional({ type: FormFileConfigDto })
  @IsOptional() @ValidateNested() @Type(() => FormFileConfigDto)
  fileConfig?: FormFileConfigDto;
}

export class FormSettingsDto {
  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional() @IsBoolean()
  allowSaveDraft?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional() @IsBoolean()
  allowCancelAfterSubmit?: boolean;

  @ApiPropertyOptional({ example: 'Phiếu {{requestNo}}', maxLength: 300 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  titleTemplate?: string;

  @ApiPropertyOptional({ example: 'Vui lòng nhập đầy đủ thông tin.', maxLength: 2000 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  instructions?: string;
}

export class CreateFormDefinitionDto {
  @ApiProperty({ example: 'LEAVE_REQUEST', pattern: '^[A-Z][A-Z0-9_]*$', maxLength: 80 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @IsNotEmpty() @MaxLength(80) @Matches(/^[A-Z][A-Z0-9_]*$/)
  code: string;

  @ApiProperty({ example: 'Phiếu xin nghỉ', maxLength: 160 })
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  description?: string;

  @ApiProperty({ type: [FormFieldDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FormFieldDto)
  fields: FormFieldDto[];

  @ApiPropertyOptional({ type: FormSettingsDto })
  @IsOptional() @ValidateNested() @Type(() => FormSettingsDto)
  settings?: FormSettingsDto;
}

export class UpdateFormDefinitionDto {
  @ApiPropertyOptional({ example: 'Phiếu xin nghỉ', maxLength: 160 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [FormFieldDto] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FormFieldDto)
  fields?: FormFieldDto[];

  @ApiPropertyOptional({ type: FormSettingsDto })
  @IsOptional() @ValidateNested() @Type(() => FormSettingsDto)
  settings?: FormSettingsDto;
}

export class CloneFormDefinitionDto {
  @ApiPropertyOptional({ example: 'Phiếu xin nghỉ - phiên bản mới', maxLength: 160 })
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  description?: string;
}

export class ValidateDynamicFormDto {
  @ApiProperty({ type: 'object', additionalProperties: true, example: { reason: 'Nghỉ phép năm' } })
  @IsObject()
  formData: Record<string, unknown>;
}

export class FormDefinitionIdParamDto {
  @ApiProperty({ example: '66d0f0b74d5b5d4e65e75123' })
  @IsMongoId()
  id: string;
}

export const formDefinitionSortFields = ['code', 'name', 'status', 'version', 'createdAt', 'updatedAt'] as const;
export type FormDefinitionSortField = (typeof formDefinitionSortFields)[number];

export class ListFormDefinitionsDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: definitionStatuses })
  @IsOptional() @IsIn(definitionStatuses)
  status?: DefinitionStatus;

  @ApiPropertyOptional({ enum: formDefinitionSortFields, default: 'updatedAt' })
  @IsOptional() @IsIn(formDefinitionSortFields)
  sortBy: FormDefinitionSortField = 'updatedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 20;
}

export class FormDefinitionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() version: number;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ enum: definitionStatuses }) status: DefinitionStatus;
  @ApiProperty({ type: [FormFieldDto] }) fields: FormFieldDto[];
  @ApiProperty({ type: FormSettingsDto }) settings: FormSettingsDto;
  @ApiPropertyOptional() previousVersionId?: string;
  @ApiPropertyOptional({ example: { id: '66d0f0b74d5b5d4e65e75123', name: 'Nguyễn Văn A' } })
  updatedBy?: { id: string; name: string };
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class DynamicFormValidationErrorDto {
  @ApiProperty({ example: 'reason' }) fieldKey: string;
  @ApiProperty({ example: 'REQUIRED' }) code: string;
  @ApiProperty({ example: 'Trường Lý do là bắt buộc.' }) message: string;
}

export class DynamicFormValidationResponseDto {
  @ApiProperty({ example: false }) valid: boolean;
  @ApiProperty({ type: [DynamicFormValidationErrorDto] }) errors: DynamicFormValidationErrorDto[];
}
