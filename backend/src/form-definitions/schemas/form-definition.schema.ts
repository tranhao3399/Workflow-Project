import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const definitionStatuses = ['DRAFT', 'PUBLISHED', 'INACTIVE', 'ARCHIVED'] as const;
export type DefinitionStatus = (typeof definitionStatuses)[number];

export const formCategories = ['HR', 'ADMIN', 'FINANCE', 'PROCUREMENT', 'IT', 'OTHER'] as const;
export type FormCategory = (typeof formCategories)[number];

export const formFieldTypes = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'CURRENCY',
  'EMAIL',
  'PHONE',
  'DATE',
  'DATETIME',
  'SELECT',
  'MULTI_SELECT',
  'RADIO',
  'CHECKBOX',
  'BOOLEAN',
  'FILE',
  'TABLE',
  'SECTION',
] as const;
export type FormFieldType = (typeof formFieldTypes)[number];

export const tableColumnTypes = ['TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'SELECT', 'BOOLEAN'] as const;
export type TableColumnType = (typeof tableColumnTypes)[number];

export const visibilityOperators = ['EQUALS', 'NOT_EQUALS', 'IN', 'GREATER_THAN', 'LESS_THAN'] as const;
export type VisibilityOperator = (typeof visibilityOperators)[number];

export const formAutoFillSources = [
  'REQUEST_CODE',
  'REQUEST_STATUS',
  'REQUESTER_EMPLOYEE_CODE',
  'REQUESTER_FULL_NAME',
  'REQUESTER_EMAIL',
  'REQUESTER_PHONE',
  'REQUESTER_DEPARTMENT_NAME',
  'REQUESTER_WORK_UNIT_NAME',
  'REQUESTER_POSITION_NAME',
  'REQUESTER_ANNUAL_LEAVE_DAYS',
  'REQUESTER_DIRECT_MANAGER_NAME',
  'CURRENT_DATE',
] as const;
export type FormAutoFillSource = (typeof formAutoFillSources)[number];

@Schema({ _id: false })
export class FormFieldAutoFill {
  @Prop({ required: true, type: String, enum: formAutoFillSources }) source: FormAutoFillSource;
  @Prop({ required: true, default: true }) readOnly: boolean;
}
export const FormFieldAutoFillSchema = SchemaFactory.createForClass(FormFieldAutoFill);

@Schema({ _id: false })
export class FormFieldOption {
  @Prop({ required: true, trim: true, maxlength: 160 }) value: string;
  @Prop({ required: true, trim: true, maxlength: 160 }) label: string;
  @Prop({ required: true, min: 0 }) order: number;
  @Prop({ required: true, default: true }) isActive: boolean;
}
export const FormFieldOptionSchema = SchemaFactory.createForClass(FormFieldOption);

@Schema({ _id: false })
export class FormFieldValidation {
  @Prop({ required: false }) min?: number;
  @Prop({ required: false }) max?: number;
  @Prop({ required: false, min: 0 }) minLength?: number;
  @Prop({ required: false, min: 0 }) maxLength?: number;
  @Prop({ required: false, trim: true, maxlength: 200 }) pattern?: string;
  @Prop({ required: false, trim: true, maxlength: 500 }) errorMessage?: string;
}
export const FormFieldValidationSchema = SchemaFactory.createForClass(FormFieldValidation);

@Schema({ _id: false })
export class FormFieldVisibilityCondition {
  @Prop({ required: true, trim: true, maxlength: 80 }) fieldKey: string;
  @Prop({ required: true, type: String, enum: visibilityOperators }) operator: VisibilityOperator;
  @Prop({ required: true, type: MongooseSchema.Types.Mixed }) value: unknown;
}
export const FormFieldVisibilityConditionSchema = SchemaFactory.createForClass(FormFieldVisibilityCondition);

@Schema({ _id: false })
export class FormFileConfig {
  @Prop({ required: true, default: false }) multiple: boolean;
  @Prop({ type: [String], required: true, validate: (values: string[]) => values.length > 0 }) allowedMimeTypes: string[];
  @Prop({ required: true, min: 1 }) maxFileSizeBytes: number;
  @Prop({ required: true, min: 1 }) maxFiles: number;
}
export const FormFileConfigSchema = SchemaFactory.createForClass(FormFileConfig);

@Schema({ _id: false })
export class FormTableColumn {
  @Prop({ required: true, trim: true, maxlength: 80, match: /^[A-Za-z][A-Za-z0-9_]*$/ }) key: string;
  @Prop({ required: true, trim: true, maxlength: 160 }) label: string;
  @Prop({ required: true, type: String, enum: tableColumnTypes }) type: TableColumnType;
  @Prop({ required: true, default: false }) required: boolean;
  @Prop({ required: true, min: 0 }) order: number;
  @Prop({ required: false, trim: true, maxlength: 300 }) placeholder?: string;
  @Prop({ type: [FormFieldOptionSchema], required: false, default: undefined }) options?: FormFieldOption[];
  @Prop({ type: FormFieldValidationSchema, required: false }) validation?: FormFieldValidation;
  @Prop({ required: false, trim: true, maxlength: 500 }) formula?: string;
}
export const FormTableColumnSchema = SchemaFactory.createForClass(FormTableColumn);

@Schema({ _id: false })
export class FormTableConfig {
  @Prop({ type: [FormTableColumnSchema], required: true, validate: (columns: FormTableColumn[]) => columns.length > 0 })
  columns: FormTableColumn[];
  @Prop({ required: true, min: 0, max: 100, default: 0 }) minRows: number;
  @Prop({ required: true, min: 1, max: 100, default: 50 }) maxRows: number;
  @Prop({ required: true, default: true }) allowAddRows: boolean;
  @Prop({ required: true, default: true }) allowRemoveRows: boolean;
}
export const FormTableConfigSchema = SchemaFactory.createForClass(FormTableConfig);

@Schema({ _id: false })
export class FormField {
  @Prop({ required: true, trim: true, maxlength: 80, match: /^[A-Za-z][A-Za-z0-9_]*$/ }) key: string;
  @Prop({ required: true, trim: true, maxlength: 160 }) label: string;
  @Prop({ required: true, type: String, enum: formFieldTypes }) type: FormFieldType;
  @Prop({ required: true, default: false }) required: boolean;
  @Prop({ required: true, min: 0 }) order: number;
  @Prop({ required: false, trim: true, maxlength: 300 }) placeholder?: string;
  @Prop({ required: false, trim: true, maxlength: 1000 }) helpText?: string;
  @Prop({ required: false, type: MongooseSchema.Types.Mixed }) defaultValue?: unknown;
  @Prop({ type: [FormFieldOptionSchema], required: false, default: undefined }) options?: FormFieldOption[];
  @Prop({ type: FormFieldValidationSchema, required: false }) validation?: FormFieldValidation;
  @Prop({ type: FormFieldVisibilityConditionSchema, required: false }) visibilityCondition?: FormFieldVisibilityCondition;
  @Prop({ type: FormFieldAutoFillSchema, required: false }) autoFill?: FormFieldAutoFill;
  @Prop({ required: false, trim: true, maxlength: 500 }) formula?: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: false }) layout?: Record<string, unknown>;
  @Prop({ type: FormFileConfigSchema, required: false }) fileConfig?: FormFileConfig;
  @Prop({ type: FormTableConfigSchema, required: false }) tableConfig?: FormTableConfig;
}
export const FormFieldSchema = SchemaFactory.createForClass(FormField);

