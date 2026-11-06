import { describe, expect, it } from 'vitest';
import { DynamicFormValidatorService } from './dynamic-form-validator.service.js';

const tableField = {
  key: 'items',
  label: 'Danh sách hàng hóa',
  type: 'TABLE',
  required: true,
  order: 10,
  tableConfig: {
    minRows: 1,
    maxRows: 10,
    allowAddRows: true,
    allowRemoveRows: true,
    columns: [
      { key: 'description', label: 'Nội dung', type: 'TEXT', required: true, order: 10, validation: { minLength: 2 } },
      { key: 'quantity', label: 'Số lượng', type: 'NUMBER', required: true, order: 20, validation: { min: 1 } },
      {
        key: 'unit',
        label: 'Đơn vị',
        type: 'SELECT',
        required: true,
        order: 30,
        options: [{ value: 'ITEM', label: 'Cái', order: 10, isActive: true }],
      },
    ],
  },
};

describe('DynamicFormValidatorService TABLE fields', () => {
  const validator = new DynamicFormValidatorService();

  it('given a form without request metadata, when system fields are ensured, then code and status are added once and remain movable', () => {
    const normalized = validator.ensureSystemRequestFields([
      { key: 'reason', label: 'Lý do', type: 'TEXTAREA', required: true, order: 10 },
      {
        key: 'employee_name',
        label: 'Họ và tên',
        type: 'TEXT',
        required: true,
        order: 15,
        autoFill: { source: 'REQUESTER_FULL_NAME', readOnly: true },
      },
      {
        key: 'request_status',
        label: 'Trạng thái',
        type: 'TEXT',
        required: false,
        order: 20,
        layout: { columnSpan: 12 },
        autoFill: { source: 'REQUEST_STATUS', readOnly: true },
      },
    ]);

    expect(normalized.map((field) => field.key)).toEqual(['request_code', 'reason', 'employee_name', 'request_status']);
    expect(normalized[2]).toEqual(expect.objectContaining({ required: false }));
    expect(normalized[3]).toEqual(expect.objectContaining({
      layout: { columnSpan: 12 },
      autoFill: { source: 'REQUEST_STATUS', readOnly: true },
    }));
    expect(() => validator.assertSystemRequestFieldsValid(normalized)).not.toThrow();
  });

  it('given a system request field is deleted or reconfigured, when the invariant is checked, then saving the definition is rejected', () => {
    const missingStatus = validator.ensureSystemRequestFields([]).filter((field) => (
      typeof field === 'object' && field !== null && 'key' in field && field.key !== 'request_status'
    ));

    expect(() => validator.assertSystemRequestFieldsValid(missingStatus)).toThrow();
  });

  it('given a valid table definition and rows, when the request data is validated, then every row is accepted', () => {
    const result = validator.validateFormData({ fields: [tableField] }, {
      items: [{ description: 'Laptop', quantity: 2, unit: 'ITEM' }],
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('given a required table cell is empty, when the request data is validated, then the exact row and column are rejected', () => {
    const result = validator.validateFormData({ fields: [tableField] }, {
      items: [{ description: 'Laptop', quantity: undefined, unit: 'ITEM' }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldKey: 'items.0.quantity', code: 'REQUIRED' }));
  });

  it('given a table row contains an undeclared column, when the request data is validated, then that column is rejected', () => {
    const result = validator.validateFormData({ fields: [tableField] }, {
      items: [{ description: 'Laptop', quantity: 1, unit: 'ITEM', secret: 'not-allowed' }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fieldKey: 'items.0.secret', code: 'UNKNOWN_TABLE_COLUMN' }));
  });

  it('given duplicate table column keys, when the form definition is validated, then publishing is blocked', () => {
    const invalidField = structuredClone(tableField);
    invalidField.tableConfig.columns[1].key = 'description';

    const errors = validator.validateDefinition([invalidField]);

    expect(errors).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_TABLE_COLUMN_KEY' }));
  });

  it('given compatible requester autoFill configuration on TEXT, EMAIL, PHONE, and DATE fields, when definition is validated, then it passes', () => {
    const errors = validator.validateDefinition([
      {
        key: 'employee_code',
        label: 'Mã nhân viên',
        type: 'TEXT',
        required: true,
        order: 10,
        autoFill: { source: 'REQUESTER_EMPLOYEE_CODE', readOnly: true },
      },
      {
        key: 'requester_email',
        label: 'Email liên hệ',
        type: 'EMAIL',
        required: false,
        order: 20,
        autoFill: { source: 'REQUESTER_EMAIL', readOnly: false },
      },
      {
        key: 'request_date',
        label: 'Ngày tạo phiếu',
        type: 'DATE',
        required: true,
        order: 30,
        autoFill: { source: 'CURRENT_DATE', readOnly: true },
      },
    ]);

    expect(errors).toEqual([]);
  });

  it('given an incompatible autoFill source on a SELECT or NUMBER field, when definition is validated, then INCOMPATIBLE_AUTO_FILL_SOURCE is returned', () => {
    const errors = validator.validateDefinition([
      {
        key: 'amount',
        label: 'Số tiền',
        type: 'NUMBER',
        required: true,
        order: 10,
        autoFill: { source: 'REQUESTER_EMPLOYEE_CODE', readOnly: true },
      },
    ]);

    expect(errors).toContainEqual(expect.objectContaining({ code: 'INCOMPATIBLE_AUTO_FILL_SOURCE' }));
  });

  it('given a section followed by an input field, when definition and request data are validated, then the section is accepted without request data', () => {
    const fields = [
      {
        key: 'travel_information',
        label: 'Thông tin chuyến đi',
        type: 'SECTION',
        required: false,
        order: 10,
        helpText: 'Các thông tin chung của chuyến công tác.',
      },
      {
        key: 'destination',
        label: 'Điểm đến',
        type: 'TEXT',
        required: true,
        order: 20,
      },
    ];

    expect(validator.validateDefinition(fields)).toEqual([]);
    expect(validator.validateFormData({ fields }, { destination: 'Hà Nội' })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('given a section is configured as required or receives submitted data, when validated, then both invalid uses are rejected', () => {
    const fields = [
      {
        key: 'cost_information',
        label: 'Thông tin chi phí',
        type: 'SECTION',
        required: true,
        order: 10,
      },
    ];

    expect(validator.validateDefinition(fields)).toContainEqual(
      expect.objectContaining({ code: 'SECTION_CANNOT_BE_REQUIRED' }),
    );
    const validSection = [{ ...fields[0], required: false }];
    expect(validator.validateFormData({ fields: validSection }, { cost_information: 'not-allowed' }).errors).toContainEqual(
      expect.objectContaining({ fieldKey: 'cost_information', code: 'UNKNOWN_FIELD' }),
    );
  });

  it('given numeric and currency fields, when zero, a decimal number, negative values, and decimal currency are validated, then only supported non-negative values pass', () => {
    const fields = [
      { key: 'leave_days', label: 'Số ngày nghỉ', type: 'NUMBER', required: true, order: 10 },
      { key: 'amount', label: 'Số tiền', type: 'CURRENCY', required: true, order: 20 },
    ];

    expect(validator.validateFormData({ fields }, { leave_days: 0.5, amount: 0 })).toEqual({
      valid: true,
      errors: [],
    });
    expect(validator.validateFormData({ fields }, { leave_days: -0.5, amount: -1 }).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'leave_days', code: 'NON_NEGATIVE_REQUIRED' }),
        expect.objectContaining({ fieldKey: 'amount', code: 'NON_NEGATIVE_REQUIRED' }),
      ]),
    );
    expect(validator.validateFormData({ fields }, { leave_days: 1.25, amount: 10.5 }).errors).toContainEqual(
      expect.objectContaining({ fieldKey: 'amount', code: 'CURRENCY_INTEGER_REQUIRED' }),
    );
  });

  it('given a phone field, when local or international digits are submitted, then an optional leading plus is accepted and letters are rejected', () => {
    const fields = [
      { key: 'phone', label: 'Số điện thoại', type: 'PHONE', required: true, order: 10 },
    ];

    expect(validator.validateFormData({ fields }, { phone: '0901234567' })).toEqual({ valid: true, errors: [] });
    expect(validator.validateFormData({ fields }, { phone: '+84901234567' })).toEqual({ valid: true, errors: [] });
    expect(validator.validateFormData({ fields }, { phone: '+84ABC123' }).errors).toContainEqual(
      expect.objectContaining({ fieldKey: 'phone', code: 'INVALID_PHONE' }),
    );
  });
});
