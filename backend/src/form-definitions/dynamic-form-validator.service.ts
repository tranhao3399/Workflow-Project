import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  formAutoFillSources,
  formFieldTypes,
  tableColumnTypes,
  visibilityOperators,
  type FormAutoFillSource,
  type FormField,
  type FormFieldType,
  type TableColumnType,
  type VisibilityOperator,
} from './schemas/form-definition.schema.js';

const AUTO_FILL_ALLOWED_FIELD_TYPES: Readonly<Record<FormAutoFillSource, ReadonlySet<FormFieldType>>> = {
  REQUEST_CODE: new Set(['TEXT']),
  REQUEST_STATUS: new Set(['TEXT']),
  REQUESTER_EMPLOYEE_CODE: new Set(['TEXT', 'TEXTAREA']),
  REQUESTER_FULL_NAME: new Set(['TEXT', 'TEXTAREA']),
  REQUESTER_EMAIL: new Set(['EMAIL', 'TEXT', 'TEXTAREA']),
  REQUESTER_PHONE: new Set(['PHONE', 'TEXT', 'TEXTAREA']),
  REQUESTER_DEPARTMENT_NAME: new Set(['TEXT', 'TEXTAREA']),
  REQUESTER_WORK_UNIT_NAME: new Set(['TEXT', 'TEXTAREA']),
  REQUESTER_POSITION_NAME: new Set(['TEXT', 'TEXTAREA']),
  CURRENT_DATE: new Set(['DATE', 'DATETIME', 'TEXT']),
};

const OPTION_FIELD_TYPES = new Set<FormFieldType>(['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX']);
const TEXT_FIELD_TYPES = new Set<FormFieldType>(['TEXT', 'TEXTAREA', 'EMAIL', 'PHONE']);
const NUMBER_FIELD_TYPES = new Set<FormFieldType>(['NUMBER', 'CURRENCY']);
const MAX_PATTERN_LENGTH = 200;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_FILES_PER_FIELD = 100;
const MAX_TABLE_ROWS = 100;
const MAX_TABLE_COLUMNS = 30;
const MIME_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;
const SYSTEM_REQUEST_FIELDS = [
  { key: 'request_code', label: 'Mã phiếu', source: 'REQUEST_CODE' },
  { key: 'request_status', label: 'Trạng thái', source: 'REQUEST_STATUS' },
] as const;

export interface DefinitionValidationError {
  path: string;
  code: string;
  message: string;
}

export interface DynamicFormValidationError {
  fieldKey: string;
  code: string;
  message: string;
}

export interface DynamicFormValidationResult {
  valid: boolean;
  errors: DynamicFormValidationError[];
}

export interface DynamicFormSource {
  fields: readonly unknown[];
}

@Injectable()
export class DynamicFormValidatorService {
  ensureSystemRequestFields(fields: readonly FormField[]): FormField[];
  ensureSystemRequestFields(fields: readonly unknown[]): unknown[];
  ensureSystemRequestFields(fields: readonly unknown[]): unknown[] {
    const seen = new Set<FormAutoFillSource>();
    const normalized = fields.flatMap((field) => {
      if (!this.isRecord(field)) return [field];
      const plainField = this.toPlainRecord(field);
      const autoFill = this.isRecord(field.autoFill) ? field.autoFill : undefined;
      const source = autoFill?.source;
      const template = SYSTEM_REQUEST_FIELDS.find((item) => item.source === source);
      if (!template) {
        if (this.isRecord(plainField.autoFill) && plainField.autoFill.readOnly === true) {
          plainField.required = false;
        }
        return [plainField];
      }
      if (seen.has(template.source)) return [];
      seen.add(template.source);
      return [{
        ...plainField,
        key: template.key,
        label: template.label,
        type: 'TEXT',
        required: false,
        autoFill: { source: template.source, readOnly: true },
      }];
    });
    const missing = SYSTEM_REQUEST_FIELDS
      .filter((template) => !seen.has(template.source))
      .map((template) => ({
        key: template.key,
        label: template.label,
        type: 'TEXT',
        required: false,
        placeholder: 'Dữ liệu được tự động điền khi tạo phiếu',
        layout: { columnSpan: 6 },
        autoFill: { source: template.source, readOnly: true },
      }));
    return [...missing, ...normalized].map((field, index) => (
      this.isRecord(field) ? { ...field, order: (index + 1) * 10 } : field
    ));
  }

  assertSystemRequestFieldsValid(fields: readonly unknown[]): void {
    for (const template of SYSTEM_REQUEST_FIELDS) {
      const matches = fields.filter((field) => {
        if (!this.isRecord(field) || !this.isRecord(field.autoFill)) return false;
        return field.autoFill.source === template.source;
      });
      const field = matches[0];
      if (
        matches.length !== 1 ||
        !this.isRecord(field) ||
        field.key !== template.key ||
        field.type !== 'TEXT' ||
        field.required === true ||
        !this.isRecord(field.autoFill) ||
        field.autoFill.readOnly !== true
      ) {
        throw new BadRequestException({
          message: `Biểu mẫu phải có đúng một trường hệ thống ${template.label} và không được thay đổi cấu hình trường này.`,
          field: 'fields',
        });
      }
    }
  }