@Schema({ _id: false })
export class FormLeaveDeductionSettings {
  @Prop({ required: true, default: false }) enabled: boolean;
  @Prop({ required: false, trim: true, maxlength: 80 }) fieldKey?: string;
  @Prop({ required: false, default: false }) allowNegative?: boolean;
}
export const FormLeaveDeductionSettingsSchema = SchemaFactory.createForClass(FormLeaveDeductionSettings);

@Schema({ _id: false })
export class FormSettings {
  @Prop({ required: true, default: true }) allowSaveDraft: boolean;
  @Prop({ required: true, default: false }) allowCancelAfterSubmit: boolean;
  @Prop({ required: false, trim: true, maxlength: 300 }) titleTemplate?: string;
  @Prop({ required: false, trim: true, maxlength: 2000 }) instructions?: string;
  @Prop({ type: FormLeaveDeductionSettingsSchema, required: false })
  leaveDeduction?: FormLeaveDeductionSettings;
}
export const FormSettingsSchema = SchemaFactory.createForClass(FormSettings);

export type FormDefinitionDocument = HydratedDocument<FormDefinition>;

@Schema({ timestamps: true, collection: 'form_definitions' })
export class FormDefinition {
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 80, match: /^[A-Z][A-Z0-9_]*$/ }) code: string;
  @Prop({ required: true, min: 1 }) version: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'FormDefinition', required: false }) previousVersionId?: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 160 }) name: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'FormGroup', required: false, index: true }) groupId?: Types.ObjectId;
  @Prop({ required: false, type: String, enum: formCategories }) category?: FormCategory;
  @Prop({ required: false, trim: true, maxlength: 2000 }) description?: string;
  @Prop({ required: true, type: String, enum: definitionStatuses, default: 'DRAFT' }) status: DefinitionStatus;
  @Prop({ type: [FormFieldSchema], required: true, validate: (fields: FormField[]) => fields.length > 0 }) fields: FormField[];
  @Prop({ type: FormSettingsSchema, required: true, default: () => ({}) }) settings: FormSettings;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) createdBy: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) updatedBy?: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false }) publishedBy?: Types.ObjectId;
  @Prop({ required: false }) publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const FormDefinitionSchema = SchemaFactory.createForClass(FormDefinition);
