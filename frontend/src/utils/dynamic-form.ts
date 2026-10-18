import {
  conditionOperators,
  formFieldTypes,
  type ConditionOperator,
  type DynamicFormValidationError,
  type DynamicFormValidationResult,
  type FormField,
  type FormFieldOption,
  type FormFieldType,
} from '../types/workflow'

const textTypes = new Set<FormFieldType>(['TEXT', 'TEXTAREA', 'EMAIL', 'PHONE'])
const numberTypes = new Set<FormFieldType>(['NUMBER', 'CURRENCY'])
const optionTypes = new Set<FormFieldType>(['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX'])
const objectIdPattern = /^[a-f\d]{24}$/i
const maxPatternLength = 200

export function supportedFormFields(fields: readonly FormField[]): FormField[] {
  return fields
    .filter((field) => formFieldTypes.includes(field.type))
    .toSorted((left, right) => left.order - right.order)
}

export function initialDynamicFormValues(
  fields: readonly FormField[],
  initialValues: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const values: Record<string, unknown> = { ...initialValues }
  for (const field of fields) {
    if (!(field.key in values) && field.defaultValue !== undefined) values[field.key] = field.defaultValue
  }
  return values
}

export function activeFieldOptions(field: FormField): FormFieldOption[] {
  return (field.options ?? [])
    .filter((option) => option.isActive !== false)
    .toSorted((left, right) => left.order - right.order)
}

export function dynamicFieldVisibility(
  fields: readonly FormField[],
  values: Readonly<Record<string, unknown>>,
): Map<string, boolean> {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]))
  const cache = new Map<string, boolean>()
  for (const field of fields) fieldVisible(field.key, fieldsByKey, values, cache, new Set())
  return cache
}

export function validateDynamicFormData(
  fields: readonly FormField[],
  values: Readonly<Record<string, unknown>>,
): DynamicFormValidationResult {
  const supported = supportedFormFields(fields)
  const byKey = new Map(supported.map((field) => [field.key, field]))
  const visibility = dynamicFieldVisibility(supported, values)
  const errors: DynamicFormValidationError[] = []

  for (const key of Object.keys(values)) {
    if (!byKey.has(key)) errors.push({ fieldKey: key, code: 'UNKNOWN_FIELD', message: `Trường ${key} không được khai báo trong biểu mẫu.` })
  }

  for (const field of supported) {
    const value = values[field.key]
    if (visibility.get(field.key) !== false && field.required && isEmptyValue(value)) {
      errors.push({ fieldKey: field.key, code: 'REQUIRED', message: `${field.label} là bắt buộc.` })
      continue
    }
    if (!isEmptyValue(value)) validateFieldValue(field, value, errors)
  }
  return { valid: errors.length === 0, errors }
}

export function dynamicFieldError(
  validation: DynamicFormValidationResult,
  fieldKey: string,
): DynamicFormValidationError | undefined {
  return validation.errors.find((error) => error.fieldKey === fieldKey)
}

export function dynamicFileIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return typeof value === 'string' && value ? [value] : []
}