  validateDefinition(fields: readonly unknown[]): DefinitionValidationError[] {
    const errors: DefinitionValidationError[] = [];
    const fieldsByKey = new Map<string, Record<string, unknown>>();
    if (fields.length === 0) {
      errors.push({ path: 'fields', code: 'FIELDS_REQUIRED', message: 'Biểu mẫu cần ít nhất một trường.' });
      return errors;
    }

    for (const [index, value] of fields.entries()) {
      const path = `fields.${index}`;
      if (!this.isRecord(value)) {
        errors.push({ path, code: 'INVALID_FIELD', message: 'Cấu hình trường không hợp lệ.' });
        continue;
      }
      const key = value.key;
      if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
        errors.push({ path: `${path}.key`, code: 'INVALID_FIELD_KEY', message: 'fieldKey không đúng định dạng.' });
        continue;
      }
      if (fieldsByKey.has(key)) {
        errors.push({ path: `${path}.key`, code: 'DUPLICATE_FIELD_KEY', message: `fieldKey ${key} bị trùng.` });
      } else {
        fieldsByKey.set(key, value);
      }
      if (!this.isFormFieldType(value.type)) {
        errors.push({ path: `${path}.type`, code: 'INVALID_FIELD_TYPE', message: `Kiểu của trường ${key} không hợp lệ.` });
        continue;
      }
      this.validateOptions(value, path, errors);
      this.validateFieldRules(value, path, errors);
      this.validateAutoFill(value, path, errors);
      this.validateFileConfig(value, path, errors);
      this.validateTableConfig(value, path, errors);
      this.validateSectionConfig(value, path, errors);
      if (value.defaultValue !== undefined && value.type !== 'SECTION') {
        const defaultErrors: DynamicFormValidationError[] = [];
        this.validateFieldValue(value, value.defaultValue, defaultErrors);
        for (const error of defaultErrors) {
          errors.push({
            path: `${path}.defaultValue`,
            code: `INVALID_DEFAULT_${error.code}`,
            message: `Giá trị mặc định của trường ${key} không hợp lệ: ${error.message}`,
          });
        }
      }
    }

