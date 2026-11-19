import {
  formAutoFillSources,
  formCategories,
  type FormAutoFillSource,
  type FormCategory,
  type FormField,
  type FormFieldType,
  type FormSettings,
  type FormTableColumn,
  type FormTableConfig,
  type TableColumnType,
} from '../types/workflow'
import { validateFormCalculationsAndCycles } from './form-calculation'

export const formCategoryLabels: Record<FormCategory, string> = {
  HR: 'Nhân sự',
  ADMIN: 'Hành chính',
  FINANCE: 'Tài chính',
  PROCUREMENT: 'Mua sắm',
  IT: 'CNTT',
  OTHER: 'Khác',
}

export const formCategorySelectOptions = [
  { value: '', label: 'Chưa phân nhóm' },
  ...formCategories.map((category) => ({
    value: category,
    label: formCategoryLabels[category],
  })),
]

export function formatFormCategory(category?: string | null): string | undefined {
  if (!category) return undefined
  return (formCategoryLabels as Record<string, string>)[category] ?? category
}

export interface FormBuilderIssue {
  path: string
  message: string
}

export interface RequesterFieldPreset {
  presetKey: string
  baseFieldKey: string
  label: string
  type: FormFieldType
  required: boolean
  source: FormAutoFillSource
  readOnly: boolean
}

export const autoFillFieldPlaceholder = 'Dữ liệu được tự động điền khi tạo phiếu'

export const autoFillSourceLabels: Record<FormAutoFillSource, string> = {
  REQUEST_CODE: 'Mã phiếu',
  REQUEST_STATUS: 'Trạng thái phiếu',
  REQUESTER_EMPLOYEE_CODE: 'Mã nhân viên',
  REQUESTER_FULL_NAME: 'Họ và tên nhân viên',
  REQUESTER_DEPARTMENT_NAME: 'Phòng ban quản lý',
  REQUESTER_WORK_UNIT_NAME: 'Đơn vị làm việc',
  REQUESTER_POSITION_NAME: 'Chức danh / Vị trí',
  REQUESTER_ANNUAL_LEAVE_DAYS: 'Số ngày phép năm còn lại',
  REQUESTER_DIRECT_MANAGER_NAME: 'Quản lý trực tiếp',
  REQUESTER_EMAIL: 'Email người tạo',
  REQUESTER_PHONE: 'Số điện thoại người tạo',
  CURRENT_DATE: 'Ngày tạo phiếu (hôm nay)',
}

const autoFillAllowedFieldTypes: Readonly<Record<FormAutoFillSource, ReadonlySet<FormFieldType>>> = {
  REQUEST_CODE: new Set(['TEXT']),
  REQUEST_STATUS: new Set(['TEXT']),
  REQUESTER_EMPLOYEE_CODE: new Set(['TEXT', 'TEXTAREA']),
  REQUESTER_FULL_NAME: new Set(['TEXT', 'TEXTAREA']),
  REQUESTER_EMAIL: new Set(['EMAIL', 'TEXT', 'TEXTAREA']),
  REQUESTER_PHONE: new Set(['PHONE', 'TEXT', 'TEXTAREA']),
  REQUESTER_DEPARTMENT_NAME: new Set(['TEXT', 'TEXTAREA']),
  REQUESTER_WORK_UNIT_NAME: new Set(['TEXT', 'TEXTAREA']),
  REQUESTER_POSITION_NAME: new Set(['TEXT', 'TEXTAREA']),
  REQUESTER_ANNUAL_LEAVE_DAYS: new Set(['NUMBER']),
  REQUESTER_DIRECT_MANAGER_NAME: new Set(['TEXT', 'TEXTAREA']),
  CURRENT_DATE: new Set(['DATE', 'DATETIME', 'TEXT']),
}

const requestSystemFieldSources = new Set<FormAutoFillSource>([
  'REQUEST_CODE',
  'REQUEST_STATUS',
])

const requestSystemFieldTemplates: readonly FormField[] = [
  {
    key: 'request_code',
    label: 'Mã phiếu',
    type: 'TEXT',
    required: false,
    order: 10,
    placeholder: autoFillFieldPlaceholder,
    layout: { columnSpan: 6 },
    autoFill: { source: 'REQUEST_CODE', readOnly: true },
  },
  {
    key: 'request_status',
    label: 'Trạng thái',
    type: 'TEXT',
    required: false,
    order: 20,
    placeholder: autoFillFieldPlaceholder,
    layout: { columnSpan: 6 },
    autoFill: { source: 'REQUEST_STATUS', readOnly: true },
  },
]

export function isSystemRequestField(field: Pick<FormField, 'autoFill'>): boolean {
  return Boolean(field.autoFill && requestSystemFieldSources.has(field.autoFill.source))
}

export function ensureSystemRequestFields(fields: readonly FormField[]): FormField[] {
  const seen = new Set<FormAutoFillSource>()
  const normalized = fields.flatMap((field) => {
    const source = field.autoFill?.source
    if (!source || !requestSystemFieldSources.has(source)) {
      const copy = structuredClone(field)
      if (copy.autoFill?.readOnly) copy.required = false
      if (copy.formula && copy.formula.trim()) {
        copy.formula = copy.formula.trim()
        copy.required = false
        delete copy.defaultValue
        delete copy.validation
      } else if (copy.formula === '') {
        delete copy.formula
      }
      if (copy.tableConfig?.columns) {
        copy.tableConfig.columns = copy.tableConfig.columns.map((col) => {
          const nextCol = { ...col }
          if (nextCol.formula && nextCol.formula.trim()) {
            nextCol.formula = nextCol.formula.trim()
            nextCol.required = false
            delete nextCol.validation
          } else if (nextCol.formula === '') {
            delete nextCol.formula
          }
          return nextCol
        })
      }
      return [copy]
    }
    if (seen.has(source)) return []
    seen.add(source)
    const template = requestSystemFieldTemplates.find((item) => item.autoFill?.source === source)
    if (!template) return [structuredClone(field)]
    return [{
      ...structuredClone(template),
      order: field.order,
      layout: structuredClone(field.layout ?? template.layout),
    }]
  })
  const missing = requestSystemFieldTemplates
    .filter((field) => field.autoFill && !seen.has(field.autoFill.source))
    .map((field) => structuredClone(field))
  return reindexFields([...missing, ...normalized])
}

