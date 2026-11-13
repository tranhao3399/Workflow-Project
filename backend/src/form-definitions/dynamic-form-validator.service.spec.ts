import { describe, expect, it } from 'vitest';
import { DynamicFormValidatorService } from './dynamic-form-validator.service.js';
import { evaluateFormCalculations } from './form-calculation.helper.js';

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

  it('given selection defaults, when the definition is validated, then valid single and multiple defaults are accepted', () => {
    const errors = validator.validateDefinition([
      {
        key: 'leave_type',
        label: 'Loại nghỉ phép',
        type: 'SELECT',
        required: true,
        order: 10,
        options: [
          { value: 'ANNUAL', label: 'Nghỉ phép năm', order: 10, isActive: true },
          { value: 'UNPAID', label: 'Nghỉ không lương', order: 20, isActive: true },
        ],
        defaultValue: 'ANNUAL',
      },
      {
        key: 'recipients',
        label: 'Nơi nhận',
        type: 'MULTI_SELECT',
        required: false,
        order: 20,
        options: [
          { value: 'HR', label: 'Nhân sự', order: 10, isActive: true },
          { value: 'MANAGER', label: 'Quản lý', order: 20, isActive: true },
        ],
        defaultValue: ['HR', 'MANAGER'],
      },
    ]);

    expect(errors).toEqual([]);
  });

  it('given a selection default outside the option list, when the definition is validated, then saving is rejected', () => {
    const errors = validator.validateDefinition([
      {
        key: 'leave_type',
        label: 'Loại nghỉ phép',
        type: 'SELECT',
        required: true,
        order: 10,
        options: [
          { value: 'ANNUAL', label: 'Nghỉ phép năm', order: 10, isActive: true },
        ],
        defaultValue: 'UNKNOWN',
      },
    ]);

    expect(errors).toContainEqual(expect.objectContaining({
      path: 'fields.0.defaultValue',
      code: 'INVALID_DEFAULT_INVALID_TYPE',
    }));
  });

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

  it('given min and max or minLength and maxLength where max < min, or default value out of bounds, when definition is validated, then saving is rejected', () => {
    const invalidInvertedNumeric = [
      { key: 'leave_days', label: 'Số ngày nghỉ', type: 'NUMBER', required: true, order: 10, validation: { min: 5, max: 4 } },
    ];
    const invalidInvertedText = [
      { key: 'reason', label: 'Lý do', type: 'TEXT', required: true, order: 10, validation: { minLength: 15, maxLength: 10 } },
    ];
    const invalidDefaultBelowMin = [
      { key: 'amount', label: 'Số lượng', type: 'NUMBER', required: true, order: 10, defaultValue: 0, validation: { min: 4, max: 10 } },
    ];
    const invalidDefaultAboveMax = [
      { key: 'amount', label: 'Số lượng', type: 'NUMBER', required: true, order: 10, defaultValue: 15, validation: { min: 4, max: 10 } },
    ];
    const invalidDefaultTextTooShort = [
      { key: 'reason', label: 'Lý do', type: 'TEXT', required: true, order: 10, defaultValue: 'abc', validation: { minLength: 5, maxLength: 20 } },
    ];
    const invalidDefaultTextTooLong = [
      { key: 'reason', label: 'Lý do', type: 'TEXT', required: true, order: 10, defaultValue: '12345678901', validation: { minLength: 2, maxLength: 10 } },
    ];
    const validNumericAndText = [
      { key: 'leave_days', label: 'Số ngày nghỉ', type: 'NUMBER', required: true, order: 10, defaultValue: 4, validation: { min: 4, max: 4 } },
      { key: 'reason', label: 'Lý do', type: 'TEXT', required: true, order: 20, defaultValue: 'Hợp lệ nè', validation: { minLength: 5, maxLength: 50 } },
    ];

    expect(validator.validateDefinition(invalidInvertedNumeric)).toContainEqual(
      expect.objectContaining({ path: 'fields.0.validation.max', code: 'INVALID_RANGE' }),
    );
    expect(validator.validateDefinition(invalidInvertedText)).toContainEqual(
      expect.objectContaining({ path: 'fields.0.validation.maxLength', code: 'INVALID_LENGTH_RANGE' }),
    );
    expect(validator.validateDefinition(invalidDefaultBelowMin)).toContainEqual(
      expect.objectContaining({ path: 'fields.0.defaultValue', code: 'INVALID_DEFAULT_MIN' }),
    );
    expect(validator.validateDefinition(invalidDefaultAboveMax)).toContainEqual(
      expect.objectContaining({ path: 'fields.0.defaultValue', code: 'INVALID_DEFAULT_MAX' }),
    );
    expect(validator.validateDefinition(invalidDefaultTextTooShort)).toContainEqual(
      expect.objectContaining({ path: 'fields.0.defaultValue', code: 'INVALID_DEFAULT_MIN_LENGTH' }),
    );
    expect(validator.validateDefinition(invalidDefaultTextTooLong)).toContainEqual(
      expect.objectContaining({ path: 'fields.0.defaultValue', code: 'INVALID_DEFAULT_MAX_LENGTH' }),
    );
    expect(validator.validateDefinition(validNumericAndText)).toHaveLength(0);
  });

  it('given standalone formula, table row-level formula, and SUM aggregation, when evaluated, then values are calculated in topological order', () => {
    const fields = [
      {
        key: 'bang_vat_tu',
        label: 'Bảng chi tiết vật tư',
        type: 'TABLE',
        required: true,
        order: 10,
        tableConfig: {
          minRows: 1,
          maxRows: 10,
          allowAddRows: true,
          allowRemoveRows: true,
          columns: [
            { key: 'so_luong', label: 'Số lượng', type: 'NUMBER', required: true, order: 10 },
            { key: 'don_gia', label: 'Đơn giá', type: 'CURRENCY', required: true, order: 20 },
            {
              key: 'thanh_tien',
              label: 'Thành tiền',
              type: 'CURRENCY',
              required: false,
              order: 30,
              formula: '[so_luong] * [don_gia]',
            },
          ],
        },
      },
      {
        key: 'tong_tien_hang',
        label: 'Tổng tiền hàng',
        type: 'CURRENCY',
        required: false,
        order: 20,
        formula: 'SUM([bang_vat_tu].[thanh_tien])',
      },
      {
        key: 'giam_gia',
        label: 'Giảm giá',
        type: 'CURRENCY',
        required: false,
        order: 30,
      },
      {
        key: 'tong_thanh_toan',
        label: 'Tổng thanh toán',
        type: 'CURRENCY',
        required: false,
        order: 40,
        formula: '[tong_tien_hang] - [giam_gia]',
      },
    ];

    expect(validator.validateDefinition(fields)).toEqual([]);

    const evaluated = evaluateFormCalculations(fields, {
      bang_vat_tu: [
        { so_luong: 2, don_gia: 150000 },
        { so_luong: 3, don_gia: 200000 },
      ],
      giam_gia: 50000,
    });

    expect(evaluated).toEqual({
      bang_vat_tu: [
        { so_luong: 2, don_gia: 150000, thanh_tien: 300000 },
        { so_luong: 3, don_gia: 200000, thanh_tien: 600000 },
      ],
      tong_tien_hang: 900000,
      giam_gia: 50000,
      tong_thanh_toan: 850000,
    });

    expect(
      validator.validateFormData(
        { fields },
        {
          bang_vat_tu: [
            { so_luong: 2, don_gia: 150000 },
            { so_luong: 3, don_gia: 200000 },
          ],
          giam_gia: 50000,
        },
      ),
    ).toEqual({ valid: true, errors: [] });
  });

  it('given circular formula dependencies between fields or table columns, when definition is validated, then CIRCULAR_FORMULA_DEPENDENCY is returned', () => {
    const circularStandalone = [
      { key: 'field_a', label: 'Trường A', type: 'NUMBER', required: false, order: 10, formula: '[field_b] + 1' },
      { key: 'field_b', label: 'Trường B', type: 'NUMBER', required: false, order: 20, formula: '[field_a] + 1' },
    ];

    const circularTableColumns = [
      {
        key: 'items',
        label: 'Chi tiết',
        type: 'TABLE',
        required: false,
        order: 10,
        tableConfig: {
          minRows: 0,
          maxRows: 10,
          allowAddRows: true,
          allowRemoveRows: true,
          columns: [
            { key: 'col_a', label: 'Cột A', type: 'NUMBER', required: false, order: 10, formula: '[col_b] * 2' },
            { key: 'col_b', label: 'Cột B', type: 'NUMBER', required: false, order: 20, formula: '[col_a] + 5' },
          ],
        },
      },
    ];

    expect(validator.validateDefinition(circularStandalone)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'fields.0.formula', code: 'CIRCULAR_FORMULA_DEPENDENCY' }),
        expect.objectContaining({ path: 'fields.1.formula', code: 'CIRCULAR_FORMULA_DEPENDENCY' }),
      ]),
    );
    expect(validator.validateDefinition(circularTableColumns)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'fields.0.tableConfig.columns.0.formula',
          code: 'CIRCULAR_FORMULA_DEPENDENCY',
        }),
      ]),
    );
  });

  it('given incomplete formula syntax missing a right-hand operand, when definition is validated, then INVALID_FORMULA_SYNTAX is returned', () => {
    const brokenFormula = [
      { key: 'so_tien', label: 'Số tiền', type: 'CURRENCY', required: false, order: 10 },
      { key: 'tong', label: 'Tổng', type: 'CURRENCY', required: false, order: 20, formula: '[so_tien] + ' },
    ];

    expect(validator.validateDefinition(brokenFormula)).toEqual([
      expect.objectContaining({
        path: 'fields.1.formula',
        code: 'INVALID_FORMULA_SYNTAX',
        message: 'Cú pháp không hợp lệ.',
      }),
    ]);
  });

  it('given leave auto-fill fields and valid leaveDeduction settings, when definition is validated, then no errors are returned', () => {
    const errors = validator.validateDefinition(
      [
        {
          key: 'annual_leave_days',
          label: 'Số ngày phép còn lại',
          type: 'NUMBER',
          required: false,
          order: 10,
          autoFill: { source: 'REQUESTER_ANNUAL_LEAVE_DAYS', readOnly: true },
        },
        {
          key: 'direct_manager_name',
          label: 'Quản lý trực tiếp',
          type: 'TEXT',
          required: false,
          order: 20,
          autoFill: { source: 'REQUESTER_DIRECT_MANAGER_NAME', readOnly: true },
        },
        {
          key: 'so_ngay_nghi',
          label: 'Số ngày nghỉ',
          type: 'NUMBER',
          required: true,
          order: 30,
        },
      ],
      {
        leaveDeduction: {
          enabled: true,
          fieldKey: 'so_ngay_nghi',
          allowNegative: false,
        },
      },
    );

    expect(errors).toEqual([]);
  });

  it('given invalid leaveDeduction settings or incompatible leave auto-fill type, when definition is validated, then clear validation errors are returned', () => {
    const badAutoFill = validator.validateDefinition([
      {
        key: 'annual_leave_days',
        label: 'Số ngày phép còn lại',
        type: 'TEXT',
        required: false,
        order: 10,
        autoFill: { source: 'REQUESTER_ANNUAL_LEAVE_DAYS', readOnly: true },
      },
    ]);
    expect(badAutoFill).toContainEqual(expect.objectContaining({
      path: 'fields.0.autoFill.source',
      code: 'INCOMPATIBLE_AUTO_FILL_SOURCE',
    }));

    const missingFieldKey = validator.validateDefinition(
      [{ key: 'so_ngay_nghi', label: 'Số ngày nghỉ', type: 'NUMBER', required: true, order: 10 }],
      { leaveDeduction: { enabled: true } },
    );
    expect(missingFieldKey).toContainEqual(expect.objectContaining({
      path: 'settings.leaveDeduction.fieldKey',
      code: 'LEAVE_DEDUCTION_FIELD_REQUIRED',
    }));

    const autoFillTarget = validator.validateDefinition(
      [
        {
          key: 'annual_leave_days',
          label: 'Số ngày phép còn lại',
          type: 'NUMBER',
          required: false,
          order: 10,
          autoFill: { source: 'REQUESTER_ANNUAL_LEAVE_DAYS', readOnly: true },
        },
      ],
      { leaveDeduction: { enabled: true, fieldKey: 'annual_leave_days' } },
    );
    expect(autoFillTarget).toContainEqual(expect.objectContaining({
      path: 'settings.leaveDeduction.fieldKey',
      code: 'LEAVE_DEDUCTION_AUTOFILL_NOT_ALLOWED',
    }));

    const nonNumberTarget = validator.validateDefinition(
      [{ key: 'reason', label: 'Lý do', type: 'TEXT', required: true, order: 10 }],
      { leaveDeduction: { enabled: true, fieldKey: 'reason' } },
    );
    expect(nonNumberTarget).toContainEqual(expect.objectContaining({
      path: 'settings.leaveDeduction.fieldKey',
      code: 'LEAVE_DEDUCTION_FIELD_TYPE_INVALID',
    }));
  });
});
