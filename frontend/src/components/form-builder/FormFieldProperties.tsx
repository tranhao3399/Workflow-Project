import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import {
  formFieldTypes,
  tableColumnTypes,
  type FormAutoFillSource,
  type FormField,
  type FormFieldOption,
  type FormFieldType,
  type FormTableColumn,
  type TableColumnType,
} from '../../types/workflow'
import {
  autoFillSourceLabels,
  compatibleAutoFillSourcesForType,
  createTableColumn,
  defaultAutoFillReadOnly,
  defaultFieldPlaceholder,
  issueForPath,
  normalizeFieldForType,
  readFieldColumnSpan,
  updateFieldLabelAndGeneratedKey,
  updateTableColumnLabelAndGeneratedKey,
  type FormBuilderIssue,
} from '../../utils/form-builder'
import {
  replaceFieldKeyInFormula,
} from '../../utils/form-calculation'
import { FormulaEditorPanel, type FormulaVariableOption } from './FormulaTokenInput'
import { DatePicker } from '../ui/DatePicker'
import { DateTimePicker } from '../ui/DateTimePicker'
import { FilterSelect } from '../ui/FilterSelect'

interface FormFieldPropertiesProps {
  field: FormField
  fieldIndex: number
  allFields: readonly FormField[]
  issues: readonly FormBuilderIssue[]
  disabled: boolean
  systemField?: boolean
  onChange: (field: FormField) => void
}

const typeLabels: Record<FormFieldType, string> = {
  TEXT: 'Văn bản',
  TEXTAREA: 'Văn bản',
  NUMBER: 'Số',
  CURRENCY: 'Tiền tệ',
  EMAIL: 'Email',
  PHONE: 'Điện thoại',
  DATE: 'Ngày',
  DATETIME: 'Ngày và giờ',
  SELECT: 'Danh sách chọn',
  MULTI_SELECT: 'Danh sách chọn',
  RADIO: 'Ô đánh dấu',
  CHECKBOX: 'Ô đánh dấu',
  BOOLEAN: 'Có / Không',
  FILE: 'Tệp đính kèm',
  TABLE: 'Bảng dữ liệu',
  SECTION: 'Tiêu đề phân đoạn',
}

const tableColumnLabels: Record<TableColumnType, string> = {
  TEXT: 'Văn bản',
  NUMBER: 'Số',
  CURRENCY: 'Tiền tệ',
  DATE: 'Ngày',
  SELECT: 'Danh sách chọn',
  BOOLEAN: 'Có / Không',
}

const columnSpanOptions = [
  { value: '12', label: '1 cột' },
  { value: '6', label: '2 cột' },
  { value: '4', label: '3 cột' },
  { value: '3', label: '4 cột' },
]

const fileSizeOptions = [
  { value: '5', label: '5 MB' },
  { value: '10', label: '10 MB' },
  { value: '20', label: '20 MB' },
]

const optionTypes = new Set<FormFieldType>(['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX'])
const propertyFieldTypes = formFieldTypes.filter(
  (type) => type !== 'MULTI_SELECT' && type !== 'CHECKBOX' && type !== 'TEXTAREA',
)