export const requesterFieldPresets: readonly RequesterFieldPreset[] = [
  {
    presetKey: 'EMPLOYEE_CODE',
    baseFieldKey: 'employee_code',
    label: 'Mã nhân viên',
    type: 'TEXT',
    required: true,
    source: 'REQUESTER_EMPLOYEE_CODE',
    readOnly: true,
  },
  {
    presetKey: 'FULL_NAME',
    baseFieldKey: 'employee_full_name',
    label: 'Họ và tên',
    type: 'TEXT',
    required: true,
    source: 'REQUESTER_FULL_NAME',
    readOnly: true,
  },
  {
    presetKey: 'DEPARTMENT_NAME',
    baseFieldKey: 'department_name',
    label: 'Phòng ban',
    type: 'TEXT',
    required: false,
    source: 'REQUESTER_DEPARTMENT_NAME',
    readOnly: true,
  },
  {
    presetKey: 'WORK_UNIT_NAME',
    baseFieldKey: 'work_unit_name',
    label: 'Đơn vị làm việc',
    type: 'TEXT',
    required: false,
    source: 'REQUESTER_WORK_UNIT_NAME',
    readOnly: true,
  },
  {
    presetKey: 'POSITION_NAME',
    baseFieldKey: 'position_name',
    label: 'Chức danh',
    type: 'TEXT',
    required: false,
    source: 'REQUESTER_POSITION_NAME',
    readOnly: true,
  },
  {
    presetKey: 'ANNUAL_LEAVE_DAYS',
    baseFieldKey: 'annual_leave_days',
    label: 'Số ngày phép còn lại',
    type: 'NUMBER',
    required: false,
    source: 'REQUESTER_ANNUAL_LEAVE_DAYS',
    readOnly: true,
  },
  {
    presetKey: 'DIRECT_MANAGER',
    baseFieldKey: 'direct_manager_name',
    label: 'Quản lý trực tiếp',
    type: 'TEXT',
    required: false,
    source: 'REQUESTER_DIRECT_MANAGER_NAME',
    readOnly: true,
  },
  {
    presetKey: 'REQUESTER_EMAIL',
    baseFieldKey: 'requester_email',
    label: 'Email liên hệ',
    type: 'EMAIL',
    required: false,
    source: 'REQUESTER_EMAIL',
    readOnly: false,
  },
  {
    presetKey: 'REQUESTER_PHONE',
    baseFieldKey: 'requester_phone',
    label: 'Số điện thoại',
    type: 'PHONE',
    required: false,
    source: 'REQUESTER_PHONE',
    readOnly: false,
  },
  {
    presetKey: 'REQUEST_DATE',
    baseFieldKey: 'request_date',
    label: 'Ngày tạo phiếu',
    type: 'DATE',
    required: false,
    source: 'CURRENT_DATE',
    readOnly: true,
  },
]

export function compatibleAutoFillSourcesForType(type: FormFieldType): FormAutoFillSource[] {
  return formAutoFillSources.filter(
    (source) => !requestSystemFieldSources.has(source) && autoFillAllowedFieldTypes[source].has(type),
  )
}

export function defaultAutoFillReadOnly(source: FormAutoFillSource): boolean {
  return source !== 'REQUESTER_EMAIL' && source !== 'REQUESTER_PHONE'
}

const fieldKeyPattern = /^[A-Za-z][A-Za-z0-9_]*$/
const formCodePattern = /^[A-Z][A-Z0-9_]*$/
const optionTypes = new Set<FormFieldType>(['SELECT', 'MULTI_SELECT', 'RADIO', 'CHECKBOX'])
const numberTypes = new Set<FormFieldType>(['NUMBER', 'CURRENCY'])

const defaultFieldPlaceholders: Partial<Record<FormFieldType, string>> = {
  TEXT: 'Nhập nội dung...',
  TEXTAREA: 'Nhập nội dung chi tiết...',
  NUMBER: 'Nhập số...',
  CURRENCY: 'Nhập số tiền...',
  EMAIL: 'Nhập địa chỉ email...',
  PHONE: 'Nhập số điện thoại...',
  DATE: 'Chọn ngày',
  DATETIME: 'Chọn ngày và giờ',
  SELECT: 'Chọn một giá trị',
  MULTI_SELECT: 'Chọn một hoặc nhiều giá trị',
  FILE: 'Chọn hoặc kéo thả tệp',
}
const textTypes = new Set<FormFieldType>(['TEXT', 'TEXTAREA', 'EMAIL', 'PHONE'])

export type FieldColumnSpan = 3 | 4 | 6 | 12

export type CanvasDropPlacement = 'ROW_BEFORE' | 'ROW_AFTER' | 'COL_LEFT' | 'COL_RIGHT'

export interface FieldGridRow {
  rowIndex: number
  startIndex: number
  endIndex: number
  indices: number[]
  totalSpan: number
}

