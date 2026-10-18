import type { FormField, FormFieldType } from '../types/workflow'

export interface FormBuilderIssue {
  path: string
  message: string
}

const fieldKeyPattern = /^[A-Za-z][A-Za-z0-9_]*$/
const formCodePattern = /^[A-Z][A-Z0-9_]*$/
const optionTypes = new Set<FormFieldType>(['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX'])
const numberTypes = new Set<FormFieldType>(['NUMBER', 'CURRENCY'])
const textTypes = new Set<FormFieldType>(['TEXT', 'TEXTAREA', 'EMAIL', 'PHONE'])

export function validateFormBuilderDefinition(code: string, name: string, fields: readonly FormField[]): FormBuilderIssue[] {
  const issues: FormBuilderIssue[] = []
  const normalizedCode = code.trim().toUpperCase()
  if (!normalizedCode) issues.push({ path: 'code', message: 'Mã biểu mẫu là bắt buộc.' })
  else if (!formCodePattern.test(normalizedCode)) issues.push({ path: 'code', message: 'Mã chỉ gồm chữ in hoa, số và dấu gạch dưới.' })
  if (!name.trim()) issues.push({ path: 'name', message: 'Tên biểu mẫu là bắt buộc.' })
  if (!fields.length) issues.push({ path: 'fields', message: 'Biểu mẫu cần có ít nhất một trường.' })

  const keyIndexes = new Map<string, number[]>()
  fields.forEach((field, index) => {
    const key = field.key.trim()
    keyIndexes.set(key, [...(keyIndexes.get(key) ?? []), index])
    if (!key) issues.push({ path: `fields.${index}.key`, message: 'Field key là bắt buộc.' })
    else if (!fieldKeyPattern.test(key)) issues.push({ path: `fields.${index}.key`, message: 'Field key phải bắt đầu bằng chữ và chỉ gồm chữ, số, dấu gạch dưới.' })
    if (!field.label.trim()) issues.push({ path: `fields.${index}.label`, message: 'Nhãn hiển thị là bắt buộc.' })
    validateOptions(field, index, issues)
    validateRules(field, index, issues)
    validateFile(field, index, issues)
  })

  for (const indexes of keyIndexes.values()) {
    if (indexes.length < 2) continue
    for (const index of indexes) issues.push({ path: `fields.${index}.key`, message: 'Field key không được trùng trong cùng biểu mẫu.' })
  }
  validateVisibility(fields, issues)
  return issues
}

export function createField(type: FormFieldType, fields: readonly FormField[]): FormField {
  const key = nextFieldKey(fields)
  const base: FormField = {
    key,
    label: 'Trường mới',
    type,
    required: false,
    order: (fields.length + 1) * 10,
    layout: { columnSpan: 12 },
  }
  if (optionTypes.has(type)) {
    base.options = [{ value: 'OPTION_1', label: 'Lựa chọn 1', order: 10, isActive: true }]
  }
  if (type === 'FILE') {
    base.fileConfig = {
      multiple: false,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxFiles: 1,
    }
  }
  return base
}

export function cloneField(field: FormField, fields: readonly FormField[]): FormField {
  const clone = structuredClone(field)
  const root = `${field.key || 'field'}_copy`
  let key = root
  let suffix = 2
  const used = new Set(fields.map((item) => item.key))
  while (used.has(key)) {
    key = `${root}_${suffix}`
    suffix += 1
  }
  clone.key = key
  clone.label = `${field.label || 'Trường'} bản sao`
  return clone
}

export function normalizeFieldForType(field: FormField, type: FormFieldType): FormField {
  const next: FormField = { ...field, type }
  if (optionTypes.has(type)) {
    next.options = field.options?.length ? field.options : [{ value: 'OPTION_1', label: 'Lựa chọn 1', order: 10, isActive: true }]
  } else {
    delete next.options
  }
  if (type === 'FILE') {
    next.fileConfig = field.fileConfig ?? {
      multiple: false,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxFiles: 1,
    }
  } else {
    delete next.fileConfig
  }
  if (!numberTypes.has(type)) {
    if (next.validation) {
      const { min: _min, max: _max, ...rest } = next.validation
      next.validation = rest
    }
  }
  if (!textTypes.has(type)) {
    if (next.validation) {
      const { minLength: _minLength, maxLength: _maxLength, pattern: _pattern, errorMessage: _errorMessage, ...rest } = next.validation
      next.validation = rest
    }
  }
  delete next.defaultValue
  return next
}

export function reindexFields(fields: readonly FormField[]): FormField[] {
  return fields.map((field, index) => ({ ...field, order: (index + 1) * 10 }))
}

export function issueForPath(issues: readonly FormBuilderIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.path === path)?.message
}

function nextFieldKey(fields: readonly FormField[]): string {
  const used = new Set(fields.map((field) => field.key))
  let index = fields.length + 1
  while (used.has(`field_${index}`)) index += 1
  return `field_${index}`
}