FormDefinitionSchema.pre('validate', function validateDefinition() {
  const optionTypes = new Set<FormFieldType>(['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX']);
  const keys = new Set<string>();
  for (const [index, field] of this.fields.entries()) {
    if (keys.has(field.key)) this.invalidate(`fields.${index}.key`, `Duplicate form field key: ${field.key}`);
    keys.add(field.key);
    if (optionTypes.has(field.type) && !field.options?.length) {
      this.invalidate(`fields.${index}.options`, `${field.type} requires at least one option`);
    }
    if (field.type === 'FILE' && !field.fileConfig) this.invalidate(`fields.${index}.fileConfig`, 'FILE requires fileConfig');
    if (field.type !== 'FILE' && field.fileConfig) this.invalidate(`fields.${index}.fileConfig`, 'fileConfig is only valid for FILE');
    if (field.type === 'TABLE' && !field.tableConfig) this.invalidate(`fields.${index}.tableConfig`, 'TABLE requires tableConfig');
    if (field.type !== 'TABLE' && field.tableConfig) this.invalidate(`fields.${index}.tableConfig`, 'tableConfig is only valid for TABLE');
    if (field.type === 'TABLE' && field.tableConfig) {
      const columnKeys = new Set<string>();
      for (const [columnIndex, column] of (field.tableConfig.columns ?? []).entries()) {
        if (columnKeys.has(column.key)) this.invalidate(`fields.${index}.tableConfig.columns.${columnIndex}.key`, `Duplicate table column key: ${column.key}`);
        columnKeys.add(column.key);
        if (column.type === 'SELECT' && !column.options?.length) {
          this.invalidate(`fields.${index}.tableConfig.columns.${columnIndex}.options`, 'SELECT table column requires at least one option');
        }
      }
      if (field.tableConfig.minRows > field.tableConfig.maxRows) {
        this.invalidate(`fields.${index}.tableConfig.maxRows`, 'maxRows must be greater than or equal to minRows');
      }
    }
    if (field.type === 'SECTION') {
      if (field.required) this.invalidate(`fields.${index}.required`, 'SECTION cannot be required');
      if (field.defaultValue !== undefined) this.invalidate(`fields.${index}.defaultValue`, 'SECTION cannot have a default value');
      if (field.validation) this.invalidate(`fields.${index}.validation`, 'SECTION cannot have validation rules');
      if (field.autoFill) this.invalidate(`fields.${index}.autoFill`, 'SECTION cannot use autoFill');
    }
  }
  for (const [index, field] of this.fields.entries()) {
    const dependency = field.visibilityCondition?.fieldKey;
    if (dependency && (!keys.has(dependency) || dependency === field.key)) {
      this.invalidate(`fields.${index}.visibilityCondition.fieldKey`, 'Visibility condition must reference another field in the form');
    }
  }
  if (this.status === 'PUBLISHED') {
    if (!this.publishedBy) this.invalidate('publishedBy', 'publishedBy is required for a published form');
    if (!this.publishedAt) this.invalidate('publishedAt', 'publishedAt is required for a published form');
  }
});
FormDefinitionSchema.index({ code: 1, version: 1 }, { unique: true });
FormDefinitionSchema.index({ status: 1, updatedAt: -1 });
FormDefinitionSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { status: 'PUBLISHED' }, name: 'uniq_published_form_code' },
);
FormDefinitionSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { status: 'DRAFT' }, name: 'uniq_draft_form_code' },
);