export type CanvasDropTarget =
  | { kind: 'SHEET_END' }
  | { kind: 'FIELD'; index: number; placement: CanvasDropPlacement }

export type CanvasDropPayload =
  | { kind: 'NEW_FIELD'; field: FormField }
  | { kind: 'MOVE_FIELD'; fromIndex: number }

export function defaultColumnSpanForType(_type: FormFieldType): 12 {
  return 12
}

export function readFieldColumnSpan(field: FormField): FieldColumnSpan {
  if (field.type === 'TABLE' || field.type === 'SECTION') return 12
  const layout = field.layout ?? {}
  if (layout.fullWidth === true || layout.width === 'full') return 12
  if (layout.width === 'half') return 6
  if (layout.width === 'third') return 4
  if (layout.width === 'quarter') return 3
  const requested = typeof layout.columnSpan === 'number' ? layout.columnSpan : layout.colSpan
  if (requested === 3 || requested === 4 || requested === 6 || requested === 12) return requested
  return defaultColumnSpanForType(field.type)
}

export function readFieldNewRow(field: FormField): boolean {
  return field.layout?.newRow === true && readFieldColumnSpan(field) < 12
}

export function computeFieldRows(fields: readonly FormField[]): FieldGridRow[] {
  const rows: FieldGridRow[] = []
  let current: FieldGridRow | null = null

  fields.forEach((field, index) => {
    const span = readFieldColumnSpan(field)
    const startsNewRow = readFieldNewRow(field)
    if (
      !current ||
      span === 12 ||
      current.totalSpan === 12 ||
      startsNewRow ||
      current.totalSpan + span > 12
    ) {
      current = {
        rowIndex: rows.length,
        startIndex: index,
        endIndex: index,
        indices: [index],
        totalSpan: span,
      }
      rows.push(current)
      return
    }
    current.indices.push(index)
    current.endIndex = index
    current.totalSpan += span
  })

  return rows
}

export function canDropAtCanvasPlacement(
  fields: readonly FormField[],
  targetIndex: number,
  placement: CanvasDropPlacement,
  draggedFieldType: FormFieldType,
  draggedCanvasIndex?: number,
): boolean {
  if (targetIndex < 0 || targetIndex >= fields.length) return false
  const rows = computeFieldRows(fields)
  const targetRow = rows.find((row) => row.indices.includes(targetIndex))
  if (!targetRow) return false
  const sourceRow = draggedCanvasIndex !== undefined
    ? rows.find((row) => row.indices.includes(draggedCanvasIndex))
    : undefined

  if (placement === 'COL_LEFT' || placement === 'COL_RIGHT') {
    if (
      draggedFieldType === 'TABLE' ||
      draggedFieldType === 'SECTION' ||
      fields[targetIndex].type === 'TABLE' ||
      fields[targetIndex].type === 'SECTION'
    ) {
      return false
    }
    if (draggedCanvasIndex === targetIndex) return false

    if (draggedCanvasIndex !== undefined && sourceRow?.rowIndex === targetRow.rowIndex) {
      if (placement === 'COL_LEFT' && draggedCanvasIndex === targetIndex - 1) return false
      if (placement === 'COL_RIGHT' && draggedCanvasIndex === targetIndex + 1) return false
      return true
    }

    return targetRow.indices.length < 4
  }

  if (draggedCanvasIndex === undefined || !sourceRow) return true

  // Multi-column field can always be pulled out to a full 1-column row above/below
  if (sourceRow.indices.length >= 2) return true

  const draggedSpan = readFieldColumnSpan(fields[draggedCanvasIndex])
  if (sourceRow.rowIndex === targetRow.rowIndex) return false
  if (placement === 'ROW_BEFORE' && sourceRow.rowIndex === targetRow.rowIndex - 1 && draggedSpan === 12) {
    return false
  }
  if (placement === 'ROW_AFTER' && sourceRow.rowIndex === targetRow.rowIndex + 1 && draggedSpan === 12) {
    return false
  }
  return true
}