    for (const [index, value] of fields.entries()) {
      if (!this.isRecord(value) || typeof value.key !== 'string') continue;
      const condition = value.visibilityCondition;
      if (condition === undefined) continue;
      if (!this.isRecord(condition) || typeof condition.fieldKey !== 'string') {
        errors.push({
          path: `fields.${index}.visibilityCondition`,
          code: 'INVALID_VISIBILITY_CONDITION',
          message: `Điều kiện hiển thị của trường ${value.key} không hợp lệ.`,
        });
        continue;
      }
      if (!fieldsByKey.has(condition.fieldKey) || condition.fieldKey === value.key) {
        errors.push({
          path: `fields.${index}.visibilityCondition.fieldKey`,
          code: 'INVALID_VISIBILITY_REFERENCE',
          message: `Điều kiện hiển thị của ${value.key} phải tham chiếu một trường khác đang tồn tại.`,
        });
      }
      if (!this.isVisibilityOperator(condition.operator)) {
        errors.push({
          path: `fields.${index}.visibilityCondition.operator`,
          code: 'INVALID_VISIBILITY_OPERATOR',
          message: `Toán tử hiển thị của trường ${value.key} không hợp lệ.`,
        });
      }
      if (!Object.prototype.hasOwnProperty.call(condition, 'value')) {
        errors.push({
          path: `fields.${index}.visibilityCondition.value`,
          code: 'VISIBILITY_VALUE_REQUIRED',
          message: `Điều kiện hiển thị của trường ${value.key} cần giá trị so sánh.`,
        });
      }
    }
    this.validateVisibilityCycles(fieldsByKey, errors);
    return errors;
  }

  assertDefinitionValid(fields: readonly unknown[]): void {
    const errors = this.validateDefinition(fields);
    if (!errors.length) return;
    throw new BadRequestException({
      message: errors.map((error) => error.message).join(' '),
      field: errors[0].path,
    });
  }

  validateFormData(source: DynamicFormSource, formData: Record<string, unknown>): DynamicFormValidationResult {
    const definitionErrors = this.validateDefinition(source.fields);
    if (definitionErrors.length) {
      return {
        valid: false,
        errors: definitionErrors.map((error) => ({
          fieldKey: '$definition',
          code: error.code,
          message: error.message,
        })),
      };
    }

    const fields = source.fields.filter((field): field is Record<string, unknown> => this.isRecord(field));
    const fieldsByKey = new Map(fields.map((field) => [String(field.key), field]));
    const inputFieldKeys = new Set(
      fields
        .filter((field) => field.type !== 'SECTION')
        .map((field) => String(field.key)),
    );
    const errors: DynamicFormValidationError[] = [];
    for (const key of Object.keys(formData)) {
      if (!inputFieldKeys.has(key)) {
        errors.push({ fieldKey: key, code: 'UNKNOWN_FIELD', message: `Trường ${key} không được khai báo trong biểu mẫu.` });
      }
    }

    const visibility = new Map<string, boolean>();
    for (const field of fields) {
      if (field.type === 'SECTION') continue;
      const key = String(field.key);
      const visible = this.isFieldVisible(key, fieldsByKey, formData, visibility, new Set());
      const value = formData[key];
      if (visible && field.required === true && this.isEmpty(value)) {
        errors.push({ fieldKey: key, code: 'REQUIRED', message: `Trường ${this.fieldLabel(field)} là bắt buộc.` });
        continue;
      }
      if (!this.isEmpty(value)) this.validateFieldValue(field, value, errors);
    }
    return { valid: errors.length === 0, errors };
  }

  validateSnapshot(snapshot: Record<string, unknown>, formData: Record<string, unknown>): DynamicFormValidationResult {
    if (!Array.isArray(snapshot.fields)) {
      return {
        valid: false,
        errors: [{ fieldKey: '$definition', code: 'INVALID_SNAPSHOT', message: 'Form Snapshot không chứa danh sách trường hợp lệ.' }],
      };
    }
    return this.validateFormData({ fields: snapshot.fields }, formData);
  }

  assertFormDataValid(source: DynamicFormSource, formData: Record<string, unknown>): void {
    const result = this.validateFormData(source, formData);
    if (result.valid) return;
    throw new BadRequestException({
      message: result.errors.map((error) => error.message).join(' '),
      field: result.errors[0]?.fieldKey,
    });
  }

  private validateOptions(
    field: Record<string, unknown>,
    path: string,
    errors: DefinitionValidationError[],
  ): void {
    if (!this.isFormFieldType(field.type)) return;
    const options = field.options;
    if (OPTION_FIELD_TYPES.has(field.type)) {
      if (!Array.isArray(options) || options.length === 0) {
        errors.push({ path: `${path}.options`, code: 'OPTIONS_REQUIRED', message: `${field.type} cần ít nhất một lựa chọn.` });
        return;
      }
      const values = new Set<string>();
      for (const [optionIndex, option] of options.entries()) {
        if (!this.isRecord(option) || typeof option.value !== 'string' || !option.value.trim()) {
          errors.push({
            path: `${path}.options.${optionIndex}.value`,
            code: 'INVALID_OPTION_VALUE',
            message: 'Giá trị lựa chọn không hợp lệ.',
          });
          continue;
        }
        if (values.has(option.value)) {
          errors.push({
            path: `${path}.options.${optionIndex}.value`,
            code: 'DUPLICATE_OPTION_VALUE',
            message: `Giá trị lựa chọn ${option.value} bị trùng.`,
          });
        }
        values.add(option.value);
      }
      return;
    }
    if (Array.isArray(options) && options.length > 0) {
      errors.push({ path: `${path}.options`, code: 'OPTIONS_NOT_ALLOWED', message: `${field.type} không được cấu hình danh sách lựa chọn.` });
    }
  }

  private validateFieldRules(
    field: Record<string, unknown>,
    path: string,
    errors: DefinitionValidationError[],
  ): void {
    if (!this.isFormFieldType(field.type) || field.validation === undefined) return;
    if (!this.isRecord(field.validation)) {
      errors.push({ path: `${path}.validation`, code: 'INVALID_VALIDATION', message: 'Cấu hình validator không hợp lệ.' });
      return;
    }
    const rules = field.validation;
    const hasNumberRule = rules.min !== undefined || rules.max !== undefined;
    const hasTextRule = rules.minLength !== undefined || rules.maxLength !== undefined || rules.pattern !== undefined;
    if (hasNumberRule && !NUMBER_FIELD_TYPES.has(field.type)) {
      errors.push({ path: `${path}.validation`, code: 'INVALID_NUMERIC_VALIDATOR', message: `${field.type} không hỗ trợ min/max.` });
    }
    if (hasTextRule && !TEXT_FIELD_TYPES.has(field.type)) {
      errors.push({ path: `${path}.validation`, code: 'INVALID_TEXT_VALIDATOR', message: `${field.type} không hỗ trợ minLength/maxLength/pattern.` });
    }
    if (rules.min !== undefined && (typeof rules.min !== 'number' || !Number.isFinite(rules.min))) {
      errors.push({ path: `${path}.validation.min`, code: 'INVALID_MIN', message: 'min phải là số hữu hạn.' });
    }
    if (rules.max !== undefined && (typeof rules.max !== 'number' || !Number.isFinite(rules.max))) {
      errors.push({ path: `${path}.validation.max`, code: 'INVALID_MAX', message: 'max phải là số hữu hạn.' });
    }
    if (rules.minLength !== undefined && !this.isNonNegativeInteger(rules.minLength)) {
      errors.push({ path: `${path}.validation.minLength`, code: 'INVALID_MIN_LENGTH', message: 'minLength phải là số nguyên không âm.' });
    }
    if (rules.maxLength !== undefined && !this.isNonNegativeInteger(rules.maxLength)) {
      errors.push({ path: `${path}.validation.maxLength`, code: 'INVALID_MAX_LENGTH', message: 'maxLength phải là số nguyên không âm.' });
    }
    if (typeof rules.min === 'number' && typeof rules.max === 'number' && rules.min > rules.max) {
      errors.push({ path: `${path}.validation`, code: 'INVALID_RANGE', message: 'min không được lớn hơn max.' });
    }
    if (
      typeof rules.minLength === 'number'
      && typeof rules.maxLength === 'number'
      && rules.minLength > rules.maxLength
    ) {
      errors.push({ path: `${path}.validation`, code: 'INVALID_LENGTH_RANGE', message: 'minLength không được lớn hơn maxLength.' });
    }
    if (rules.pattern !== undefined) {
      if (typeof rules.pattern !== 'string' || !this.isSafePattern(rules.pattern)) {
        errors.push({
          path: `${path}.validation.pattern`,
          code: 'UNSAFE_PATTERN',
          message: 'Regex không hợp lệ hoặc có nguy cơ ReDoS.',
        });
      }
    }
  }

  private validateAutoFill(
    field: Record<string, unknown>,
    path: string,
    errors: DefinitionValidationError[],
  ): void {
    if (!this.isFormFieldType(field.type) || field.autoFill === undefined) return;
    if (!this.isRecord(field.autoFill)) {
      errors.push({
        path: `${path}.autoFill`,
        code: 'INVALID_AUTO_FILL',
        message: 'Cấu hình tự động điền không hợp lệ.',
      });
      return;
    }
    const source = field.autoFill.source;
    if (!this.isAutoFillSource(source)) {
      errors.push({
        path: `${path}.autoFill.source`,
        code: 'INVALID_AUTO_FILL_SOURCE',
        message: 'Nguồn tự động điền không hợp lệ.',
      });
      return;
    }
    if (!AUTO_FILL_ALLOWED_FIELD_TYPES[source].has(field.type)) {
      errors.push({
        path: `${path}.autoFill.source`,
        code: 'INCOMPATIBLE_AUTO_FILL_SOURCE',
        message: `Loại trường ${field.type} không hỗ trợ nguồn tự động điền ${source}.`,
      });
    }
    if (typeof field.autoFill.readOnly !== 'boolean') {
      errors.push({
        path: `${path}.autoFill.readOnly`,
        code: 'INVALID_AUTO_FILL_READ_ONLY',
        message: 'Cấu hình khóa trường tự động điền phải là kiểu boolean.',
      });
    }
  }

  private validateFileConfig(
    field: Record<string, unknown>,
    path: string,
    errors: DefinitionValidationError[],
  ): void {
    if (!this.isFormFieldType(field.type)) return;
    if (field.type !== 'FILE') {
      if (field.fileConfig !== undefined) {
        errors.push({ path: `${path}.fileConfig`, code: 'FILE_CONFIG_NOT_ALLOWED', message: 'fileConfig chỉ dùng cho trường FILE.' });
      }
      return;
    }
    if (!this.isRecord(field.fileConfig)) {
      errors.push({ path: `${path}.fileConfig`, code: 'FILE_CONFIG_REQUIRED', message: 'Trường FILE cần fileConfig hợp lệ.' });
      return;
    }
    const config = field.fileConfig;
    if (!Array.isArray(config.allowedMimeTypes) || config.allowedMimeTypes.length === 0) {
      errors.push({ path: `${path}.fileConfig.allowedMimeTypes`, code: 'MIME_TYPES_REQUIRED', message: 'FILE cần allowedMimeTypes.' });
    } else {
      const normalizedMimeTypes = config.allowedMimeTypes
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase());
      if (
        normalizedMimeTypes.length !== config.allowedMimeTypes.length
        || normalizedMimeTypes.some((value) => !MIME_TYPE_PATTERN.test(value))
      ) {
        errors.push({ path: `${path}.fileConfig.allowedMimeTypes`, code: 'INVALID_MIME_TYPE', message: 'Có MIME type không hợp lệ.' });
      }
      if (new Set(normalizedMimeTypes).size !== normalizedMimeTypes.length) {
        errors.push({ path: `${path}.fileConfig.allowedMimeTypes`, code: 'DUPLICATE_MIME_TYPE', message: 'allowedMimeTypes không được trùng.' });
      }
    }
    if (!this.isPositiveInteger(config.maxFileSizeBytes) || config.maxFileSizeBytes > MAX_FILE_SIZE_BYTES) {
      errors.push({ path: `${path}.fileConfig.maxFileSizeBytes`, code: 'INVALID_MAX_FILE_SIZE', message: `maxFileSizeBytes phải từ 1 đến ${MAX_FILE_SIZE_BYTES}.` });
    }
    if (!this.isPositiveInteger(config.maxFiles) || config.maxFiles > MAX_FILES_PER_FIELD) {
      errors.push({ path: `${path}.fileConfig.maxFiles`, code: 'INVALID_MAX_FILES', message: `maxFiles phải từ 1 đến ${MAX_FILES_PER_FIELD}.` });
    }
    if (config.multiple !== true && config.multiple !== false) {
      errors.push({ path: `${path}.fileConfig.multiple`, code: 'INVALID_MULTIPLE', message: 'multiple phải là boolean.' });
    }
    if (config.multiple === false && config.maxFiles !== 1) {
      errors.push({ path: `${path}.fileConfig.maxFiles`, code: 'INVALID_SINGLE_FILE_LIMIT', message: 'FILE không multiple phải có maxFiles bằng 1.' });
    }
  }

  private validateTableConfig(
    field: Record<string, unknown>,
    path: string,
    errors: DefinitionValidationError[],
  ): void {
    if (!this.isFormFieldType(field.type)) return;
    if (field.type !== 'TABLE') {
      if (field.tableConfig !== undefined) {
        errors.push({ path: `${path}.tableConfig`, code: 'TABLE_CONFIG_NOT_ALLOWED', message: 'tableConfig chỉ dùng cho trường TABLE.' });
      }
      return;
    }
    if (!this.isRecord(field.tableConfig) || Array.isArray(field.tableConfig)) {
      errors.push({ path: `${path}.tableConfig`, code: 'TABLE_CONFIG_REQUIRED', message: 'Trường TABLE cần tableConfig hợp lệ.' });
      return;
    }
    const config = field.tableConfig;
    if (!Array.isArray(config.columns) || config.columns.length === 0 || config.columns.length > MAX_TABLE_COLUMNS) {
      errors.push({ path: `${path}.tableConfig.columns`, code: 'INVALID_TABLE_COLUMNS', message: `Bảng cần từ 1 đến ${MAX_TABLE_COLUMNS} cột.` });
    } else {
      const keys = new Set<string>();
      for (const [columnIndex, column] of config.columns.entries()) {
        const columnPath = `${path}.tableConfig.columns.${columnIndex}`;
        if (!this.isRecord(column) || Array.isArray(column)) {
          errors.push({ path: columnPath, code: 'INVALID_TABLE_COLUMN', message: 'Cấu hình cột bảng không hợp lệ.' });
          continue;
        }
        if (typeof column.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(column.key)) {
          errors.push({ path: `${columnPath}.key`, code: 'INVALID_TABLE_COLUMN_KEY', message: 'Mã cột bảng không đúng định dạng.' });
        } else if (keys.has(column.key)) {
          errors.push({ path: `${columnPath}.key`, code: 'DUPLICATE_TABLE_COLUMN_KEY', message: `Mã cột ${column.key} bị trùng.` });
        } else {
          keys.add(column.key);
        }
        if (typeof column.label !== 'string' || !column.label.trim()) {
          errors.push({ path: `${columnPath}.label`, code: 'TABLE_COLUMN_LABEL_REQUIRED', message: 'Tên cột bảng là bắt buộc.' });
        }
        if (!this.isTableColumnType(column.type)) {
          errors.push({ path: `${columnPath}.type`, code: 'INVALID_TABLE_COLUMN_TYPE', message: 'Kiểu cột bảng không được hỗ trợ.' });
          continue;
        }
        this.validateOptions(column, columnPath, errors);
        this.validateFieldRules(column, columnPath, errors);
      }
    }
    if (!this.isNonNegativeInteger(config.minRows) || config.minRows > MAX_TABLE_ROWS) {
      errors.push({ path: `${path}.tableConfig.minRows`, code: 'INVALID_TABLE_MIN_ROWS', message: `Số dòng tối thiểu phải từ 0 đến ${MAX_TABLE_ROWS}.` });
    }
    if (!this.isPositiveInteger(config.maxRows) || config.maxRows > MAX_TABLE_ROWS) {
      errors.push({ path: `${path}.tableConfig.maxRows`, code: 'INVALID_TABLE_MAX_ROWS', message: `Số dòng tối đa phải từ 1 đến ${MAX_TABLE_ROWS}.` });
    }
    if (typeof config.minRows === 'number' && typeof config.maxRows === 'number' && config.minRows > config.maxRows) {
      errors.push({ path: `${path}.tableConfig.maxRows`, code: 'INVALID_TABLE_ROW_RANGE', message: 'Số dòng tối đa phải lớn hơn hoặc bằng số dòng tối thiểu.' });
    }
    if (typeof config.allowAddRows !== 'boolean' || typeof config.allowRemoveRows !== 'boolean') {
      errors.push({ path: `${path}.tableConfig`, code: 'INVALID_TABLE_ACTION_CONFIG', message: 'Cấu hình thêm, xóa dòng của bảng không hợp lệ.' });
    }
  }

  private validateVisibilityCycles(
    fieldsByKey: Map<string, Record<string, unknown>>,
    errors: DefinitionValidationError[],
  ): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const reported = new Set<string>();
    const visit = (key: string, trail: string[]): void => {
      if (visiting.has(key)) {
        const cycleStart = trail.indexOf(key);
        const cycle = [...trail.slice(Math.max(cycleStart, 0)), key];
        const signature = cycle.join(' -> ');
        if (!reported.has(signature)) {
          reported.add(signature);
          errors.push({ path: 'fields', code: 'VISIBILITY_CYCLE', message: `Phụ thuộc hiển thị tạo vòng lặp: ${signature}.` });
        }
        return;
      }
      if (visited.has(key)) return;
      visiting.add(key);
      const field = fieldsByKey.get(key);
      const condition = this.isRecord(field?.visibilityCondition) ? field.visibilityCondition : undefined;
      if (typeof condition?.fieldKey === 'string' && fieldsByKey.has(condition.fieldKey)) {
        visit(condition.fieldKey, [...trail, key]);
      }
      visiting.delete(key);
      visited.add(key);
    };
    for (const key of fieldsByKey.keys()) visit(key, []);
  }

  private validateSectionConfig(
    field: Record<string, unknown>,
    path: string,
    errors: DefinitionValidationError[],
  ): void {
    if (field.type !== 'SECTION') return;
    if (field.required === true) {
      errors.push({
        path: `${path}.required`,
        code: 'SECTION_CANNOT_BE_REQUIRED',
        message: 'Tiêu đề phân đoạn không phải trường nhập liệu nên không thể bắt buộc.',
      });
    }
    if (field.defaultValue !== undefined) {
      errors.push({
        path: `${path}.defaultValue`,
        code: 'SECTION_DEFAULT_NOT_ALLOWED',
        message: 'Tiêu đề phân đoạn không hỗ trợ giá trị mặc định.',
      });
    }
    if (field.validation !== undefined) {
      errors.push({
        path: `${path}.validation`,
        code: 'SECTION_VALIDATION_NOT_ALLOWED',
        message: 'Tiêu đề phân đoạn không hỗ trợ quy tắc kiểm tra dữ liệu.',
      });
    }
  }

  private validateFieldValue(
    field: Record<string, unknown>,
    value: unknown,
    errors: DynamicFormValidationError[],
  ): void {
    const key = String(field.key);
    if (!this.isFormFieldType(field.type)) return;
    const type = field.type;
    if (type === 'SECTION') {
      errors.push({ fieldKey: key, code: 'INVALID_TYPE', message: `${this.fieldLabel(field)} không nhận dữ liệu nhập.` });
      return;
    }
    if (type === 'TABLE') {
      this.validateTableValue(field, value, errors);
      return;
    }
    let typeValid = true;
    if (TEXT_FIELD_TYPES.has(type)) {
      typeValid = typeof value === 'string';
      if (type === 'EMAIL' && typeValid && !this.isEmail(value as string)) {
        errors.push({ fieldKey: key, code: 'INVALID_EMAIL', message: `${this.fieldLabel(field)} không phải email hợp lệ.` });
      }
      if (type === 'PHONE' && typeValid && !/^\+?\d{1,15}$/.test(value as string)) {
        errors.push({ fieldKey: key, code: 'INVALID_PHONE', message: `${this.fieldLabel(field)} chỉ được gồm tối đa 15 chữ số và có thể bắt đầu bằng dấu +.` });
      }
    } else if (NUMBER_FIELD_TYPES.has(type)) {
      typeValid = typeof value === 'number' && Number.isFinite(value);
    } else if (type === 'DATE') {
      typeValid = typeof value === 'string' && this.isDate(value);
    } else if (type === 'DATETIME') {
      typeValid = typeof value === 'string' && this.isDateTime(value);
    } else if (type === 'SELECT' || type === 'RADIO') {
      typeValid = typeof value === 'string' && this.optionValues(field).has(value);
    } else if (type === 'MULTI_SELECT' || type === 'CHECKBOX') {
      const allowed = this.optionValues(field);
      typeValid = Array.isArray(value)
        && value.every((entry) => typeof entry === 'string' && allowed.has(entry))
        && new Set(value).size === value.length;
    } else if (type === 'BOOLEAN') {
      typeValid = typeof value === 'boolean';
    } else if (type === 'FILE') {
      typeValid = this.isValidFileValue(field, value);
    }
    if (!typeValid) {
      errors.push({ fieldKey: key, code: 'INVALID_TYPE', message: `${this.fieldLabel(field)} không đúng kiểu ${type}.` });
      return;
    }
    if (NUMBER_FIELD_TYPES.has(type) && typeof value === 'number' && value < 0) {
      errors.push({ fieldKey: key, code: 'NON_NEGATIVE_REQUIRED', message: `${this.fieldLabel(field)} phải lớn hơn hoặc bằng 0.` });
      return;
    }
    if (type === 'CURRENCY' && typeof value === 'number' && !Number.isInteger(value)) {
      errors.push({ fieldKey: key, code: 'CURRENCY_INTEGER_REQUIRED', message: `${this.fieldLabel(field)} phải là số nguyên.` });
      return;
    }
    this.validateValueAgainstRules(field, value, errors);
  }

  private validateTableValue(
    field: Record<string, unknown>,
    value: unknown,
    errors: DynamicFormValidationError[],
  ): void {
    const fieldKey = String(field.key);
    const fieldLabel = this.fieldLabel(field);
    const config = this.isRecord(field.tableConfig) && !Array.isArray(field.tableConfig) ? field.tableConfig : undefined;
    if (!Array.isArray(value) || !config || !Array.isArray(config.columns)) {
      errors.push({ fieldKey, code: 'INVALID_TYPE', message: `${fieldLabel} không đúng định dạng bảng.` });
      return;
    }
    const minRows = typeof config.minRows === 'number' ? config.minRows : 0;
    const maxRows = typeof config.maxRows === 'number' ? config.maxRows : MAX_TABLE_ROWS;
    if (value.length < minRows) {
      errors.push({ fieldKey, code: 'TABLE_MIN_ROWS', message: `${fieldLabel} cần ít nhất ${minRows} dòng.` });
    }
    if (value.length > maxRows) {
      errors.push({ fieldKey, code: 'TABLE_MAX_ROWS', message: `${fieldLabel} chỉ được có tối đa ${maxRows} dòng.` });
    }
    const columns = config.columns.filter((column): column is Record<string, unknown> => this.isRecord(column) && !Array.isArray(column));
    const columnKeys = new Set(columns.map((column) => String(column.key)));
    for (const [rowIndex, row] of value.entries()) {
      if (!this.isRecord(row) || Array.isArray(row)) {
        errors.push({ fieldKey: `${fieldKey}.${rowIndex}`, code: 'INVALID_TABLE_ROW', message: `Dòng ${rowIndex + 1} của ${fieldLabel} không hợp lệ.` });
        continue;
      }
      for (const key of Object.keys(row)) {
        if (!columnKeys.has(key)) {
          errors.push({ fieldKey: `${fieldKey}.${rowIndex}.${key}`, code: 'UNKNOWN_TABLE_COLUMN', message: `Cột ${key} không được khai báo trong ${fieldLabel}.` });
        }
      }
      for (const column of columns) {
        const columnKey = String(column.key);
        const valuePath = `${fieldKey}.${rowIndex}.${columnKey}`;
        const cellValue = row[columnKey];
        if (column.required === true && this.isEmpty(cellValue)) {
          errors.push({ fieldKey: valuePath, code: 'REQUIRED', message: `Dòng ${rowIndex + 1} - ${this.fieldLabel(column)} là bắt buộc.` });
          continue;
        }
        if (!this.isEmpty(cellValue)) {
          this.validateFieldValue({ ...column, key: valuePath, label: `Dòng ${rowIndex + 1} - ${this.fieldLabel(column)}` }, cellValue, errors);
        }
      }
    }
  }

  private validateValueAgainstRules(
    field: Record<string, unknown>,
    value: unknown,
    errors: DynamicFormValidationError[],
  ): void {
    if (!this.isRecord(field.validation)) return;
    const key = String(field.key);
    const rules = field.validation;
    if (typeof value === 'number') {
      if (typeof rules.min === 'number' && value < rules.min) {
        errors.push({ fieldKey: key, code: 'MIN', message: `${this.fieldLabel(field)} phải lớn hơn hoặc bằng ${rules.min}.` });
      }
      if (typeof rules.max === 'number' && value > rules.max) {
        errors.push({ fieldKey: key, code: 'MAX', message: `${this.fieldLabel(field)} phải nhỏ hơn hoặc bằng ${rules.max}.` });
      }
    }
    if (typeof value === 'string') {
      if (typeof rules.minLength === 'number' && value.length < rules.minLength) {
        errors.push({ fieldKey: key, code: 'MIN_LENGTH', message: `${this.fieldLabel(field)} phải có ít nhất ${rules.minLength} ký tự.` });
      }
      if (typeof rules.maxLength === 'number' && value.length > rules.maxLength) {
        errors.push({ fieldKey: key, code: 'MAX_LENGTH', message: `${this.fieldLabel(field)} không được vượt quá ${rules.maxLength} ký tự.` });
      }
      if (typeof rules.pattern === 'string' && this.isSafePattern(rules.pattern) && !new RegExp(rules.pattern).test(value)) {
        const message = typeof rules.errorMessage === 'string' && rules.errorMessage.trim()
          ? rules.errorMessage
          : `${this.fieldLabel(field)} không đúng định dạng.`;
        errors.push({ fieldKey: key, code: 'PATTERN', message });
      }
    }
  }

  private isFieldVisible(
    key: string,
    fieldsByKey: Map<string, Record<string, unknown>>,
    formData: Record<string, unknown>,
    cache: Map<string, boolean>,
    visiting: Set<string>,
  ): boolean {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (visiting.has(key)) return false;
    visiting.add(key);
    const field = fieldsByKey.get(key);
    const condition = this.isRecord(field?.visibilityCondition) ? field.visibilityCondition : undefined;
    let visible = true;
    if (condition && typeof condition.fieldKey === 'string' && this.isVisibilityOperator(condition.operator)) {
      visible = this.isFieldVisible(condition.fieldKey, fieldsByKey, formData, cache, visiting)
        && this.evaluateCondition(formData[condition.fieldKey], condition.operator, condition.value);
    }
    visiting.delete(key);
    cache.set(key, visible);
    return visible;
  }

  private evaluateCondition(actual: unknown, operator: VisibilityOperator, expected: unknown): boolean {
    if (operator === 'EQUALS') return this.valuesEqual(actual, expected);
    if (operator === 'NOT_EQUALS') return !this.valuesEqual(actual, expected);
    if (operator === 'IN') return Array.isArray(expected) && expected.some((candidate) => this.valuesEqual(actual, candidate));
    if (operator === 'GREATER_THAN') return this.compareValues(actual, expected, (left, right) => left > right);
    return this.compareValues(actual, expected, (left, right) => left < right);
  }

  private compareValues(actual: unknown, expected: unknown, compare: (left: number, right: number) => boolean): boolean {
    if (typeof actual === 'number' && typeof expected === 'number') return compare(actual, expected);
    if (typeof actual === 'string' && typeof expected === 'string') {
      const left = Date.parse(actual);
      const right = Date.parse(expected);
      return !Number.isNaN(left) && !Number.isNaN(right) && compare(left, right);
    }
    return false;
  }

  private valuesEqual(first: unknown, second: unknown): boolean {
    if (Array.isArray(first) && !Array.isArray(second)) return first.some((value) => Object.is(value, second));
    return Object.is(first, second);
  }

  private isSafePattern(pattern: string): boolean {
    if (!pattern || pattern.length > MAX_PATTERN_LENGTH) return false;
    try {
      new RegExp(pattern);
    } catch {
      return false;
    }

    const groups: Array<{ hasQuantifier: boolean; hasAlternation: boolean }> = [{ hasQuantifier: false, hasAlternation: false }];
    let escaped = false;
    let inCharacterClass = false;
    for (let index = 0; index < pattern.length; index += 1) {
      const character = pattern[index];
      if (escaped) {
        if (/^[1-9]$/.test(character)) return false;
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '[') {
        inCharacterClass = true;
        continue;
      }
      if (character === ']' && inCharacterClass) {
        inCharacterClass = false;
        continue;
      }
      if (inCharacterClass) continue;
      if (character === '(') {
        if (pattern[index + 1] === '?') return false;
        groups.push({ hasQuantifier: false, hasAlternation: false });
        continue;
      }
      if (character === '|') {
        groups.at(-1)!.hasAlternation = true;
        continue;
      }
      if (character === ')') {
        if (groups.length === 1) return false;
        const group = groups.pop()!;
        const followedByQuantifier = this.isQuantifierStart(pattern[index + 1]);
        if (followedByQuantifier && (group.hasQuantifier || group.hasAlternation)) return false;
        groups.at(-1)!.hasQuantifier ||= group.hasQuantifier || followedByQuantifier;
        continue;
      }
      if (this.isQuantifierStart(character)) groups.at(-1)!.hasQuantifier = true;
    }
    return !escaped && !inCharacterClass && groups.length === 1;
  }

  private isQuantifierStart(character: string | undefined): boolean {
    return character === '*' || character === '+' || character === '?' || character === '{';
  }

  private optionValues(field: Record<string, unknown>): Set<unknown> {
    if (!Array.isArray(field.options)) return new Set();
    return new Set(field.options.flatMap((option) => (
      this.isRecord(option) && option.isActive !== false ? [option.value] : []
    )));
  }

  private isValidFileValue(field: Record<string, unknown>, value: unknown): boolean {
    const config = this.isRecord(field.fileConfig) ? field.fileConfig : undefined;
    if (config?.multiple === true) {
      return Array.isArray(value)
        && value.length <= (typeof config.maxFiles === 'number' ? config.maxFiles : Number.MAX_SAFE_INTEGER)
        && value.every((fileId) => typeof fileId === 'string' && Types.ObjectId.isValid(fileId));
    }
    return typeof value === 'string' && Types.ObjectId.isValid(value);
  }

  private isDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  private isDateTime(value: unknown): value is string {
    return typeof value === 'string' && value.includes('T') && !Number.isNaN(Date.parse(value));
  }

  private isEmail(value: string): boolean {
    if (value.length > 254) return false;
    const at = value.indexOf('@');
    const lastAt = value.lastIndexOf('@');
    return at > 0 && at === lastAt && at < value.length - 3 && value.slice(at + 1).includes('.') && !value.includes(' ');
  }

  private isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
  }

  private fieldLabel(field: Record<string, unknown>): string {
    return typeof field.label === 'string' && field.label.trim() ? field.label : String(field.key);
  }

  private isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }

  private isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  }

  private isFormFieldType(value: unknown): value is FormFieldType {
    return typeof value === 'string' && formFieldTypes.some((type) => type === value);
  }

  private isTableColumnType(value: unknown): value is TableColumnType {
    return typeof value === 'string' && tableColumnTypes.some((type) => type === value);
  }

  private isVisibilityOperator(value: unknown): value is VisibilityOperator {
    return typeof value === 'string' && visibilityOperators.some((operator) => operator === value);
  }

  private isAutoFillSource(value: unknown): value is FormAutoFillSource {
    return typeof value === 'string' && formAutoFillSources.some((source) => source === value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private toPlainRecord(value: Record<string, unknown>): Record<string, unknown> {
    const toObject = value.toObject;
    if (typeof toObject === 'function') {
      return toObject.call(value) as Record<string, unknown>;
    }
    return structuredClone(value);
  }
}