function validateOptions(field: FormField, index: number, issues: FormBuilderIssue[]): void {
  if (!optionTypes.has(field.type)) return
  if (!field.options?.length) {
    issues.push({ path: `fields.${index}.options`, message: 'Loại trường này cần ít nhất một lựa chọn.' })
    return
  }
  const values = new Set<string>()
  field.options.forEach((option, optionIndex) => {
    const valuePath = `fields.${index}.options.${optionIndex}.value`
    if (!option.value.trim()) issues.push({ path: valuePath, message: 'Giá trị lựa chọn là bắt buộc.' })
    else if (values.has(option.value.trim())) issues.push({ path: valuePath, message: 'Giá trị lựa chọn không được trùng.' })
    values.add(option.value.trim())
    if (!option.label.trim()) issues.push({ path: `fields.${index}.options.${optionIndex}.label`, message: 'Nhãn lựa chọn là bắt buộc.' })
  })
}

function validateRules(field: FormField, index: number, issues: FormBuilderIssue[]): void {
  const rules = field.validation
  if (!rules) return
  const base = `fields.${index}.validation`
  if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) {
    issues.push({ path: `${base}.max`, message: 'Giá trị tối đa phải lớn hơn hoặc bằng giá trị tối thiểu.' })
  }
  if (rules.minLength !== undefined && rules.maxLength !== undefined && rules.minLength > rules.maxLength) {
    issues.push({ path: `${base}.maxLength`, message: 'Độ dài tối đa phải lớn hơn hoặc bằng độ dài tối thiểu.' })
  }
  if (rules.minLength !== undefined && rules.minLength < 0) issues.push({ path: `${base}.minLength`, message: 'Độ dài tối thiểu không được âm.' })
  if (rules.maxLength !== undefined && rules.maxLength < 0) issues.push({ path: `${base}.maxLength`, message: 'Độ dài tối đa không được âm.' })
  if (rules.pattern) {
    try {
      new RegExp(rules.pattern)
    } catch {
      issues.push({ path: `${base}.pattern`, message: 'Biểu thức chính quy không hợp lệ.' })
    }
    if (rules.pattern.length > 200 || /\([^)]*[+*][^)]*\)[+*{]/.test(rules.pattern) || /\\[1-9]/.test(rules.pattern)) {
      issues.push({ path: `${base}.pattern`, message: 'Biểu thức chính quy có cấu trúc không an toàn.' })
    }
  }
}

function validateFile(field: FormField, index: number, issues: FormBuilderIssue[]): void {
  if (field.type !== 'FILE') return
  const config = field.fileConfig
  const base = `fields.${index}.fileConfig`
  if (!config) {
    issues.push({ path: base, message: 'Trường tệp cần cấu hình tệp đính kèm.' })
    return
  }
  if (!config.allowedMimeTypes.length) issues.push({ path: `${base}.allowedMimeTypes`, message: 'Cần cho phép ít nhất một MIME type.' })
  if (new Set(config.allowedMimeTypes).size !== config.allowedMimeTypes.length) issues.push({ path: `${base}.allowedMimeTypes`, message: 'MIME type không được trùng.' })
  if (!Number.isInteger(config.maxFileSizeBytes) || config.maxFileSizeBytes < 1) issues.push({ path: `${base}.maxFileSizeBytes`, message: 'Dung lượng tối đa phải lớn hơn 0.' })
  if (!Number.isInteger(config.maxFiles) || config.maxFiles < 1 || config.maxFiles > 100) issues.push({ path: `${base}.maxFiles`, message: 'Số tệp tối đa phải từ 1 đến 100.' })
  if (!config.multiple && config.maxFiles !== 1) issues.push({ path: `${base}.maxFiles`, message: 'Trường chỉ nhận một tệp phải có số tệp tối đa là 1.' })
}

function validateVisibility(fields: readonly FormField[], issues: FormBuilderIssue[]): void {
  const keyToIndex = new Map(fields.map((field, index) => [field.key, index]))
  const dependencies = new Map<string, string>()
  fields.forEach((field, index) => {
    const condition = field.visibilityCondition
    if (!condition) return
    if (!keyToIndex.has(condition.fieldKey) || condition.fieldKey === field.key) {
      issues.push({ path: `fields.${index}.visibilityCondition.fieldKey`, message: 'Điều kiện phải tham chiếu một trường khác đang tồn tại.' })
    } else {
      dependencies.set(field.key, condition.fieldKey)
    }
    if (condition.operator === 'IN' && !Array.isArray(condition.value)) {
      issues.push({ path: `fields.${index}.visibilityCondition.value`, message: 'Toán tử “Nằm trong” cần một danh sách giá trị.' })
    }
  })
  for (const [start, index] of fields.map((field, index) => [field.key, index] as const)) {
    const visited = new Set<string>()
    let current: string | undefined = start
    while (current) {
      if (visited.has(current)) {
        issues.push({ path: `fields.${index}.visibilityCondition.fieldKey`, message: 'Điều kiện hiển thị đang tạo vòng phụ thuộc.' })
        break
      }
      visited.add(current)
      current = dependencies.get(current)
    }
  }
}