export function applyCanvasDrop(
  fields: readonly FormField[],
  target: CanvasDropTarget,
  payload: CanvasDropPayload,
): { fields: FormField[]; selectedIndex: number; changed: boolean } {
  if (!fields.length) {
    if (payload.kind === 'NEW_FIELD') {
      const first = applyFieldSpan(payload.field, 12, false)
      return { fields: reindexFields([first]), selectedIndex: 0, changed: true }
    }
    return { fields: [], selectedIndex: 0, changed: false }
  }

  const rows = computeFieldRows(fields)

  if (payload.kind === 'MOVE_FIELD') {
    const { fromIndex } = payload
    if (fromIndex < 0 || fromIndex >= fields.length) {
      return { fields: reindexFields(fields), selectedIndex: 0, changed: false }
    }
    if (target.kind === 'SHEET_END') {
      const lastRow = rows[rows.length - 1]
      if (
        lastRow &&
        lastRow.indices.length === 1 &&
        lastRow.indices[0] === fromIndex &&
        readFieldColumnSpan(fields[fromIndex]) === 12
      ) {
        return { fields: reindexFields(fields), selectedIndex: fromIndex, changed: false }
      }
    } else if (
      !canDropAtCanvasPlacement(
        fields,
        target.index,
        target.placement,
        fields[fromIndex].type,
        fromIndex,
      )
    ) {
      return { fields: reindexFields(fields), selectedIndex: fromIndex, changed: false }
    }
  } else if (
    target.kind === 'FIELD' &&
    !canDropAtCanvasPlacement(fields, target.index, target.placement, payload.field.type)
  ) {
    // Fallback to row insertion if side-split is disallowed (e.g. dropping TABLE onto side)
    target = {
      kind: 'FIELD',
      index: target.index,
      placement: target.placement === 'COL_LEFT' ? 'ROW_BEFORE' : 'ROW_AFTER',
    }
  }

  interface RowBucket {
    items: FormField[]
    rebalance: boolean
  }

  const buckets: RowBucket[] = rows.map((row) => ({
    items: row.indices.map((idx) => fields[idx]),
    rebalance: false,
  }))

  const originalTargetField = target.kind === 'FIELD' ? fields[target.index] : null
  const originalTargetRowIdx = target.kind === 'FIELD'
    ? rows.findIndex((row) => row.indices.includes(target.index))
    : -1

  let incomingField: FormField
  let sameRowReorder = false

  if (payload.kind === 'MOVE_FIELD') {
    const sourceRowIdx = rows.findIndex((row) => row.indices.includes(payload.fromIndex))
    const sourceBucket = buckets[sourceRowIdx]
    const originalSourceLength = sourceBucket.items.length
    const posInSource = sourceBucket.items.indexOf(fields[payload.fromIndex])
    const [removed] = sourceBucket.items.splice(posInSource, 1)
    incomingField = removed

    const isSideDropOnSameRow =
      target.kind === 'FIELD' &&
      (target.placement === 'COL_LEFT' || target.placement === 'COL_RIGHT') &&
      sourceRowIdx === originalTargetRowIdx

    if (isSideDropOnSameRow) {
      sameRowReorder = true
    } else if (sourceBucket.items.length === 0) {
      buckets.splice(sourceRowIdx, 1)
    } else if (originalSourceLength >= 2) {
      sourceBucket.rebalance = true
    }
  } else {
    incomingField = payload.field
  }

  if (target.kind === 'SHEET_END') {
    buckets.push({ items: [incomingField], rebalance: true })
  } else {
    const activeTargetBucketIdx = originalTargetField
      ? buckets.findIndex((bucket) => bucket.items.includes(originalTargetField))
      : -1

    if (activeTargetBucketIdx === -1) {
      // Only happens when moving a field from a 2+ col row and originalTargetField WAS the moved field itself on ROW_BEFORE / ROW_AFTER
      const fallbackIdx = Math.min(Math.max(0, originalTargetRowIdx), buckets.length - 1)
      const insertAt = target.placement === 'ROW_BEFORE' ? fallbackIdx : fallbackIdx + 1
      buckets.splice(insertAt, 0, { items: [incomingField], rebalance: true })
    } else if (target.placement === 'ROW_BEFORE') {
      buckets.splice(activeTargetBucketIdx, 0, { items: [incomingField], rebalance: true })
    } else if (target.placement === 'ROW_AFTER') {
      buckets.splice(activeTargetBucketIdx + 1, 0, { items: [incomingField], rebalance: true })
    } else {
      const targetBucket = buckets[activeTargetBucketIdx]
      const targetPos = originalTargetField ? targetBucket.items.indexOf(originalTargetField) : 0
      const insertPos = target.placement === 'COL_LEFT' ? targetPos : targetPos + 1
      targetBucket.items.splice(insertPos, 0, incomingField)
      if (!sameRowReorder) {
        targetBucket.rebalance = true
      }
    }
  }

  const finalized = finalizeRowBuckets(buckets, incomingField)
  return {
    fields: finalized.fields,
    selectedIndex: finalized.selectedIndex,
    changed: true,
  }
}

export function removeFieldAndRebalanceRows(
  fields: readonly FormField[],
  removeIndex: number,
): FormField[] {
  if (removeIndex < 0 || removeIndex >= fields.length) return reindexFields(fields)
  const rows = computeFieldRows(fields)
  const buckets = rows
    .map((row) => {
      const hadMultiple = row.indices.length >= 2
      const remaining = row.indices
        .filter((idx) => idx !== removeIndex)
        .map((idx) => fields[idx])
      return {
        items: remaining,
        rebalance: hadMultiple && remaining.length < row.indices.length,
      }
    })
    .filter((bucket) => bucket.items.length > 0)

  return finalizeRowBuckets(buckets).fields
}

