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
  issueForPath,
  normalizeFieldForType,
  readFieldColumnSpan,
  updateFieldLabelAndGeneratedKey,
  type FormBuilderIssue,
} from '../../utils/form-builder'
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
  TEXT: 'Văn bản ngắn',
  TEXTAREA: 'Văn bản dài',
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
  { value: '12', label: 'Toàn hàng (1 cột)' },
  { value: '6', label: 'Một nửa (2 cột)' },
  { value: '4', label: 'Một phần ba (3 cột)' },
  { value: '3', label: 'Một phần tư (4 cột)' },
]

const optionTypes = new Set<FormFieldType>(['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX'])
const propertyFieldTypes = formFieldTypes.filter(
  (type) => type !== 'MULTI_SELECT' && type !== 'CHECKBOX',
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
    return next
  }

  return (
    <div className="form-builder-properties-body">
      {systemField && (
        <div className="form-builder-system-field-note">
          <strong>Trường hệ thống</strong>
          <span>Giá trị được hệ thống tự động cập nhật. Bạn có thể di chuyển và thay đổi độ rộng trường.</span>
        </div>
      )}
      <PropertyField label={field.type === 'SECTION' ? 'Tiêu đề phân đoạn' : 'Nhãn hiển thị'} required={!systemField} error={issueForPath(issues, path('label'))}>
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

      {field.type !== 'SECTION' && !systemField && !field.autoFill?.readOnly && (
        <SettingSwitch
          checked={field.required}
          disabled={disabled}
          label="Bắt buộc nhập"
          onChange={(checked) => update('required', checked)}
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

      <details className="form-builder-property-section form-builder-advanced-section">
        <summary className="form-builder-property-title">
          <strong>Cài đặt nâng cao</strong>
        </summary>
        <PropertyField label="Độ rộng trên hàng">
          <FilterSelect
            menuPortal
            menuPlacement="auto"
            disabled={disabled || field.type === 'TABLE' || field.type === 'SECTION'}
            ariaLabel="Độ rộng trường"
            value={String(currentSpan)}
            options={columnSpanOptions}
            onChange={(value) => updateColumnSpan(Number(value))}
          />
        </PropertyField>
      </details>

      {optionTypes.has(field.type) && (
        <section className="form-builder-property-section">
          <div className="form-builder-property-title">
            <strong>Danh sách lựa chọn</strong>
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

      {!field.autoFill &&
        field.type !== 'SECTION' &&
        field.type !== 'FILE' &&
        field.type !== 'TABLE' &&
        !optionTypes.has(field.type) && (
          <section className="form-builder-property-section form-builder-default-value-section">
            <DefaultValueControl
              field={field}
              disabled={disabled}
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
          <PropertyField
            label="MIME types"
            error={issueForPath(issues, path('fileConfig.allowedMimeTypes'))}
          >
            <input
              value={field.fileConfig.allowedMimeTypes.join(', ')}
              disabled={disabled}
              onChange={(event) =>
                update('fileConfig', {
                  ...field.fileConfig!,
                  allowedMimeTypes: event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
          </PropertyField>
          <div className="form-builder-rule-grid">
            <PropertyField
              label="Dung lượng tối đa (MB)"
              error={issueForPath(issues, path('fileConfig.maxFileSizeBytes'))}
            >
              <input
                type="number"
                min="1"
                value={Math.max(1, Math.round(field.fileConfig.maxFileSizeBytes / 1024 / 1024))}
                disabled={disabled}
                onChange={(event) =>
                  update('fileConfig', {
                    ...field.fileConfig!,
                    maxFileSizeBytes: Math.max(1, Number(event.target.value)) * 1024 * 1024,
                  })
                }
              />
            </PropertyField>
            <PropertyField
              label="Số tệp tối đa"
              error={issueForPath(issues, path('fileConfig.maxFiles'))}
            >
              <input
                type="number"
                min="1"
                max="100"
                value={field.fileConfig.maxFiles}
                disabled={disabled || !field.fileConfig.multiple}
                onChange={(event) =>
                  update('fileConfig', {
                    ...field.fileConfig!,
                    maxFiles: Number(event.target.value),
                  })
                }
              />
            </PropertyField>
          </div>
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
          <div className="form-builder-rule-grid">
            <PropertyField
              label="Số dòng tối thiểu"
              error={issueForPath(issues, path('tableConfig.minRows'))}
            >
              <input
                type="number"
                min="0"
                max="100"
                value={field.tableConfig.minRows}
                disabled={disabled}
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
              error={issueForPath(issues, path('tableConfig.maxRows'))}
            >
              <input
                type="number"
                min="1"
                max="100"
                value={field.tableConfig.maxRows}
                disabled={disabled}
                onChange={(event) =>
                  update('tableConfig', {
                    ...field.tableConfig!,
                    maxRows: Number(event.target.value),
                  })
                }
              />
            </PropertyField>
          </div>
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
                  {(column.type === 'NUMBER' || column.type === 'CURRENCY') && (
                    <div className="form-builder-rule-grid">
                      <PropertyField label="Tối thiểu">
                        <input
                          type="number"
                          min="0"
                          step={column.type === 'NUMBER' ? 'any' : '1'}
                          value={column.validation?.min ?? ''}
                          disabled={disabled}
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
                      <PropertyField
                        label="Tối đa"
                        error={issueForPath(issues, `${columnPath}.validation.max`)}
                      >
                        <input
                          type="number"
                          min="0"
                          step={column.type === 'NUMBER' ? 'any' : '1'}
                          value={column.validation?.max ?? ''}
                          disabled={disabled}
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
                    </div>
                  )}
                  {column.type === 'TEXT' && (
                    <div className="form-builder-rule-grid">
                      <PropertyField label="Độ dài tối thiểu">
                        <input
                          type="number"
                          min="0"
                          value={column.validation?.minLength ?? ''}
                          disabled={disabled}
                          onChange={(event) =>
                            updateTableColumn(columnIndex, {
                              ...column,
                              validation: compactValidation({
                                ...(column.validation ?? {}),
                                minLength: optionalNumber(event.target.value),
                              }),
                            })
                          }
                        />
                      </PropertyField>
                      <PropertyField
                        label="Độ dài tối đa"
                        error={issueForPath(issues, `${columnPath}.validation.maxLength`)}
                      >
                        <input
                          type="number"
                          min="0"
                          value={column.validation?.maxLength ?? ''}
                          disabled={disabled}
                          onChange={(event) =>
                            updateTableColumn(columnIndex, {
                              ...column,
                              validation: compactValidation({
                                ...(column.validation ?? {}),
                                maxLength: optionalNumber(event.target.value),
                              }),
                            })
                          }
                        />
                      </PropertyField>
                    </div>
                  )}
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
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <label className="form-builder-property-field">
      <span className={required ? 'required-field-label' : ''}>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  )
}

function DefaultValueControl({
  field,
  disabled,
  onChange,
}: {
  field: FormField
  disabled: boolean
  onChange: (value: unknown) => void
}) {
  if (field.type === 'FILE' || field.type === 'TABLE' || field.type === 'SECTION') return null
  if (field.type === 'BOOLEAN') {
    return (
      <PropertyField label="Giá trị mặc định">
        <FilterSelect
          menuPortal
          menuPlacement="auto"
          disabled={disabled}
          ariaLabel="Giá trị mặc định"
          value={field.defaultValue === true ? 'true' : field.defaultValue === false ? 'false' : ''}
          options={[
            { value: '', label: 'Không đặt' },
            { value: 'true', label: 'Có' },
            { value: 'false', label: 'Không' },
          ]}
          onChange={(value) => onChange(value === '' ? undefined : value === 'true')}
        />
      </PropertyField>
    )
  }
  const inputType =
    field.type === 'NUMBER' || field.type === 'CURRENCY'
      ? 'number'
      : field.type === 'DATE'
        ? 'date'
        : field.type === 'DATETIME'
          ? 'datetime-local'
          : field.type === 'EMAIL'
            ? 'email'
            : field.type === 'PHONE'
              ? 'tel'
              : 'text'
  return (
    <PropertyField label="Giá trị mặc định">
      <input
        type={inputType}
        min={field.type === 'NUMBER' || field.type === 'CURRENCY' ? 0 : undefined}
        step={field.type === 'NUMBER' ? 'any' : field.type === 'CURRENCY' ? 1 : undefined}
        value={
          typeof field.defaultValue === 'string' || typeof field.defaultValue === 'number'
            ? String(field.defaultValue)
            : ''
        }
        disabled={disabled}
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
  return type
}

function resolveDisplayFieldType(currentType: FormFieldType, displayType: FormFieldType): FormFieldType {
  const multiple = isMultipleOptionType(currentType)
  if (displayType === 'SELECT') return multiple ? 'MULTI_SELECT' : 'SELECT'
  if (displayType === 'RADIO') return multiple ? 'CHECKBOX' : 'RADIO'
  return displayType
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

function optionalNumber(value: string): number | undefined {
  return value === '' ? undefined : Number(value)
}

function optionalNonNegativeNumber(value: string): number | undefined {
  return value === '' ? undefined : Math.max(0, Number(value))
}

function compactValidation(
  validation: NonNullable<FormField['validation']>,
): FormField['validation'] {
  return Object.values(validation).some((value) => value !== undefined && value !== '')
    ? validation
    : undefined
}
