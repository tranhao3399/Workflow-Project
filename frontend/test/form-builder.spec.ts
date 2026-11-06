import { describe, expect, it } from 'vitest'
import {
  applyCanvasDrop,
  canDropAtCanvasPlacement,
  computeFieldRows,
  createField,
  createPresetField,
  defaultColumnSpanForType,
  formatFormCategory,
  formCategorySelectOptions,
  insertFieldAtIndex,
  moveFieldToSlot,
  normalizeFieldForType,
  readFieldColumnSpan,
  readFieldNewRow,
  removeFieldAndRebalanceRows,
  validateFormBuilderDefinition,
} from '../src/utils/form-builder'

describe('form-builder layout helpers', () => {
  it('assigns full-row 12-column default span when creating any field type until resized by admin', () => {
    const textField = createField('TEXT', [])
    const dateField = createField('DATE', [textField])
    const textareaField = createField('TEXTAREA', [textField, dateField])
    const tableField = createField('TABLE', [textField, dateField, textareaField])

    expect(defaultColumnSpanForType('SELECT')).toBe(12)
    expect(readFieldColumnSpan(textField)).toBe(12)
    expect(readFieldColumnSpan(dateField)).toBe(12)
    expect(readFieldColumnSpan(textareaField)).toBe(12)
    expect(readFieldColumnSpan(tableField)).toBe(12)
  })

  it('preserves full-row default span and custom multi-column spans when switching non-table field types', () => {
    const defaultText = createField('TEXT', [])
    const switchedToDate = normalizeFieldForType(defaultText, 'DATE')
    expect(readFieldColumnSpan(switchedToDate)).toBe(12)

    const customHalfWidthDate = {
      ...switchedToDate,
      layout: { columnSpan: 6, newRow: true },
    }
    const switchedToSelect = normalizeFieldForType(customHalfWidthDate, 'SELECT')
    expect(readFieldColumnSpan(switchedToSelect)).toBe(6)
    expect(readFieldNewRow(switchedToSelect)).toBe(true)
  })

  it('forces full-row 12-column span and clears newRow flag when converting a compact field to TABLE', () => {
    const compactField = {
      ...createField('TEXT', []),
      layout: { columnSpan: 6, newRow: true },
    }
    expect(readFieldNewRow(compactField)).toBe(true)

    const tableField = normalizeFieldForType(compactField, 'TABLE')
    expect(readFieldColumnSpan(tableField)).toBe(12)
    expect(readFieldNewRow(tableField)).toBe(false)
  })

  it('creates requester auto-fill presets with default lock settings and deduplicated field keys', () => {
    const codeField = createPresetField('EMPLOYEE_CODE', [])
    const duplicateCodeField = createPresetField('EMPLOYEE_CODE', [codeField])
    const phoneField = createPresetField('REQUESTER_PHONE', [codeField, duplicateCodeField])

    expect(codeField.key).toBe('employee_code')
    expect(codeField.autoFill).toEqual({
      source: 'REQUESTER_EMPLOYEE_CODE',
      readOnly: true,
    })
    expect(duplicateCodeField.key).toBe('employee_code_2')
    expect(phoneField.key).toBe('requester_phone')
    expect(phoneField.autoFill).toEqual({
      source: 'REQUESTER_PHONE',
      readOnly: false,
    })
  })

  it('retains compatible autoFill when changing field type and strips incompatible autoFill or flags invalid draft combinations', () => {
    const codeField = createPresetField('EMPLOYEE_CODE', [])
    const asTextarea = normalizeFieldForType(codeField, 'TEXTAREA')
    expect(asTextarea.autoFill).toEqual({
      source: 'REQUESTER_EMPLOYEE_CODE',
      readOnly: true,
    })

    const asSelect = normalizeFieldForType(codeField, 'SELECT')
    expect(asSelect.autoFill).toBeUndefined()

    const invalidManualCombo = {
      ...asSelect,
      autoFill: { source: 'REQUESTER_EMPLOYEE_CODE' as const, readOnly: true },
    }
    const issues = validateFormBuilderDefinition('LEAVE_FORM', 'Đơn nghỉ phép', [invalidManualCombo])
    expect(issues.some((issue) => issue.path === 'fields.0.autoFill')).toBe(true)
  })

  it('inserts palette fields at exact drop slots and reorders canvas fields with no-op detection', () => {
    const f1 = { ...createField('TEXT', []), key: 'f1', label: 'Trường 1' }
    const f2 = { ...createField('TEXT', [f1]), key: 'f2', label: 'Trường 2' }
    const f3 = { ...createField('TEXT', [f1, f2]), key: 'f3', label: 'Trường 3' }

    const droppedNew = { ...createPresetField('FULL_NAME', [f1, f2, f3]) }
    const inserted = insertFieldAtIndex([f1, f2, f3], droppedNew, 1)
    expect(inserted.fields.map((item) => item.key)).toEqual(['f1', 'employee_full_name', 'f2', 'f3'])
    expect(inserted.fields.map((item) => item.order)).toEqual([10, 20, 30, 40])
    expect(inserted.selectedIndex).toBe(1)

    const noopSameSlot = moveFieldToSlot(inserted.fields, 1, 1)
    expect(noopSameSlot.changed).toBe(false)
    const noopAdjacentSlot = moveFieldToSlot(inserted.fields, 1, 2)
    expect(noopAdjacentSlot.changed).toBe(false)

    const movedToEnd = moveFieldToSlot(inserted.fields, 0, 4)
    expect(movedToEnd.changed).toBe(true)
    expect(movedToEnd.selectedIndex).toBe(3)
    expect(movedToEnd.fields.map((item) => item.key)).toEqual(['employee_full_name', 'f2', 'f3', 'f1'])
    expect(movedToEnd.fields.map((item) => item.order)).toEqual([10, 20, 30, 40])

    const movedToStart = moveFieldToSlot(movedToEnd.fields, 2, 0)
    expect(movedToStart.changed).toBe(true)
    expect(movedToStart.selectedIndex).toBe(0)
    expect(movedToStart.fields.map((item) => item.key)).toEqual(['f3', 'employee_full_name', 'f2', 'f1'])
  })

  it('splits a 1-column field into 2 columns when dropping on COL_LEFT or COL_RIGHT and un-splits back to 1 column on ROW_AFTER', () => {
    const codeField = createPresetField('EMPLOYEE_CODE', [])
    const nameField = createPresetField('FULL_NAME', [codeField])

    const splitRight = applyCanvasDrop(
      [codeField],
      { kind: 'FIELD', index: 0, placement: 'COL_RIGHT' },
      { kind: 'NEW_FIELD', field: nameField },
    )
    expect(splitRight.changed).toBe(true)
    expect(splitRight.selectedIndex).toBe(1)
    expect(splitRight.fields.map((f) => [f.key, readFieldColumnSpan(f)])).toEqual([
      ['employee_code', 6],
      ['employee_full_name', 6],
    ])
    expect(computeFieldRows(splitRight.fields)).toHaveLength(1)

    const swappedLeft = applyCanvasDrop(
      splitRight.fields,
      { kind: 'FIELD', index: 0, placement: 'COL_LEFT' },
      { kind: 'MOVE_FIELD', fromIndex: 1 },
    )
    expect(swappedLeft.changed).toBe(true)
    expect(swappedLeft.fields.map((f) => [f.key, readFieldColumnSpan(f)])).toEqual([
      ['employee_full_name', 6],
      ['employee_code', 6],
    ])

    const unsplitBelow = applyCanvasDrop(
      swappedLeft.fields,
      { kind: 'FIELD', index: 0, placement: 'ROW_AFTER' },
      { kind: 'MOVE_FIELD', fromIndex: 1 },
    )
    expect(unsplitBelow.changed).toBe(true)
    expect(unsplitBelow.fields.map((f) => [f.key, readFieldColumnSpan(f)])).toEqual([
      ['employee_full_name', 12],
      ['employee_code', 12],
    ])
    expect(computeFieldRows(unsplitBelow.fields)).toHaveLength(2)
  })

  it('rebalances 3-column rows and deleted 2-column partners while blocking TABLE side-splits', () => {
    const f1 = { ...createField('TEXT', []), key: 'f1', label: 'Cột 1' }
    const f2 = { ...createField('TEXT', [f1]), key: 'f2', label: 'Cột 2' }
    const f3 = { ...createField('TEXT', [f1, f2]), key: 'f3', label: 'Cột 3' }
    const table = createField('TABLE', [f1, f2, f3])

    const twoCols = applyCanvasDrop(
      [f1],
      { kind: 'FIELD', index: 0, placement: 'COL_LEFT' },
      { kind: 'NEW_FIELD', field: f2 },
    ).fields
    expect(twoCols.map((f) => [f.key, readFieldColumnSpan(f)])).toEqual([
      ['f2', 6],
      ['f1', 6],
    ])

    const threeCols = applyCanvasDrop(
      twoCols,
      { kind: 'FIELD', index: 1, placement: 'COL_RIGHT' },
      { kind: 'NEW_FIELD', field: f3 },
    ).fields
    expect(threeCols.map((f) => [f.key, readFieldColumnSpan(f)])).toEqual([
      ['f2', 4],
      ['f1', 4],
      ['f3', 4],
    ])

    expect(canDropAtCanvasPlacement(threeCols, 0, 'COL_LEFT', 'TABLE')).toBe(false)
    const fallbackTableDrop = applyCanvasDrop(
      threeCols,
      { kind: 'FIELD', index: 2, placement: 'COL_RIGHT' },
      { kind: 'NEW_FIELD', field: table },
    ).fields
    expect(readFieldColumnSpan(fallbackTableDrop[3])).toBe(12)
    expect(computeFieldRows(fallbackTableDrop)).toHaveLength(2)

    const afterDeleteThird = removeFieldAndRebalanceRows(threeCols, 2)
    expect(afterDeleteThird.map((f) => [f.key, readFieldColumnSpan(f)])).toEqual([
      ['f2', 6],
      ['f1', 6],
    ])

    const afterDeleteSecond = removeFieldAndRebalanceRows(afterDeleteThird, 1)
    expect(afterDeleteSecond.map((f) => [f.key, readFieldColumnSpan(f)])).toEqual([
      ['f2', 12],
    ])
  })

  it('provides optional standard form categories and formats category codes to Vietnamese labels', () => {
    expect(formCategorySelectOptions[0]).toEqual({ value: '', label: 'Chưa phân nhóm' })
    expect(formCategorySelectOptions.map((item) => item.value)).toEqual([
      '',
      'HR',
      'ADMIN',
      'FINANCE',
      'PROCUREMENT',
      'IT',
      'OTHER',
    ])
    expect(formatFormCategory('HR')).toBe('Nhân sự')
    expect(formatFormCategory('FINANCE')).toBe('Tài chính')
    expect(formatFormCategory(undefined)).toBeUndefined()
  })
})