export function validateFormBuilderDefinition(
  code: string,
  name: string,
  fields: readonly FormField[],
  settings?: FormSettings,
  groupId = '',
): FormBuilderIssue[] {
  const issues: FormBuilderIssue[] = []
  const normalizedCode = code.trim().toUpperCase()
  if (!normalizedCode) issues.push({ path: 'code', message: 'Mã biểu mẫu là bắt buộc.' })
  else if (!formCodePattern.test(normalizedCode)) issues.push({ path: 'code', message: 'Mã chỉ gồm chữ in hoa, số và dấu gạch dưới.' })
  if (!name.trim()) issues.push({ path: 'name', message: 'Tên biểu mẫu là bắt buộc.' })
  if (!groupId.trim()) issues.push({ path: 'groupId', message: 'Vui lòng chọn nhóm biểu mẫu.' })
  if (!fields.length) issues.push({ path: 'fields', message: 'Biểu mẫu cần có ít nhất một trường.' })

  const keyIndexes = new Map<string, number[]>()
  fields.forEach((field, index) => {
    const key = field.key.trim()
    keyIndexes.set(key, [...(keyIndexes.get(key) ?? []), index])
    if (!key) issues.push({ path: `fields.${index}.key`, message: 'Mã trường là bắt buộc.' })
    else if (!fieldKeyPattern.test(key)) issues.push({ path: `fields.${index}.key`, message: 'Mã trường phải bắt đầu bằng chữ và chỉ gồm chữ, số, dấu gạch dưới.' })
    if (!field.label.trim()) issues.push({ path: `fields.${index}.label`, message: 'Nhãn hiển thị là bắt buộc.' })
    validateOptions(field, index, issues)
    validateRules(field, index, issues)
    validateDefaultValue(field, index, issues)
    validateAutoFill(field, index, issues)
    validateFile(field, index, issues)
    validateTable(field, index, issues)
    validateSection(field, index, issues)
  })

  for (const indexes of keyIndexes.values()) {
    if (indexes.length < 2) continue
    for (const index of indexes) issues.push({ path: `fields.${index}.key`, message: 'Mã trường không được trùng trong cùng biểu mẫu.' })
  }
  validateVisibility(fields, issues)
  for (const calcIssue of validateFormCalculationsAndCycles(fields)) {
    issues.push(calcIssue)
  }
  if (settings?.leaveDeduction?.enabled) {
    const targetKey = settings.leaveDeduction.fieldKey?.trim() ?? ''
    if (!targetKey) {
      issues.push({
        path: 'settings.leaveDeduction.fieldKey',
        message: 'Vui lòng chọn trường số ngày nghỉ cần trừ khi phê duyệt.',
      })
    } else {
      const targetField = fields.find((field) => field.key === targetKey)
      if (!targetField) {
        issues.push({
          path: 'settings.leaveDeduction.fieldKey',
          message: `Trường trừ ngày phép "${targetKey}" không còn tồn tại trong biểu mẫu.`,
        })
      } else if (targetField.type !== 'NUMBER' || targetField.autoFill) {
        issues.push({
          path: 'settings.leaveDeduction.fieldKey',
          message: 'Trường trừ ngày phép năm phải là trường kiểu Số (không phải trường tự động điền).',
        })
      }
    }
  }
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
    layout: { columnSpan: defaultColumnSpanForType(type) },
    ...(defaultFieldPlaceholder(type) ? { placeholder: defaultFieldPlaceholder(type) } : {}),
  }
  if (optionTypes.has(type)) {
    base.options = [{ value: 'OPTION_1', label: 'Lựa chọn 1', order: 10, isActive: true }]
  }
  if (type === 'FILE') {
    base.fileConfig = {
      multiple: false,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      maxFileSizeBytes: 5 * 1024 * 1024,
      maxFiles: 1,
    }
  }
  if (type === 'TABLE') {
    base.label = 'Bảng chi tiết'
    base.tableConfig = createDefaultTableConfig()
  }
  if (type === 'SECTION') {
    base.label = 'Tiêu đề phân đoạn'
    base.layout = { columnSpan: 12 }
  }
  return base
}

export function createPresetField(presetKey: string, fields: readonly FormField[]): FormField {
  const preset = requesterFieldPresets.find((item) => item.presetKey === presetKey)
  if (!preset) return createField('TEXT', fields)
  const key = nextUniqueKey(preset.baseFieldKey, fields)
  return {
    key,
    label: preset.label,
    type: preset.type,
    required: preset.readOnly ? false : preset.required,
    order: (fields.length + 1) * 10,
    layout: { columnSpan: defaultColumnSpanForType(preset.type) },
    placeholder: autoFillFieldPlaceholder,
    autoFill: {
      source: preset.source,
      readOnly: preset.readOnly,
    },
  }
}

export function insertFieldAtIndex(
  fields: readonly FormField[],
  newField: FormField,
  targetIndex?: number,
): { fields: FormField[]; selectedIndex: number } {
  const clamped = targetIndex === undefined
    ? fields.length
    : Math.max(0, Math.min(fields.length, targetIndex))
  const next = [
    ...fields.slice(0, clamped),
    newField,
    ...fields.slice(clamped),
  ]
  return {
    fields: reindexFields(next),
    selectedIndex: clamped,
  }
}