export function FormFieldProperties({
  field,
  fieldIndex,
  allFields,
  issues,
  disabled,
  systemField = false,
  onChange,
}: FormFieldPropertiesProps) {
  const path = (suffix: string) => `fields.${fieldIndex}.${suffix}`
  const update = <Key extends keyof FormField>(key: Key, value: FormField[Key]) =>
    onChange({ ...field, [key]: value })
  const currentSpan = readFieldColumnSpan(field)
  const compatibleAutoFillSources = compatibleAutoFillSourcesForType(field.type)

  function updateAutoFillSource(nextSource: string) {
    if (!nextSource) {
      const next = { ...field }
      delete next.autoFill
      onChange(next)
      return
    }
    const source = nextSource as FormAutoFillSource
    const readOnly = field.autoFill ? field.autoFill.readOnly : defaultAutoFillReadOnly(source)
    const next = {
      ...field,
      required: readOnly ? false : field.required,
      autoFill: {
        source,
        readOnly,
      },
    }
    delete next.defaultValue
    onChange(next)
  }

  function updateAutoFillReadOnly(readOnly: boolean) {
    if (!field.autoFill) return
    onChange({
      ...field,
      required: readOnly ? false : field.required,
      autoFill: { ...field.autoFill, readOnly },
    })
  }

  function updateColumnSpan(nextSpan: number) {
    const { newRow: _newRow, ...restLayout } = field.layout ?? {}
    if (nextSpan >= 12) {
      update('layout', { ...restLayout, columnSpan: 12 })
      return
    }
    update('layout', { ...(field.layout ?? {}), columnSpan: nextSpan })
  }

  function updateTableColumn(columnIndex: number, nextColumn: FormTableColumn) {
    if (!field.tableConfig) return
    update('tableConfig', {
      ...field.tableConfig,
      columns: field.tableConfig.columns.map((column, index) =>
        index === columnIndex ? nextColumn : column,
      ),
    })
  }

  function moveTableColumn(columnIndex: number, direction: -1 | 1) {
    if (!field.tableConfig) return
    const targetIndex = columnIndex + direction
    if (targetIndex < 0 || targetIndex >= field.tableConfig.columns.length) return
    const columns = [...field.tableConfig.columns]
    const [column] = columns.splice(columnIndex, 1)
    columns.splice(targetIndex, 0, column)
    update('tableConfig', {
      ...field.tableConfig,
      columns: columns.map((item, index) => ({ ...item, order: (index + 1) * 10 })),
    })
  }

  function changeTableColumnType(column: FormTableColumn, type: TableColumnType): FormTableColumn {
    const next: FormTableColumn = { ...column, type }
    if (type === 'SELECT') next.options = column.options?.length ? column.options : [newOption([])]
    else delete next.options
    if (type !== 'NUMBER' && type !== 'CURRENCY' && type !== 'TEXT') delete next.validation
    if (type !== 'NUMBER' && type !== 'CURRENCY') delete next.formula
    return next
  }

  function toggleStandaloneFormula(enabled: boolean) {
    const next: FormField = { ...field }
    if (!enabled) {
      delete next.formula
      onChange(next)
      return
    }
    next.formula = field.formula ?? ''
    next.required = false
    delete next.defaultValue
    delete next.validation
    onChange(next)
  }

  return (
    <div className="form-builder-properties-body">
      {systemField && (
        <div className="form-builder-system-field-note">
          <strong>Trường hệ thống</strong>
          <span>Giá trị được hệ thống tự động cập nhật. Bạn có thể di chuyển và thay đổi độ rộng trường.</span>
        </div>
      )}
      <PropertyField
        label={field.type === 'SECTION' ? 'Nội dung tiêu đề' : 'Nhãn hiển thị'}
        required={!systemField && field.type !== 'SECTION'}
        error={issueForPath(issues, path('label'))}
      >
        <input
          value={field.label}
          disabled={disabled || systemField}
          maxLength={160}
          aria-invalid={Boolean(issueForPath(issues, path('label')))}
          onChange={(event) => update('label', event.target.value)}
          onBlur={(event) =>
            onChange(
              updateFieldLabelAndGeneratedKey(
                field,
                event.currentTarget.value,
                allFields,
                fieldIndex,
              ),
            )
          }
        />
      </PropertyField>

      {field.type !== 'SECTION' && (
        <PropertyField label="Loại trường">
          <FilterSelect
            menuPortal
            menuPlacement="auto"
            disabled={disabled || systemField}
            ariaLabel="Loại trường"
            value={displayFieldType(field.type)}
            options={propertyFieldTypes.map((type) => ({ value: type, label: typeLabels[type] }))}
            onChange={(value) => onChange(changeDisplayFieldType(field, value as FormFieldType))}
          />
        </PropertyField>
      )}

      {field.autoFill && !systemField && compatibleAutoFillSources.length > 0 && (
        <section className="form-builder-property-section form-builder-autofill-section">
          <div className="form-builder-property-title">
            <strong>Tự động điền khi tạo phiếu</strong>
          </div>
          <PropertyField
            label="Nguồn dữ liệu tự động"
            error={issueForPath(issues, path('autoFill'))}
          >
            <FilterSelect
              menuPortal
              menuPlacement="auto"
              disabled={disabled}
              ariaLabel="Nguồn dữ liệu tự động"
              value={field.autoFill.source}
              options={compatibleAutoFillSources.map((source) => ({
                value: source,
                label: autoFillSourceLabels[source],
              }))}
              onChange={updateAutoFillSource}
            />
          </PropertyField>
          <SettingSwitch
            checked={field.autoFill.readOnly}
            disabled={disabled}
            label="Khóa chỉnh sửa đối với người tạo"
            onChange={updateAutoFillReadOnly}
          />
          <small className="form-builder-field-hint">
            {field.autoFill.readOnly
              ? 'Hệ thống tự điền và không cho nhân viên sửa lại.'
              : 'Hệ thống tự điền sẵn, nhân viên vẫn có thể chỉnh sửa.'}
          </small>
        </section>
      )}

      {field.type !== 'SECTION' && !systemField && !field.autoFill?.readOnly && field.formula === undefined && (
        <SettingSwitch
          checked={field.required}
          disabled={disabled}
          label="Bắt buộc nhập"
          onChange={(checked) => update('required', checked)}
        />
      )}

      {(field.type === 'TEXT' || field.type === 'TEXTAREA') && !systemField && !field.autoFill && (
        <SettingSwitch
          checked={field.type === 'TEXTAREA'}
          disabled={disabled}
          label="Cho phép nhập nhiều dòng"
          onChange={(checked) => onChange(changeMultilineMode(field, checked))}
        />
      )}

      {optionTypes.has(field.type) && !systemField && (
        <SettingSwitch
          checked={isMultipleOptionType(field.type)}
          disabled={disabled}
          label="Cho phép chọn nhiều"
          onChange={(checked) => onChange(changeSelectionMode(field, checked))}
        />
      )}

      {optionTypes.has(field.type) && (
        <section className="form-builder-property-section">
          <div className="form-builder-property-title">
            <strong>Danh sách lựa chọn</strong>
            <div className="form-builder-option-title-actions">
              {field.defaultValue !== undefined && (
                <button
                  className="text-action-button"
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(clearOptionDefault(field))}
                >
                  Bỏ mặc định
                </button>
              )}
              <button
                className="text-action-button"
                type="button"
                disabled={disabled}
                onClick={() =>
                  update('options', [...(field.options ?? []), newOption(field.options ?? [])])
                }
              >
                + Thêm lựa chọn
              </button>
            </div>
          </div>
          {issueForPath(issues, path('options')) && (
            <p className="field-error">{issueForPath(issues, path('options'))}</p>
          )}
          <div className="form-builder-option-list">
            {(field.options ?? []).map((option, optionIndex) => (
              <div
                className="form-builder-option-row form-builder-choice-option-row"
                key={optionIndex}
              >
                <label
                  className="form-builder-option-default"
                  title="Đặt làm giá trị mặc định"
                >
                  <input
                    type={isMultipleOptionType(field.type) ? 'checkbox' : 'radio'}
                    name={isMultipleOptionType(field.type) ? undefined : `default-${field.key}`}
                    checked={isOptionDefault(field, option.value)}
                    disabled={disabled}
                    aria-label={`Đặt ${option.label || `lựa chọn ${optionIndex + 1}`} làm giá trị mặc định`}
                    onChange={(event) =>
                      onChange(changeOptionDefault(field, option.value, event.target.checked))
                    }
                  />
                </label>
                <input
                  className="form-builder-option-label-input"
                  aria-label={`Nhãn lựa chọn ${optionIndex + 1}`}
                  placeholder="Nhãn hiển thị"
                  value={option.label}
                  disabled={disabled}
                  onChange={(event) =>
                    updateOption(field, optionIndex, { label: event.target.value }, onChange)
                  }
                  onBlur={(event) =>
                    onChange(finalizeGeneratedOptionValue(field, optionIndex, event.currentTarget.value))
                  }
                />
                <button
                  className="icon-action danger-icon-action"
                  title="Xóa lựa chọn"
                  aria-label={`Xóa lựa chọn ${optionIndex + 1}`}
                  type="button"
                  disabled={disabled || (field.options?.length ?? 0) <= 1}
                  onClick={() => onChange(removeOptionAndDefault(field, optionIndex))}
                >
                  <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                </button>
                {(issueForPath(issues, path(`options.${optionIndex}.label`)) ||
                  issueForPath(issues, path(`options.${optionIndex}.value`))) && (
                  <p className="field-error">
                    {issueForPath(issues, path(`options.${optionIndex}.label`)) ??
                      issueForPath(issues, path(`options.${optionIndex}.value`))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {(field.type === 'TEXT' || field.type === 'TEXTAREA') && !systemField && (() => {
        const minLengthError = issueForPath(issues, path('validation.minLength'))
        const maxLengthError =
          issueForPath(issues, path('validation.maxLength')) ?? issueForPath(issues, path('validation'))
        return (
          <section className="form-builder-property-section">
            <div className="form-builder-property-title">
              <strong>Giới hạn độ dài ký tự</strong>
            </div>
            <div className="form-builder-rule-grid">
              <PropertyField
                label="Độ dài tối thiểu"
                error={minLengthError}
                hideErrorMessage
              >
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Tối thiểu"
                  value={field.validation?.minLength ?? ''}
                  disabled={disabled}
                  aria-invalid={Boolean(minLengthError)}
                  onChange={(event) =>
                    update(
                      'validation',
                      compactValidation({
                        ...(field.validation ?? {}),
                        minLength: optionalNonNegativeInteger(event.target.value),
                      }),
                    )
                  }
                />
              </PropertyField>
              <PropertyField
                label="Độ dài tối đa"
                error={maxLengthError}
                hideErrorMessage
              >
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Không giới hạn"
                  value={field.validation?.maxLength ?? ''}
                  disabled={disabled}
                  aria-invalid={Boolean(maxLengthError)}
                  onChange={(event) =>
                    update(
                      'validation',
                      compactValidation({
                        ...(field.validation ?? {}),
                        maxLength: optionalNonNegativeInteger(event.target.value),
                      }),
                    )
                  }
                />
              </PropertyField>
              {(minLengthError || maxLengthError) && (
                <div className="form-builder-rule-grid-errors">
                  {minLengthError && <small className="field-error">{minLengthError}</small>}
                  {maxLengthError && (!minLengthError || maxLengthError !== minLengthError) && (
                    <small className="field-error">{maxLengthError}</small>
                  )}
                </div>
              )}
            </div>
          </section>
        )
      })()}

      {(field.type === 'NUMBER' || field.type === 'CURRENCY') && !systemField && field.formula === undefined && (() => {
        const minError = issueForPath(issues, path('validation.min'))
        const maxError =
          issueForPath(issues, path('validation.max')) ?? issueForPath(issues, path('validation'))
        return (
          <section className="form-builder-property-section">
            <div className="form-builder-property-title">
              <strong>Giới hạn giá trị</strong>
            </div>
            <div className="form-builder-rule-grid">
              <PropertyField
                label="Giá trị tối thiểu"
                error={minError}
                hideErrorMessage
              >
                <input
                  type="number"
                  min="0"
                  step={field.type === 'NUMBER' ? 'any' : '1'}
                  placeholder="Tối thiểu"
                  value={field.validation?.min ?? ''}
                  disabled={disabled}
                  aria-invalid={Boolean(minError)}
                  onChange={(event) =>
                    update(
                      'validation',
                      compactValidation({
                        ...(field.validation ?? {}),
                        min: optionalNonNegativeNumber(event.target.value),
                      }),
                    )
                  }
                />
              </PropertyField>
              <PropertyField
                label="Giá trị tối đa"
                error={maxError}
                hideErrorMessage
              >
                <input
                  type="number"
                  min="0"
                  step={field.type === 'NUMBER' ? 'any' : '1'}
                  placeholder="Không giới hạn"
                  value={field.validation?.max ?? ''}
                  disabled={disabled}
                  aria-invalid={Boolean(maxError)}
                  onChange={(event) =>
                    update(
                      'validation',
                      compactValidation({
                        ...(field.validation ?? {}),
                        max: optionalNonNegativeNumber(event.target.value),
                      }),
                    )
                  }
                />
              </PropertyField>
              {(minError || maxError) && (
                <div className="form-builder-rule-grid-errors">
                  {minError && <small className="field-error">{minError}</small>}
                  {maxError && (!minError || maxError !== minError) && (
                    <small className="field-error">{maxError}</small>
                  )}
                </div>
              )}
            </div>
          </section>
        )
      })()}

      {(field.type === 'NUMBER' || field.type === 'CURRENCY') && !systemField && !field.autoFill && (() => {
        const formulaError = issueForPath(issues, path('formula'))
        const isFormulaMode = field.formula !== undefined
        const variables: FormulaVariableOption[] = [
          ...allFields
            .filter(
              (item, index) =>
                index !== fieldIndex &&
                (item.type === 'NUMBER' || item.type === 'CURRENCY'),
            )
            .map((other) => ({
              id: `field:${other.key}`,
              label: other.label || other.key,
              token: `[${other.key}]`,
              kind: 'FIELD' as const,
            })),
          ...allFields.flatMap((item) => {
            if (item.type !== 'TABLE' || !item.tableConfig) return []
            return item.tableConfig.columns
              .filter((col) => col.type === 'NUMBER' || col.type === 'CURRENCY')
              .map((col) => ({
                id: `sum:${item.key}.${col.key}`,
                label: `Tổng: ${item.label || item.key} · ${col.label || col.key}`,
                token: `SUM([${item.key}].[${col.key}])`,
                kind: 'SUM' as const,
              }))
          }),
        ]
        return (
          <section className="form-builder-property-section form-builder-formula-section">
            <div className="form-builder-property-title">
              <strong>Công thức tính toán</strong>
            </div>
            <SettingSwitch
              checked={isFormulaMode}
              disabled={disabled}
              label="Tính toán tự động"
              onChange={toggleStandaloneFormula}
            />
            {isFormulaMode && (
              <FormulaEditorPanel
                key={field.key}
                label="Công thức"
                value={field.formula ?? ''}
                error={formulaError}
                disabled={disabled}
                placeholder="Chọn biến bên dưới hoặc nhập số, + - * /"
                emptyHint="Thêm các trường Số / Tiền tệ hoặc Bảng dữ liệu khác vào biểu mẫu để tham chiếu trong công thức."
                variables={variables}
                allFields={allFields}
                onChange={(nextFormula) => update('formula', nextFormula)}
              />
            )}
          </section>
        )
      })()}

      {!field.autoFill &&
        field.formula === undefined &&
        field.type !== 'SECTION' &&
        field.type !== 'FILE' &&
        field.type !== 'TABLE' &&
        !optionTypes.has(field.type) && (
          <section className="form-builder-property-section form-builder-default-value-section">
            <DefaultValueControl
              field={field}
              disabled={disabled}
              error={issueForPath(issues, path('defaultValue'))}
              onChange={(value) => update('defaultValue', value)}
            />
          </section>
        )}

      {field.type === 'FILE' && field.fileConfig && (
        <section className="form-builder-property-section">
          <div className="form-builder-property-title">
            <strong>Tệp đính kèm</strong>
          </div>
          <SettingSwitch
            checked={field.fileConfig.multiple}
            disabled={disabled}
            label="Cho phép nhiều tệp"
            onChange={(checked) =>
              update('fileConfig', {
                ...field.fileConfig!,
                multiple: checked,
                maxFiles: checked ? Math.max(2, field.fileConfig!.maxFiles) : 1,
              })
            }
          />
          {(() => {
            const maxFileSizeError = issueForPath(issues, path('fileConfig.maxFileSizeBytes'))
            const maxFilesError = issueForPath(issues, path('fileConfig.maxFiles'))
            return (
              <div className="form-builder-rule-grid">
                <PropertyField
                  label="Dung lượng tối đa (MB)"
                  error={maxFileSizeError}
                  hideErrorMessage
                >
                  <FilterSelect
                    ariaLabel="Dung lượng tối đa mỗi tệp"
                    disabled={disabled}
                    menuPlacement="auto"
                    menuPortal
                    options={fileSizeOptions}
                    value={String(Math.round(field.fileConfig.maxFileSizeBytes / 1024 / 1024))}
                    onChange={(value) =>
                      update('fileConfig', {
                        ...field.fileConfig!,
                        maxFileSizeBytes: Number(value) * 1024 * 1024,
                      })
                    }
                  />
                </PropertyField>
                <PropertyField
                  label="Số tệp tối đa"
                  error={maxFilesError}
                  hideErrorMessage
                >
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={field.fileConfig.maxFiles}
                    disabled={disabled || !field.fileConfig.multiple}
                    aria-invalid={Boolean(maxFilesError)}
                    onChange={(event) =>
                      update('fileConfig', {
                        ...field.fileConfig!,
                        maxFiles: Number(event.target.value),
                      })
                    }
                  />
                </PropertyField>
                {(maxFileSizeError || maxFilesError) && (
                  <div className="form-builder-rule-grid-errors">
                    {maxFileSizeError && <small className="field-error">{maxFileSizeError}</small>}
                    {maxFilesError && <small className="field-error">{maxFilesError}</small>}
                  </div>
                )}
              </div>
            )
          })()}
        </section>
      )}

      {field.type === 'TABLE' && field.tableConfig && (
        <section className="form-builder-property-section form-builder-table-config">
          <div className="form-builder-property-title">
            <div className="form-builder-table-config-title">
              <strong>Cấu hình bảng</strong>
              <span>{field.tableConfig.columns.length}/30 cột</span>
            </div>
            <div className="form-builder-table-config-actions">
              <button
                className="text-action-button"
                type="button"
                disabled={disabled}
                onClick={() =>
                  update('tableConfig', {
                    ...field.tableConfig!,
                    columns: [createTableColumn([])],
                  })
                }
              >
                Đặt lại cột
              </button>
              <button
                className="secondary-button compact-button form-builder-add-column-button"
                type="button"
                disabled={disabled || field.tableConfig.columns.length >= 30}
                onClick={() =>
                  update('tableConfig', {
                    ...field.tableConfig!,
                    columns: [
                      ...field.tableConfig!.columns,
                      createTableColumn(field.tableConfig!.columns),
                    ],
                  })
                }
              >
                + Thêm cột
              </button>
            </div>
          </div>
          {issueForPath(issues, path('tableConfig.columns')) && (
            <p className="field-error">{issueForPath(issues, path('tableConfig.columns'))}</p>
          )}
          {(() => {
            const minRowsError = issueForPath(issues, path('tableConfig.minRows'))
            const maxRowsError = issueForPath(issues, path('tableConfig.maxRows'))
            return (
              <div className="form-builder-rule-grid">
                <PropertyField
                  label="Số dòng tối thiểu"
                  error={minRowsError}
                  hideErrorMessage
                >
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={field.tableConfig.minRows}
                    disabled={disabled}
                    aria-invalid={Boolean(minRowsError)}
                    onChange={(event) =>
                      update('tableConfig', {
                        ...field.tableConfig!,
                        minRows: Number(event.target.value),
                      })
                    }
                  />
                </PropertyField>
                <PropertyField
                  label="Số dòng tối đa"
                  error={maxRowsError}
                  hideErrorMessage
                >
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={field.tableConfig.maxRows}
                    disabled={disabled}
                    aria-invalid={Boolean(maxRowsError)}
                    onChange={(event) =>
                      update('tableConfig', {
                        ...field.tableConfig!,
                        maxRows: Number(event.target.value),
                      })
                    }
                  />
                </PropertyField>
                {(minRowsError || maxRowsError) && (
                  <div className="form-builder-rule-grid-errors">
                    {minRowsError && <small className="field-error">{minRowsError}</small>}
                    {maxRowsError && (!minRowsError || maxRowsError !== minRowsError) && (
                      <small className="field-error">{maxRowsError}</small>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
          <SettingSwitch
            checked={field.tableConfig.allowAddRows}
            disabled={disabled}
            label="Cho phép thêm dòng"
            onChange={(checked) =>
              update('tableConfig', {
                ...field.tableConfig!,
                allowAddRows: checked,
              })
            }
          />
          <SettingSwitch
            checked={field.tableConfig.allowRemoveRows}
            disabled={disabled}
            label="Cho phép xóa dòng"
            onChange={(checked) =>
              update('tableConfig', {
                ...field.tableConfig!,
                allowRemoveRows: checked,
              })
            }
          />
          <div className="form-builder-table-columns">
            {field.tableConfig.columns.map((column, columnIndex) => {
              const columnPath = path(`tableConfig.columns.${columnIndex}`)
              return (
                <article className="form-builder-table-column" key={`${column.key}-${columnIndex}`}>
                  <div className="form-builder-table-column-heading">
                    <strong>Cột {columnIndex + 1}</strong>
                    <div className="form-builder-table-column-actions">
                      <button
                        className="icon-action"
                        type="button"
                        title="Chuyển cột sang trái"
                        aria-label={`Chuyển cột ${columnIndex + 1} sang trái`}
                        disabled={disabled || columnIndex === 0}
                        onClick={() => moveTableColumn(columnIndex, -1)}
                      >
                        <ArrowLeft size={13} strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-action"
                        type="button"
                        title="Chuyển cột sang phải"
                        aria-label={`Chuyển cột ${columnIndex + 1} sang phải`}
                        disabled={
                          disabled || columnIndex === field.tableConfig!.columns.length - 1
                        }
                        onClick={() => moveTableColumn(columnIndex, 1)}
                      >
                        <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-action danger-icon-action"
                        type="button"
                        title="Xóa cột"
                        aria-label={`Xóa cột ${columnIndex + 1}`}
                        disabled={disabled || field.tableConfig!.columns.length <= 1}
                        onClick={() =>
                          update('tableConfig', {
                            ...field.tableConfig!,
                            columns: field
                              .tableConfig!.columns.filter((_, index) => index !== columnIndex)
                              .map((item, index) => ({ ...item, order: (index + 1) * 10 })),
                          })
                        }
                      >
                        <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <PropertyField
                    label="Tiêu đề cột"
                    required
                    error={issueForPath(issues, `${columnPath}.label`)}
                  >
                    <input
                      value={column.label}
                      disabled={disabled}
                      maxLength={160}
                      onChange={(event) =>
                        updateTableColumn(columnIndex, { ...column, label: event.target.value })
                      }
                      onBlur={(event) => {
                        if (!field.tableConfig) return
                        const updatedCol = updateTableColumnLabelAndGeneratedKey(
                          column,
                          event.currentTarget.value,
                          field.tableConfig.columns,
                          columnIndex,
                        )
                        const keyChanged = updatedCol.key !== column.key
                        update('tableConfig', {
                          ...field.tableConfig,
                          columns: field.tableConfig.columns.map((item, idx) => {
                            if (idx === columnIndex) return updatedCol
                            if (!keyChanged || !item.formula) return item
                            return {
                              ...item,
                              formula: replaceFieldKeyInFormula(
                                item.formula,
                                column.key,
                                updatedCol.key,
                              ),
                            }
                          }),
                        })
                      }}
                    />
                  </PropertyField>
                  <PropertyField label="Định dạng dữ liệu được nhập">
                    <FilterSelect
                    menuPortal
                    menuPlacement="auto"
                      disabled={disabled}
                      ariaLabel={`Kiểu dữ liệu cột ${columnIndex + 1}`}
                      value={column.type}
                      options={tableColumnTypes.map((type) => ({
                        value: type,
                        label: tableColumnLabels[type],
                      }))}
                      onChange={(value) =>
                        updateTableColumn(
                          columnIndex,
                          changeTableColumnType(column, value as TableColumnType),
                        )
                      }
                    />
                  </PropertyField>
                  {column.formula === undefined && (
                    <SettingSwitch
                      checked={column.required}
                      disabled={disabled}
                      label="Bắt buộc nhập"
                      onChange={(checked) =>
                        updateTableColumn(columnIndex, {
                          ...column,
                          required: checked,
                        })
                      }
                    />
                  )}
                  {(column.type === 'NUMBER' || column.type === 'CURRENCY') && (() => {
                    const colFormulaError = issueForPath(issues, `${columnPath}.formula`)
                    const isColFormulaMode = column.formula !== undefined
                    const colVariables: FormulaVariableOption[] = (field.tableConfig?.columns ?? [])
                      .filter(
                        (sibling, idx) =>
                          idx !== columnIndex &&
                          (sibling.type === 'NUMBER' || sibling.type === 'CURRENCY'),
                      )
                      .map((sibling) => ({
                        id: `col:${sibling.key}`,
                        label: sibling.label || sibling.key,
                        token: `[${sibling.key}]`,
                        kind: 'FIELD' as const,
                      }))
                    return (
                      <div className="form-builder-table-column-formula">
                        <SettingSwitch
                          checked={isColFormulaMode}
                          disabled={disabled}
                          label="Tự động tính ngang theo dòng"
                          onChange={(checked) => {
                            if (!checked) {
                              const nextCol = { ...column }
                              delete nextCol.formula
                              updateTableColumn(columnIndex, nextCol)
                              return
                            }
                            const nextCol: FormTableColumn = {
                              ...column,
                              required: false,
                              formula: column.formula ?? '',
                            }
                            delete nextCol.validation
                            updateTableColumn(columnIndex, nextCol)
                          }}
                        />
                        {isColFormulaMode && (
                          <FormulaEditorPanel
                            key={`${field.key}-${column.key}`}
                            label="Công thức"
                            value={column.formula ?? ''}
                            error={colFormulaError}
                            disabled={disabled}
                            compact
                            placeholder="Chọn cột bên dưới hoặc nhập số, + - * /"
                            emptyHint="Thêm các cột kiểu Số hoặc Tiền tệ khác trong bảng để tính ngang theo từng dòng."
                            variables={colVariables}
                            allFields={allFields}
                            currentTableField={field}
                            onChange={(nextFormula) =>
                              updateTableColumn(columnIndex, {
                                ...column,
                                formula: nextFormula,
                              })
                            }
                          />
                        )}
                      </div>
                    )
                  })()}
                  {(column.type === 'NUMBER' || column.type === 'CURRENCY') && column.formula === undefined && (() => {
                    const colMinError = issueForPath(issues, `${columnPath}.validation.min`)
                    const colMaxError =
                      issueForPath(issues, `${columnPath}.validation.max`) ??
                      issueForPath(issues, `${columnPath}.validation`)
                    return (
                      <div className="form-builder-rule-grid">
                        <PropertyField label="Tối thiểu" error={colMinError} hideErrorMessage>
                          <input
                            type="number"
                            min="0"
                            step={column.type === 'NUMBER' ? 'any' : '1'}
                            value={column.validation?.min ?? ''}
                            disabled={disabled}
                            aria-invalid={Boolean(colMinError)}
                            onChange={(event) =>
                              updateTableColumn(columnIndex, {
                                ...column,
                                validation: compactValidation({
                                  ...(column.validation ?? {}),
                                  min: optionalNonNegativeNumber(event.target.value),
                                }),
                              })
                            }
                          />
                        </PropertyField>
                        <PropertyField label="Tối đa" error={colMaxError} hideErrorMessage>
                          <input
                            type="number"
                            min="0"
                            step={column.type === 'NUMBER' ? 'any' : '1'}
                            value={column.validation?.max ?? ''}
                            disabled={disabled}
                            aria-invalid={Boolean(colMaxError)}
                            onChange={(event) =>
                              updateTableColumn(columnIndex, {
                                ...column,
                                validation: compactValidation({
                                  ...(column.validation ?? {}),
                                  max: optionalNonNegativeNumber(event.target.value),
                                }),
                              })
                            }
                          />
                        </PropertyField>
                        {(colMinError || colMaxError) && (
                          <div className="form-builder-rule-grid-errors">
                            {colMinError && <small className="field-error">{colMinError}</small>}
                            {colMaxError && (!colMinError || colMaxError !== colMinError) && (
                              <small className="field-error">{colMaxError}</small>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  {column.type === 'TEXT' && (() => {
                    const colMinLengthError = issueForPath(issues, `${columnPath}.validation.minLength`)
                    const colMaxLengthError =
                      issueForPath(issues, `${columnPath}.validation.maxLength`) ??
                      issueForPath(issues, `${columnPath}.validation`)
                    return (
                      <div className="form-builder-rule-grid">
                        <PropertyField
                          label="Độ dài tối thiểu"
                          error={colMinLengthError}
                          hideErrorMessage
                        >
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={column.validation?.minLength ?? ''}
                            disabled={disabled}
                            aria-invalid={Boolean(colMinLengthError)}
                            onChange={(event) =>
                              updateTableColumn(columnIndex, {
                                ...column,
                                validation: compactValidation({
                                  ...(column.validation ?? {}),
                                  minLength: optionalNonNegativeInteger(event.target.value),
                                }),
                              })
                            }
                          />
                        </PropertyField>
                        <PropertyField
                          label="Độ dài tối đa"
                          error={colMaxLengthError}
                          hideErrorMessage
                        >
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={column.validation?.maxLength ?? ''}
                            disabled={disabled}
                            aria-invalid={Boolean(colMaxLengthError)}
                            onChange={(event) =>
                              updateTableColumn(columnIndex, {
                                ...column,
                                validation: compactValidation({
                                  ...(column.validation ?? {}),
                                  maxLength: optionalNonNegativeInteger(event.target.value),
                                }),
                              })
                            }
                          />
                        </PropertyField>
                        {(colMinLengthError || colMaxLengthError) && (
                          <div className="form-builder-rule-grid-errors">
                            {colMinLengthError && <small className="field-error">{colMinLengthError}</small>}
                            {colMaxLengthError && (!colMinLengthError || colMaxLengthError !== colMinLengthError) && (
                              <small className="field-error">{colMaxLengthError}</small>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                  {column.type === 'SELECT' && (
                    <div className="form-builder-table-column-options">
                      <div className="form-builder-property-title">
                        <strong>Lựa chọn</strong>
                        <button
                          className="text-action-button"
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            updateTableColumn(columnIndex, {
                              ...column,
                              options: [...(column.options ?? []), newOption(column.options ?? [])],
                            })
                          }
                        >
                          + Thêm
                        </button>
                      </div>
                      {issueForPath(issues, `${columnPath}.options`) && (
                        <p className="field-error">
                          {issueForPath(issues, `${columnPath}.options`)}
                        </p>
                      )}
                      {(column.options ?? []).map((option, optionIndex) => (
                        <div className="form-builder-option-row" key={optionIndex}>
                          <input
                            aria-label={`Nhãn lựa chọn cột ${columnIndex + 1}`}
                            placeholder="Nhãn"
                            value={option.label}
                            disabled={disabled}
                            onChange={(event) =>
                              updateTableColumn(columnIndex, {
                                ...column,
                                options: column.options!.map((item, index) =>
                                  index === optionIndex
                                    ? { ...item, label: event.target.value }
                                    : item,
                                ),
                              })
                            }
                            onBlur={(event) =>
                              updateTableColumn(columnIndex, {
                                ...column,
                                options: finalizeGeneratedOptionValueInList(
                                  column.options ?? [],
                                  optionIndex,
                                  event.currentTarget.value,
                                ),
                              })
                            }
                          />
                          <button
                            className="icon-action danger-icon-action"
                            type="button"
                            disabled={disabled || (column.options?.length ?? 0) <= 1}
                            onClick={() =>
                              updateTableColumn(columnIndex, {
                                ...column,
                                options: column
                                  .options!.filter((_, index) => index !== optionIndex)
                                  .map((item, index) => ({ ...item, order: (index + 1) * 10 })),
                              })
                            }
                          >
                            <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {field.type !== 'SECTION' && (() => {
        const keyError = issueForPath(issues, path('key'))
        const isLockedKey = systemField || Boolean(field.autoFill)
        return (
          <details
            className="form-builder-property-section form-builder-advanced-section"
            open={keyError ? true : undefined}
          >
            <summary className="form-builder-property-title">
              <strong>Cài đặt nâng cao</strong>
            </summary>
            <div className="form-builder-advanced-section-body">
              <PropertyField label="Độ rộng trên hàng">
                <FilterSelect
                  menuPortal
                  menuPlacement="auto"
                  disabled={disabled || field.type === 'TABLE'}
                  ariaLabel="Độ rộng trường"
                  value={String(currentSpan)}
                  options={columnSpanOptions}
                  onChange={(value) => updateColumnSpan(Number(value))}
                />
              </PropertyField>
              <PropertyField
                label="Mã biến (Field ID)"
                required={!isLockedKey}
                error={keyError}
              >
                <input
                  value={field.key}
                  disabled={disabled || isLockedKey}
                  readOnly={isLockedKey}
                  maxLength={80}
                  placeholder="VD: so_luong"
                  title={
                    isLockedKey
                      ? 'Trường hệ thống tự động điền. Không thể thay đổi mã định danh.'
                      : undefined
                  }
                  aria-invalid={Boolean(keyError)}
                  onChange={(event) => {
                    if (isLockedKey) return
                    update('key', event.target.value.replace(/\s+/g, '_'))
                  }}
                />
              </PropertyField>
            </div>
          </details>
        )
      })()}
    </div>
  )
}

function SettingSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      className={checked ? 'form-builder-setting-switch is-active' : 'form-builder-setting-switch'}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
      <b>{label}</b>
    </button>
  )
}

function PropertyField({
  label,
  required = false,
  error,
  hideErrorMessage = false,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hideErrorMessage?: boolean
  children: ReactNode
}) {
  return (
    <label className={`form-builder-property-field${error ? ' has-error' : ''}`}>
      <span className={required ? 'required-field-label' : ''}>{label}</span>
      {children}
      {error && !hideErrorMessage && <small className="field-error">{error}</small>}
    </label>
  )
}

function DefaultValueControl({
  field,
  disabled,
  error,
  onChange,
}: {
  field: FormField
  disabled: boolean
  error?: string
  onChange: (value: unknown) => void
}) {
  if (field.type === 'FILE' || field.type === 'TABLE' || field.type === 'SECTION') return null
  if (field.type === 'TEXTAREA') {
    return (
      <PropertyField label="Giá trị mặc định" error={error}>
        <textarea
          rows={3}
          value={typeof field.defaultValue === 'string' ? field.defaultValue : ''}
          disabled={disabled}
          placeholder="Nhập giá trị mặc định"
          aria-invalid={Boolean(error)}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : event.target.value)
          }
        />
      </PropertyField>
    )
  }
  if (field.type === 'BOOLEAN') {
    return (
      <PropertyField label="Giá trị mặc định" error={error}>
        <FilterSelect
          menuPortal
          menuPlacement="auto"
          disabled={disabled}
          ariaLabel="Giá trị mặc định"
          value={field.defaultValue === true ? 'true' : field.defaultValue === false ? 'false' : ''}
          options={[
            { value: '', label: 'Nhập giá trị mặc định' },
            { value: 'true', label: 'Có' },
            { value: 'false', label: 'Không' },
          ]}
          onChange={(value) => onChange(value === '' ? undefined : value === 'true')}
        />
      </PropertyField>
    )
  }
  if (field.type === 'DATE') {
    return (
      <PropertyField label="Giá trị mặc định" error={error}>
        <DatePicker
          ariaLabel="Giá trị mặc định"
          value={typeof field.defaultValue === 'string' ? field.defaultValue : undefined}
          placeholder="Nhập giá trị mặc định"
          disabled={disabled}
          onChange={onChange}
        />
      </PropertyField>
    )
  }
  if (field.type === 'DATETIME') {
    return (
      <PropertyField label="Giá trị mặc định" error={error}>
        <DateTimePicker
          ariaLabel="Giá trị ngày và giờ mặc định"
          value={typeof field.defaultValue === 'string' ? field.defaultValue : undefined}
          placeholder="Nhập giá trị mặc định"
          disabled={disabled}
          onChange={onChange}
        />
      </PropertyField>
    )
  }
  const inputType =
    field.type === 'NUMBER' || field.type === 'CURRENCY'
      ? 'number'
      : field.type === 'EMAIL'
        ? 'email'
        : field.type === 'PHONE'
          ? 'tel'
          : 'text'
  return (
    <PropertyField label="Giá trị mặc định" error={error}>
      <input
        type={inputType}
        min={field.type === 'NUMBER' || field.type === 'CURRENCY' ? 0 : undefined}
        step={field.type === 'NUMBER' ? 'any' : field.type === 'CURRENCY' ? 1 : undefined}
        placeholder="Nhập giá trị mặc định"
        value={
          typeof field.defaultValue === 'string' || typeof field.defaultValue === 'number'
            ? String(field.defaultValue)
            : ''
        }
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={(event) =>
          onChange(
            event.target.value === ''
              ? undefined
              : inputType === 'number'
                ? field.type === 'CURRENCY'
                  ? Math.max(0, Math.trunc(Number(event.target.value)))
                  : Math.max(0, Number(event.target.value))
                : event.target.value,
          )
        }
      />
    </PropertyField>
  )
}

function newOption(options: readonly FormFieldOption[]): FormFieldOption {
  const existing = new Set(options.map((option) => option.value))
  let index = options.length + 1
  while (existing.has(`OPTION_${index}`)) index += 1
  return {
    value: `OPTION_${index}`,
    label: `Lựa chọn ${index}`,
    order: (options.length + 1) * 10,
    isActive: true,
  }
}

function updateOption(
  field: FormField,
  index: number,
  patch: Partial<FormFieldOption>,
  onChange: (field: FormField) => void,
) {
  onChange({
    ...field,
    options: (field.options ?? []).map((option, optionIndex) =>
      optionIndex === index ? { ...option, ...patch } : option,
    ),
  })
}

function finalizeGeneratedOptionValue(
  field: FormField,
  index: number,
  label: string,
): FormField {
  const previousValue = field.options?.[index]?.value
  const options = finalizeGeneratedOptionValueInList(field.options ?? [], index, label)
  const nextValue = options[index]?.value
  const next: FormField = {
    ...field,
    options,
  }
  if (previousValue && nextValue && previousValue !== nextValue) {
    if (Array.isArray(field.defaultValue)) {
      next.defaultValue = field.defaultValue.map((value) =>
        value === previousValue ? nextValue : value,
      )
    } else if (field.defaultValue === previousValue) {
      next.defaultValue = nextValue
    }
  }
  return next
}

function finalizeGeneratedOptionValueInList(
  options: readonly FormFieldOption[],
  index: number,
  label: string,
): FormFieldOption[] {
  const current = options[index]
  if (!current) return [...options]
  if (!/^OPTION_\d+$/.test(current.value)) {
    return options.map((option, optionIndex) =>
      optionIndex === index ? { ...option, label } : option,
    )
  }
  const usedValues = new Set(
    options.filter((_, optionIndex) => optionIndex !== index).map((option) => option.value),
  )
  const normalized = label
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized) {
    return options.map((option, optionIndex) =>
      optionIndex === index ? { ...option, label } : option,
    )
  }
  const baseValue = /^[A-Z]/.test(normalized) ? normalized : `OPTION_${normalized}`
  let value = baseValue.slice(0, 80).replace(/_+$/g, '')
  let suffix = 2
  while (usedValues.has(value)) {
    const suffixText = `_${suffix}`
    value = `${baseValue.slice(0, 80 - suffixText.length).replace(/_+$/g, '')}${suffixText}`
    suffix += 1
  }
  return options.map((option, optionIndex) =>
    optionIndex === index ? { ...option, label, value } : option,
  )
}

function removeOptionAndDefault(field: FormField, index: number): FormField {
  const removedValue = field.options?.[index]?.value
  const options = (field.options ?? [])
    .filter((_, optionIndex) => optionIndex !== index)
    .map((option, optionIndex) => ({ ...option, order: (optionIndex + 1) * 10 }))
  if (!removedValue) return { ...field, options }
  const defaultValue = Array.isArray(field.defaultValue)
    ? field.defaultValue.filter((value) => value !== removedValue)
    : field.defaultValue === removedValue
      ? undefined
      : field.defaultValue
  return { ...field, options, defaultValue }
}

function isMultipleOptionType(type: FormFieldType): boolean {
  return type === 'MULTI_SELECT' || type === 'CHECKBOX'
}

function displayFieldType(type: FormFieldType): FormFieldType {
  if (type === 'MULTI_SELECT') return 'SELECT'
  if (type === 'CHECKBOX') return 'RADIO'
  if (type === 'TEXTAREA') return 'TEXT'
  return type
}

function resolveDisplayFieldType(currentType: FormFieldType, displayType: FormFieldType): FormFieldType {
  const multiple = isMultipleOptionType(currentType)
  if (displayType === 'SELECT') return multiple ? 'MULTI_SELECT' : 'SELECT'
  if (displayType === 'RADIO') return multiple ? 'CHECKBOX' : 'RADIO'
  if (displayType === 'TEXT') return currentType === 'TEXTAREA' ? 'TEXTAREA' : 'TEXT'
  return displayType
}

function changeMultilineMode(field: FormField, multiline: boolean): FormField {
  const type: FormFieldType = multiline ? 'TEXTAREA' : 'TEXT'
  const next: FormField = { ...field, type }
  if (
    field.placeholder === defaultFieldPlaceholder('TEXT') ||
    field.placeholder === defaultFieldPlaceholder('TEXTAREA')
  ) {
    const ph = defaultFieldPlaceholder(type)
    if (ph) next.placeholder = ph
    else delete next.placeholder
  }
  return next
}

function changeDisplayFieldType(field: FormField, displayType: FormFieldType): FormField {
  const nextType = resolveDisplayFieldType(field.type, displayType)
  const previousDefault = field.defaultValue
  const next = normalizeFieldForType(field, nextType)
  if (optionTypes.has(field.type) && optionTypes.has(nextType) && previousDefault !== undefined) {
    next.defaultValue = previousDefault
  }
  return next
}

function changeSelectionMode(field: FormField, multiple: boolean): FormField {
  const dropdown = field.type === 'SELECT' || field.type === 'MULTI_SELECT'
  const type: FormFieldType = dropdown
    ? multiple
      ? 'MULTI_SELECT'
      : 'SELECT'
    : multiple
      ? 'CHECKBOX'
      : 'RADIO'
  const next: FormField = { ...field, type }
  if (multiple) {
    if (field.defaultValue !== undefined && !Array.isArray(field.defaultValue)) {
      next.defaultValue = [field.defaultValue]
    }
  } else if (Array.isArray(field.defaultValue)) {
    const firstValue = field.defaultValue.find((value) => typeof value === 'string')
    if (firstValue === undefined) delete next.defaultValue
    else next.defaultValue = firstValue
  }
  return next
}

function isOptionDefault(field: FormField, optionValue: string): boolean {
  return Array.isArray(field.defaultValue)
    ? field.defaultValue.includes(optionValue)
    : field.defaultValue === optionValue
}

function changeOptionDefault(
  field: FormField,
  optionValue: string,
  checked: boolean,
): FormField {
  const next: FormField = { ...field }
  if (!isMultipleOptionType(field.type)) {
    next.defaultValue = optionValue
    return next
  }
  const currentValues = Array.isArray(field.defaultValue)
    ? field.defaultValue.filter((value): value is string => typeof value === 'string')
    : []
  const defaultValue = checked
    ? Array.from(new Set([...currentValues, optionValue]))
    : currentValues.filter((value) => value !== optionValue)
  if (defaultValue.length === 0) delete next.defaultValue
  else next.defaultValue = defaultValue
  return next
}

function clearOptionDefault(field: FormField): FormField {
  const next = { ...field }
  delete next.defaultValue
  return next
}

function optionalNonNegativeNumber(value: string): number | undefined {
  return value === '' ? undefined : Math.max(0, Number(value))
}

function optionalNonNegativeInteger(value: string): number | undefined {
  if (value === '') return undefined
  const num = Number(value)
  if (Number.isNaN(num)) return undefined
  return Math.max(0, Math.trunc(num))
}

function compactValidation(
  validation: NonNullable<FormField['validation']>,
): FormField['validation'] {
  return Object.values(validation).some((value) => value !== undefined && value !== '')
    ? validation
    : undefined
}
