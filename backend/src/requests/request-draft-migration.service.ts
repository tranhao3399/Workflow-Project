import { Injectable } from '@nestjs/common';
import { DynamicFormValidatorService } from '../form-definitions/dynamic-form-validator.service.js';
import type { FormField } from '../form-definitions/schemas/form-definition.schema.js';
import { isRecord } from './request-data.helpers.js';
import type { DraftMigrationReviewItem } from './request.types.js';
import type { RequestDocument } from './schemas/request.schema.js';

export interface RequestDraftMigrationResult {
  formData: Record<string, unknown>;
  copiedFieldKeys: string[];
  reviewItems: DraftMigrationReviewItem[];
}

@Injectable()
export class RequestDraftMigrationService {
  constructor(private readonly dynamicFormValidator: DynamicFormValidatorService) {}

  migrate(
    source: RequestDocument,
    targetFields: readonly FormField[],
    sourceFieldFallback: readonly FormField[] = [],
  ): RequestDraftMigrationResult {
    const sourceFields = isRecord(source.formSnapshot) && Array.isArray(source.formSnapshot.fields)
      ? source.formSnapshot.fields.filter((field): field is Record<string, unknown> => isRecord(field))
      : sourceFieldFallback as unknown as readonly Record<string, unknown>[];
    const sourceByKey = new Map(sourceFields
      .filter((field) => typeof field.key === 'string')
      .map((field) => [String(field.key), field]));
    const targetRecords = targetFields as unknown as readonly Record<string, unknown>[];
    const targetByKey = new Map(targetRecords.map((field) => [String(field.key), field]));
    const formData: Record<string, unknown> = {};
    const reviewItems = new Map<string, DraftMigrationReviewItem>();
    const addReview = (item: DraftMigrationReviewItem) => {
      reviewItems.set(`${item.fieldKey}:${item.reason}`, item);
    };

    for (const [fieldKey, value] of Object.entries(source.formData)) {
      if (!this.hasFormValue(value)) continue;
      const sourceField = sourceByKey.get(fieldKey);
      const targetField = targetByKey.get(fieldKey);
      const label = this.fieldLabel(sourceField, fieldKey);
      if (!targetField) {
        addReview({ fieldKey, label, reason: 'FIELD_REMOVED', message: `${label} không còn trong biểu mẫu mới.` });
        continue;
      }
      if (!sourceField || sourceField.type !== targetField.type) {
        addReview({ fieldKey, label, reason: 'TYPE_CHANGED', message: `${label} đã đổi kiểu dữ liệu và cần nhập lại.` });
        continue;
      }
      if (targetField.type === 'FILE') {
        addReview({
          fieldKey,
          label,
          reason: 'FILE_REUPLOAD_REQUIRED',
          message: `${label} là tệp đính kèm và cần được tải lại trên phiếu mới.`,
        });
        continue;
      }
      formData[fieldKey] = value;
    }

    let validation = this.dynamicFormValidator.validateFormData({ fields: targetFields }, formData);
    for (const error of validation.errors) {
      if (error.fieldKey === '$definition' || !Object.prototype.hasOwnProperty.call(formData, error.fieldKey)) continue;
      const field = targetByKey.get(error.fieldKey);
      delete formData[error.fieldKey];
      addReview({
        fieldKey: error.fieldKey,
        label: this.fieldLabel(field, error.fieldKey),
        reason: 'VALUE_INVALID',
        message: `${this.fieldLabel(field, error.fieldKey)} có giá trị không còn hợp lệ và cần kiểm tra lại.`,
      });
    }

    validation = this.dynamicFormValidator.validateFormData({ fields: targetFields }, formData);
    for (const error of validation.errors) {
      if (error.fieldKey === '$definition' || error.code !== 'REQUIRED') continue;
      if ([...reviewItems.values()].some((item) => item.fieldKey === error.fieldKey)) continue;
      const field = targetByKey.get(error.fieldKey);
      addReview({
        fieldKey: error.fieldKey,
        label: this.fieldLabel(field, error.fieldKey),
        reason: 'REQUIRED_VALUE_MISSING',
        message: `${this.fieldLabel(field, error.fieldKey)} là trường bắt buộc cần được bổ sung.`,
      });
    }

    return {
      formData,
      copiedFieldKeys: Object.keys(formData),
      reviewItems: [...reviewItems.values()],
    };
  }

  private fieldLabel(field: Record<string, unknown> | undefined, fallback: string): string {
    return typeof field?.label === 'string' && field.label.trim() ? field.label : fallback;
  }

  private hasFormValue(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return false;
    return !Array.isArray(value) || value.length > 0;
  }
}