export function moveFieldToSlot(
  fields: readonly FormField[],
  fromIndex: number,
  rawInsertIndex: number,
): { fields: FormField[]; selectedIndex: number; changed: boolean } {
  if (fromIndex < 0 || fromIndex >= fields.length) {
    return { fields: reindexFields(fields), selectedIndex: 0, changed: false }
  }
  const clampedInsert = Math.max(0, Math.min(fields.length, rawInsertIndex))
  if (clampedInsert === fromIndex || clampedInsert === fromIndex + 1) {
    return { fields: reindexFields(fields), selectedIndex: fromIndex, changed: false }
  }
  const next = [...fields]
  const [moved] = next.splice(fromIndex, 1)
  const finalIndex = fromIndex < clampedInsert ? clampedInsert - 1 : clampedInsert
  next.splice(finalIndex, 0, moved)
  return {
    fields: reindexFields(next),
    selectedIndex: finalIndex,
    changed: true,
  }
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
  const defaultPlaceholder = defaultFieldPlaceholder(type)
  if (defaultPlaceholder) next.placeholder = defaultPlaceholder
  else delete next.placeholder
  if (optionTypes.has(type)) {
    next.options = field.options?.length ? field.options : [{ value: 'OPTION_1', label: 'Lựa chọn 1', order: 10, isActive: true }]
  } else {
    delete next.options
  }
  if (type === 'FILE') {
    next.fileConfig = field.fileConfig ?? {
      multiple: false,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      maxFileSizeBytes: 5 * 1024 * 1024,
      maxFiles: 1,
    }
  } else {
    delete next.fileConfig
  }
  if (type === 'TABLE') {
    next.tableConfig = field.tableConfig ?? createDefaultTableConfig()
    const { newRow: _newRow, ...restLayout } = field.layout ?? {}
    next.layout = { ...restLayout, columnSpan: 12 }
  } else {
    delete next.tableConfig
    if (field.type === 'TABLE') {
      const { newRow: _newRow, ...restLayout } = field.layout ?? {}
      next.layout = { ...restLayout, columnSpan: defaultColumnSpanForType(type) }
    } else if (!field.layout) {
      next.layout = { columnSpan: defaultColumnSpanForType(type) }
    }
  }
  if (type === 'SECTION') {
    const { newRow: _newRow, ...restLayout } = next.layout ?? {}
    next.layout = { ...restLayout, columnSpan: 12 }
    next.required = false
    delete next.defaultValue
    delete next.autoFill
    delete next.options
    delete next.validation
    delete next.fileConfig
    delete next.tableConfig
    delete next.placeholder
  }
  if (!numberTypes.has(type)) {
    delete next.formula
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
  if (next.autoFill && !autoFillAllowedFieldTypes[next.autoFill.source]?.has(type)) {
    delete next.autoFill
  }
  delete next.defaultValue
  return next
}

export function createDefaultTableConfig(): FormTableConfig {
  return {
    columns: [createTableColumn([])],
    minRows: 1,
    maxRows: 50,
    allowAddRows: true,
    allowRemoveRows: true,
  }
}

export function createTableColumn(columns: readonly FormTableColumn[], type: TableColumnType = 'TEXT'): FormTableColumn {
  const used = new Set(columns.map((column) => column.key))
  let index = columns.length + 1
  while (used.has(`column_${index}`)) index += 1
  return {
    key: `column_${index}`,
    label: `Cột ${index}`,
    type,
    required: false,
    order: (columns.length + 1) * 10,
    ...(type === 'SELECT' ? { options: [{ value: 'OPTION_1', label: 'Lựa chọn 1', order: 10, isActive: true }] } : {}),
  }
}

export function reindexFields(fields: readonly FormField[]): FormField[] {
  return fields.map((field, index) => ({ ...field, order: (index + 1) * 10 }))
}

export function updateFieldLabelAndGeneratedKey(
  field: FormField,
  label: string,
  fields: readonly FormField[],
  fieldIndex: number,
): FormField {
  const keyIsGenerated = /^field_\d+$/.test(field.key)
  if (!keyIsGenerated) return { ...field, label }
  const baseKey = fieldKeyFromLabel(label)
  if (!baseKey) return { ...field, label }
  const usedKeys = new Set(
    fields.filter((_, index) => index !== fieldIndex).map((item) => item.key),
  )
  let key = baseKey
  let suffix = 2
  while (usedKeys.has(key)) {
    key = `${baseKey}_${suffix}`
    suffix += 1
  }
  return { ...field, label, key }
}

export function updateTableColumnLabelAndGeneratedKey(
  column: FormTableColumn,
  label: string,
  columns: readonly FormTableColumn[],
  columnIndex: number,
): FormTableColumn {
  const keyIsGenerated = /^column_\d+$/.test(column.key)
  if (!keyIsGenerated) return { ...column, label }
  const baseKey = fieldKeyFromLabel(label)
  if (!baseKey) return { ...column, label }
  const usedKeys = new Set(
    columns.filter((_, index) => index !== columnIndex).map((item) => item.key),
  )
  let key = baseKey
  let suffix = 2
  while (usedKeys.has(key)) {
    key = `${baseKey}_${suffix}`
    suffix += 1
  }
  return { ...column, label, key }
}

export function fieldKeyFromLabel(label: string): string {
  const normalized = label
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized) return ''
  const prefixed = /^[a-z]/.test(normalized) ? normalized : `field_${normalized}`
  return prefixed.slice(0, 80).replace(/_+$/g, '')
}