export function humanFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = sizeBytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`
}

function fieldVisible(
  key: string,
  fieldsByKey: ReadonlyMap<string, FormField>,
  values: Readonly<Record<string, unknown>>,
  cache: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  if (visiting.has(key)) return false
  visiting.add(key)
  const condition = fieldsByKey.get(key)?.visibilityCondition
  let visible = true
  if (condition && conditionOperators.includes(condition.operator) && fieldsByKey.has(condition.fieldKey)) {
    visible = fieldVisible(condition.fieldKey, fieldsByKey, values, cache, visiting)
      && evaluateCondition(values[condition.fieldKey], condition.operator, condition.value)
  }
  visiting.delete(key)
  cache.set(key, visible)
  return visible
}

function evaluateCondition(actual: unknown, operator: ConditionOperator, expected: unknown): boolean {
  if (operator === 'EQUALS') return valuesEqual(actual, expected)
  if (operator === 'NOT_EQUALS') return !valuesEqual(actual, expected)
  if (operator === 'IN') return Array.isArray(expected) && expected.some((candidate) => valuesEqual(actual, candidate))
  if (operator === 'GREATER_THAN') return compareValues(actual, expected, (left, right) => left > right)
  return compareValues(actual, expected, (left, right) => left < right)
}

function valuesEqual(first: unknown, second: unknown): boolean {
  if (Array.isArray(first) && !Array.isArray(second)) return first.some((value) => Object.is(value, second))
  return Object.is(first, second)
}

function compareValues(actual: unknown, expected: unknown, compare: (left: number, right: number) => boolean): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') return compare(actual, expected)
  if (typeof actual === 'string' && typeof expected === 'string') {
    const left = Date.parse(actual)
    const right = Date.parse(expected)
    return !Number.isNaN(left) && !Number.isNaN(right) && compare(left, right)
  }
  return false
}

function validateFieldValue(field: FormField, value: unknown, errors: DynamicFormValidationError[]): void {
  let validType = true
  if (textTypes.has(field.type)) {
    validType = typeof value === 'string'
    if (field.type === 'EMAIL' && validType && !validEmail(value as string)) {
      errors.push({ fieldKey: field.key, code: 'INVALID_EMAIL', message: `${field.label} không phải email hợp lệ.` })
    }
  } else if (numberTypes.has(field.type)) {
    validType = typeof value === 'number' && Number.isFinite(value)
  } else if (field.type === 'DATE') {
    validType = validDate(value)
  } else if (field.type === 'DATETIME') {
    validType = typeof value === 'string' && value.includes('T') && !Number.isNaN(Date.parse(value))
  } else if (field.type === 'SELECT' || field.type === 'RADIO') {
    validType = typeof value === 'string' && optionValueSet(field).has(value)
  } else if (field.type === 'MULTI_SELECT' || field.type === 'CHECKBOX') {
    const allowed = optionValueSet(field)
    validType = Array.isArray(value)
      && value.every((item) => typeof item === 'string' && allowed.has(item))
      && new Set(value).size === value.length
  } else if (field.type === 'BOOLEAN') {
    validType = typeof value === 'boolean'
  } else if (field.type === 'FILE') {
    const fileIds = dynamicFileIds(value)
    validType = field.fileConfig?.multiple
      ? Array.isArray(value) && fileIds.length === value.length && fileIds.length <= field.fileConfig.maxFiles && fileIds.every((id) => objectIdPattern.test(id))
      : typeof value === 'string' && objectIdPattern.test(value)
  }

  if (!validType) {
    errors.push({ fieldKey: field.key, code: 'INVALID_TYPE', message: `${field.label} không đúng định dạng.` })
    return
  }
  validateRules(field, value, errors)
}

function validateRules(field: FormField, value: unknown, errors: DynamicFormValidationError[]): void {
  const rules = field.validation
  if (!rules) return
  if (typeof value === 'number') {
    if (rules.min !== undefined && value < rules.min) errors.push({ fieldKey: field.key, code: 'MIN', message: `${field.label} phải lớn hơn hoặc bằng ${rules.min}.` })
    if (rules.max !== undefined && value > rules.max) errors.push({ fieldKey: field.key, code: 'MAX', message: `${field.label} phải nhỏ hơn hoặc bằng ${rules.max}.` })
  }
  if (typeof value !== 'string') return
  if (rules.minLength !== undefined && value.length < rules.minLength) errors.push({ fieldKey: field.key, code: 'MIN_LENGTH', message: `${field.label} phải có ít nhất ${rules.minLength} ký tự.` })
  if (rules.maxLength !== undefined && value.length > rules.maxLength) errors.push({ fieldKey: field.key, code: 'MAX_LENGTH', message: `${field.label} không được vượt quá ${rules.maxLength} ký tự.` })
  if (rules.pattern && safePattern(rules.pattern) && !new RegExp(rules.pattern).test(value)) {
    errors.push({ fieldKey: field.key, code: 'PATTERN', message: rules.errorMessage?.trim() || `${field.label} không đúng định dạng.` })
  }
}

function safePattern(pattern: string): boolean {
  if (!pattern || pattern.length > maxPatternLength) return false
  try {
    new RegExp(pattern)
  } catch {
    return false
  }
  const groups: Array<{ hasQuantifier: boolean; hasAlternation: boolean }> = [{ hasQuantifier: false, hasAlternation: false }]
  let escaped = false
  let inCharacterClass = false
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (escaped) {
      if (/^[1-9]$/.test(character)) return false
      escaped = false
      continue
    }
    if (character === '\\') { escaped = true; continue }
    if (character === '[') { inCharacterClass = true; continue }
    if (character === ']' && inCharacterClass) { inCharacterClass = false; continue }
    if (inCharacterClass) continue
    if (character === '(') {
      if (pattern[index + 1] === '?') return false
      groups.push({ hasQuantifier: false, hasAlternation: false })
      continue
    }
    if (character === '|') { groups.at(-1)!.hasAlternation = true; continue }
    if (character === ')') {
      if (groups.length === 1) return false
      const group = groups.pop()!
      const followedByQuantifier = quantifierStart(pattern[index + 1])
      if (followedByQuantifier && (group.hasQuantifier || group.hasAlternation)) return false
      groups.at(-1)!.hasQuantifier ||= group.hasQuantifier || followedByQuantifier
      continue
    }
    if (quantifierStart(character)) groups.at(-1)!.hasQuantifier = true
  }
  return !escaped && !inCharacterClass && groups.length === 1
}

function quantifierStart(character: string | undefined): boolean {
  return character === '*' || character === '+' || character === '?' || character === '{'
}

function optionValueSet(field: FormField): Set<string> {
  return new Set(activeFieldOptions(field).map((option) => option.value))
}

function validEmail(value: string): boolean {
  if (value.length > 254) return false
  const at = value.indexOf('@')
  return at > 0 && at === value.lastIndexOf('@') && at < value.length - 3 && value.slice(at + 1).includes('.') && !value.includes(' ')
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

export function isOptionField(field: FormField): boolean {
  return optionTypes.has(field.type)
}