export function defaultFieldPlaceholder(type: FormFieldType): string | undefined {
  return defaultFieldPlaceholders[type]
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

function nextUniqueKey(baseKey: string, fields: readonly FormField[]): string {
  const used = new Set(fields.map((field) => field.key))
  if (!used.has(baseKey)) return baseKey
  let suffix = 2
  while (used.has(`${baseKey}_${suffix}`)) suffix += 1
  return `${baseKey}_${suffix}`
}

function validateAutoFill(field: FormField, index: number, issues: FormBuilderIssue[]): void {
  if (!field.autoFill) return
  const allowed = autoFillAllowedFieldTypes[field.autoFill.source]
  if (!allowed || !allowed.has(field.type)) {
    issues.push({
      path: `fields.${index}.autoFill`,
      message: 'Loại trường này không hỗ trợ nguồn dữ liệu tự động điền đã chọn.',
    })
  }
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
  if (field.formula !== undefined && field.formula.trim() !== '') return
  const rules = field.validation
  if (!rules) return
  const base = `fields.${index}.validation`
  if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) {
    issues.push({ path: `${base}.max`, message: 'Giá trị tối đa phải lớn hơn hoặc bằng giá trị tối thiểu.' })
  }
  if (rules.min !== undefined && rules.min < 0) {
    issues.push({ path: `${base}.min`, message: 'Giá trị tối thiểu không được âm.' })
  }
  if (rules.max !== undefined && rules.max < 0) {
    issues.push({ path: `${base}.max`, message: 'Giá trị tối đa không được âm.' })
  }
  if (rules.minLength !== undefined && rules.maxLength !== undefined && rules.minLength > rules.maxLength) {
    issues.push({ path: `${base}.maxLength`, message: 'Độ dài tối đa phải lớn hơn hoặc bằng độ dài tối thiểu.' })
  }
  if (rules.minLength !== undefined && (rules.minLength < 0 || !Number.isInteger(rules.minLength))) {
    issues.push({ path: `${base}.minLength`, message: 'Độ dài tối thiểu phải là số nguyên không âm.' })
  }
  if (rules.maxLength !== undefined && (rules.maxLength < 0 || !Number.isInteger(rules.maxLength))) {
    issues.push({ path: `${base}.maxLength`, message: 'Độ dài tối đa phải là số nguyên không âm.' })
  }
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

function validateDefaultValue(field: FormField, index: number, issues: FormBuilderIssue[]): void {
  const base = `fields.${index}`
  if (field.defaultValue === undefined || field.defaultValue === null) return
  if (field.type === 'SECTION') return

  if (field.type === 'NUMBER' || field.type === 'CURRENCY') {
    if (typeof field.defaultValue !== 'number' || !Number.isFinite(field.defaultValue)) {
      issues.push({ path: `${base}.defaultValue`, message: 'Giá trị mặc định phải là số hợp lệ.' })
      return
    }
    if (field.defaultValue < 0) {
      issues.push({ path: `${base}.defaultValue`, message: 'Giá trị mặc định không được âm.' })
      return
    }
    if (field.type === 'CURRENCY' && !Number.isInteger(field.defaultValue)) {
      issues.push({ path: `${base}.defaultValue`, message: 'Giá trị mặc định tiền tệ phải là số nguyên.' })
      return
    }
    const rules = field.validation
    if (rules) {
      if (rules.min !== undefined && field.defaultValue < rules.min) {
        issues.push({
          path: `${base}.defaultValue`,
          message: `Giá trị mặc định (${field.defaultValue}) không được nhỏ hơn mức tối thiểu (${rules.min}).`,
        })
      }
      if (rules.max !== undefined && field.defaultValue > rules.max) {
        issues.push({
          path: `${base}.defaultValue`,
          message: `Giá trị mặc định (${field.defaultValue}) không được lớn hơn mức tối đa (${rules.max}).`,
        })
      }
    }
    return
  }

  if (field.type === 'TEXT' || field.type === 'TEXTAREA') {
    if (typeof field.defaultValue !== 'string') {
      issues.push({ path: `${base}.defaultValue`, message: 'Giá trị mặc định phải là chuỗi văn bản.' })
      return
    }
    const rules = field.validation
    if (rules) {
      if (rules.minLength !== undefined && field.defaultValue.length < rules.minLength) {
        issues.push({
          path: `${base}.defaultValue`,
          message: `Độ dài giá trị mặc định (${field.defaultValue.length} ký tự) không được ngắn hơn độ dài tối thiểu (${rules.minLength} ký tự).`,
        })
      }
      if (rules.maxLength !== undefined && field.defaultValue.length > rules.maxLength) {
        issues.push({
          path: `${base}.defaultValue`,
          message: `Độ dài giá trị mặc định (${field.defaultValue.length} ký tự) không được dài hơn độ dài tối đa (${rules.maxLength} ký tự).`,
        })
      }
      if (rules.pattern) {
        try {
          if (!new RegExp(rules.pattern).test(field.defaultValue)) {
            issues.push({
              path: `${base}.defaultValue`,
              message: rules.errorMessage?.trim() || 'Giá trị mặc định không khớp định dạng quy định.',
            })
          }
        } catch {
          // Handled in validateRules
        }
      }
    }
    return
  }

  if (field.type === 'EMAIL' && typeof field.defaultValue === 'string') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.defaultValue)) {
      issues.push({ path: `${base}.defaultValue`, message: 'Giá trị mặc định không phải là email hợp lệ.' })
    }
    return
  }

  if (field.type === 'PHONE' && typeof field.defaultValue === 'string') {
    if (!/^\+?\d{1,15}$/.test(field.defaultValue)) {
      issues.push({ path: `${base}.defaultValue`, message: 'Giá trị mặc định chỉ được gồm tối đa 15 chữ số và có thể bắt đầu bằng dấu +.' })
    }
    return
  }

  if (field.type === 'SELECT' || field.type === 'RADIO') {
    if (typeof field.defaultValue === 'string') {
      const allowed = new Set((field.options ?? []).map((o) => o.value))
      if (!allowed.has(field.defaultValue)) {
        issues.push({ path: `${base}.defaultValue`, message: 'Giá trị mặc định không nằm trong danh sách lựa chọn.' })
      }
    }
    return
  }

  if (field.type === 'MULTI_SELECT' || field.type === 'CHECKBOX') {
    if (Array.isArray(field.defaultValue)) {
      const allowed = new Set((field.options ?? []).map((o) => o.value))
      const invalid = field.defaultValue.filter((v) => typeof v !== 'string' || !allowed.has(v))
      if (invalid.length > 0) {
        issues.push({ path: `${base}.defaultValue`, message: 'Giá trị mặc định chứa lựa chọn không hợp lệ.' })
      }
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

function validateTable(field: FormField, index: number, issues: FormBuilderIssue[]): void {
  if (field.type !== 'TABLE') return
  const config = field.tableConfig
  const base = `fields.${index}.tableConfig`
  if (!config) {
    issues.push({ path: base, message: 'Trường bảng cần cấu hình cột.' })
    return
  }
  if (!config.columns.length) issues.push({ path: `${base}.columns`, message: 'Bảng cần ít nhất một cột.' })
  if (config.columns.length > 30) issues.push({ path: `${base}.columns`, message: 'Bảng chỉ được có tối đa 30 cột.' })
  if (!Number.isInteger(config.minRows) || config.minRows < 0 || config.minRows > 100) issues.push({ path: `${base}.minRows`, message: 'Số dòng tối thiểu phải từ 0 đến 100.' })
  if (!Number.isInteger(config.maxRows) || config.maxRows < 1 || config.maxRows > 100) issues.push({ path: `${base}.maxRows`, message: 'Số dòng tối đa phải từ 1 đến 100.' })
  if (config.minRows > config.maxRows) issues.push({ path: `${base}.maxRows`, message: 'Số dòng tối đa phải lớn hơn hoặc bằng số dòng tối thiểu.' })
  const keys = new Set<string>()
  config.columns.forEach((column, columnIndex) => {
    const columnBase = `${base}.columns.${columnIndex}`
    const key = column.key.trim()
    if (!key) issues.push({ path: `${columnBase}.key`, message: 'Mã cột là bắt buộc.' })
    else if (!fieldKeyPattern.test(key)) issues.push({ path: `${columnBase}.key`, message: 'Mã cột phải bắt đầu bằng chữ và chỉ gồm chữ, số, dấu gạch dưới.' })
    else if (keys.has(key)) issues.push({ path: `${columnBase}.key`, message: 'Mã cột không được trùng.' })
    keys.add(key)
    if (!column.label.trim()) issues.push({ path: `${columnBase}.label`, message: 'Tên cột là bắt buộc.' })
    if (column.type === 'SELECT') {
      if (!column.options?.length) {
        issues.push({ path: `${columnBase}.options`, message: 'Cột danh sách chọn cần ít nhất một lựa chọn.' })
      } else {
        const optionValues = new Set<string>()
        column.options.forEach((option, optionIndex) => {
          const value = option.value.trim()
          if (!value) issues.push({ path: `${columnBase}.options.${optionIndex}.value`, message: 'Giá trị lựa chọn là bắt buộc.' })
          else if (optionValues.has(value)) issues.push({ path: `${columnBase}.options.${optionIndex}.value`, message: 'Giá trị lựa chọn không được trùng.' })
          optionValues.add(value)
          if (!option.label.trim()) issues.push({ path: `${columnBase}.options.${optionIndex}.label`, message: 'Nhãn lựa chọn là bắt buộc.' })
        })
      }
    }
    if (column.formula === undefined || column.formula.trim() === '') {
      const pseudoField: FormField = { ...column, required: column.required }
      const before = issues.length
      validateRules(pseudoField, index, issues)
      for (let issueIndex = before; issueIndex < issues.length; issueIndex += 1) {
        issues[issueIndex] = { ...issues[issueIndex], path: issues[issueIndex].path.replace(`fields.${index}.validation`, `${columnBase}.validation`) }
      }
    }
  })
}

function validateSection(field: FormField, index: number, issues: FormBuilderIssue[]): void {
  if (field.type !== 'SECTION') return
  const base = `fields.${index}`
  if (field.required) {
    issues.push({ path: `${base}.required`, message: 'Tiêu đề phân đoạn không thể là trường bắt buộc.' })
  }
  if (field.defaultValue !== undefined) {
    issues.push({ path: `${base}.defaultValue`, message: 'Tiêu đề phân đoạn không hỗ trợ giá trị mặc định.' })
  }
  if (field.validation !== undefined) {
    issues.push({ path: `${base}.validation`, message: 'Tiêu đề phân đoạn không hỗ trợ quy tắc kiểm tra.' })
  }
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

function equalSpanForRowCount(count: number): FieldColumnSpan {
  if (count <= 1) return 12
  if (count === 2) return 6
  if (count === 3) return 4
  return 3
}

function applyFieldSpan(
  field: FormField,
  span: FieldColumnSpan,
  forceNewRow: boolean,
): FormField {
  const {
    width: _width,
    fullWidth: _fullWidth,
    colSpan: _colSpan,
    newRow: _newRow,
    ...restLayout
  } = field.layout ?? {}

  if (span === 12 || field.type === 'TABLE' || field.type === 'SECTION') {
    return {
      ...field,
      layout: { ...restLayout, columnSpan: 12 },
    }
  }

  return {
    ...field,
    layout: forceNewRow
      ? { ...restLayout, columnSpan: span, newRow: true }
      : { ...restLayout, columnSpan: span },
  }
}

function finalizeRowBuckets(
  buckets: ReadonlyArray<{ items: FormField[]; rebalance: boolean }>,
  selectedFieldRef?: FormField,
): { fields: FormField[]; selectedIndex: number } {
  const flat: FormField[] = []
  let prevTotalSpan = 12
  let selectedIndex = 0

  for (const bucket of buckets) {
    if (!bucket.items.length) continue
    const balancedSpan = equalSpanForRowCount(bucket.items.length)
    let currentRowTotal = 0

    bucket.items.forEach((item, posInRow) => {
      const targetSpan: FieldColumnSpan = bucket.rebalance
        ? balancedSpan
        : readFieldColumnSpan(item)
      const needsExplicitNewRow =
        posInRow === 0 &&
        targetSpan < 12 &&
        prevTotalSpan < 12 &&
        (prevTotalSpan + targetSpan <= 12 || readFieldNewRow(item))

      const updated = applyFieldSpan(item, targetSpan, needsExplicitNewRow)
      if (selectedFieldRef && item === selectedFieldRef) {
        selectedIndex = flat.length
      }
      flat.push(updated)
      currentRowTotal += targetSpan
    })

    prevTotalSpan = Math.min(12, currentRowTotal)
  }

  return {
    fields: reindexFields(flat),
    selectedIndex,
  }
}
