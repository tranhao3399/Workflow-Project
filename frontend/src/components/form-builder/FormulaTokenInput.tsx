import { Fragment, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { Trash2, X } from 'lucide-react'
import type { FormField, FormTableColumn } from '../../types/workflow'
import {
  buildFormulaFromEditorSlots,
  parseFormulaToEditorSlots,
  type FormulaEditorTag,
} from '../../utils/form-calculation'

export interface FormulaVariableOption {
  id: string
  label: string
  token: string
  kind: 'FIELD' | 'SUM'
  tableLabel?: string
  columnLabel?: string
}

interface FormulaEditorPanelProps {
  label: string
  value: string
  error?: string
  disabled: boolean
  compact?: boolean
  placeholder: string
  emptyHint: string
  variables: readonly FormulaVariableOption[]
  allFields: readonly FormField[]
  currentTableField?: FormField
  onChange: (nextFormula: string) => void
}

const FORMULA_OPERATORS = ['+', '-', '*', '/', '(', ')'] as const

export function FormulaEditorPanel({
  label,
  value,
  error,
  disabled,
  compact = false,
  placeholder,
  emptyHint,
  variables,
  allFields,
  currentTableField,
  onChange,
}: FormulaEditorPanelProps) {
  const slots = useMemo(() => parseFormulaToEditorSlots(value), [value])
  const slotRefs = useRef<Array<HTMLInputElement | null>>([])
  const activeSelectionRef = useRef<{ slotIndex: number; caretPos: number }>({
    slotIndex: slots.textSlots.length - 1,
    caretPos: (slots.textSlots.at(-1) ?? '').length,
  })
  const pendingFocusRef = useRef<{ slotIndex: number; caretPos: number } | null>(null)

  const fieldsByKey = useMemo(
    () => new Map(allFields.map((item) => [item.key, item])),
    [allFields],
  )
  const tableColsByKey = useMemo(() => {
    const map = new Map<string, FormTableColumn>()
    for (const col of currentTableField?.tableConfig?.columns ?? []) {
      map.set(col.key, col)
    }
    return map
  }, [currentTableField])

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending) return
    pendingFocusRef.current = null
    const target = slotRefs.current[pending.slotIndex]
    if (!target) return
    target.focus()
    const pos = Math.min(pending.caretPos, target.value.length)
    target.setSelectionRange(pos, pos)
    activeSelectionRef.current = { slotIndex: pending.slotIndex, caretPos: pos }
  })

  function resolveTagMeta(tag: FormulaEditorTag): {
    text: string
    tooltip: string
    isMissing: boolean
  } {
    if (tag.kind === 'SUM' && tag.tableKey && tag.columnKey) {
      const table = fieldsByKey.get(tag.tableKey)
      const col = table?.tableConfig?.columns.find((item) => item.key === tag.columnKey)
      if (!table || !col) {
        return {
          text: `SUM(${tag.tableKey}.${tag.columnKey})`,
          tooltip: `Tham chiếu không tồn tại: ${tag.raw}`,
          isMissing: true,
        }
      }
      return {
        text: `SUM(${table.label || tag.tableKey} · ${col.label || tag.columnKey})`,
        tooltip: tag.raw,
        isMissing: false,
      }
    }

    const key = tag.fieldKey ?? ''
    if (currentTableField) {
      const siblingCol = tableColsByKey.get(key)
      if (siblingCol) {
        return {
          text: siblingCol.label || key,
          tooltip: `Mã cột: [${key}]`,
          isMissing: false,
        }
      }
    }
    const targetField = fieldsByKey.get(key)
    if (!targetField) {
      return {
        text: `[${key}]`,
        tooltip: `Trường không tồn tại: [${key}]`,
        isMissing: true,
      }
    }
    return {
      text: targetField.label || key,
      tooltip: `Mã trường: [${key}]`,
      isMissing: false,
    }
  }

  function recordSelection(slotIndex: number, input: HTMLInputElement) {
    activeSelectionRef.current = {
      slotIndex,
      caretPos: input.selectionStart ?? input.value.length,
    }
  }

  function handleSlotChange(slotIndex: number, nextText: string, caretPos: number) {
    const nextTextSlots = [...slots.textSlots]
    nextTextSlots[slotIndex] = nextText
    const nextValue = buildFormulaFromEditorSlots(nextTextSlots, slots.tags)
    const parsedAfter = parseFormulaToEditorSlots(nextValue)
    if (parsedAfter.tags.length > slots.tags.length) {
      // User typed/pasted a complete [key] token inside a text slot -> move caret right after new chip
      pendingFocusRef.current = {
        slotIndex: Math.min(slotIndex + 1, parsedAfter.textSlots.length - 1),
        caretPos: 0,
      }
    } else {
      activeSelectionRef.current = { slotIndex, caretPos }
    }
    onChange(nextValue)
  }

  function removeTagAt(tagIndex: number) {
    if (disabled || tagIndex < 0 || tagIndex >= slots.tags.length) return
    const left = slots.textSlots[tagIndex] ?? ''
    const right = slots.textSlots[tagIndex + 1] ?? ''
    let merged = `${left}${right}`
    let caretPos = left.length
    if (left.endsWith(' ') && right.startsWith(' ')) {
      merged = `${left}${right.slice(1)}`
      caretPos = left.length
    }
    const nextTextSlots = [
      ...slots.textSlots.slice(0, tagIndex),
      merged,
      ...slots.textSlots.slice(tagIndex + 2),
    ]
    const nextTags = slots.tags.filter((_, idx) => idx !== tagIndex)
    pendingFocusRef.current = { slotIndex: tagIndex, caretPos }
    onChange(buildFormulaFromEditorSlots(nextTextSlots, nextTags))
  }

  function handleSlotKeyDown(slotIndex: number, event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? 0

    if (event.key === 'Backspace' && start === 0 && end === 0 && slotIndex > 0) {
      event.preventDefault()
      removeTagAt(slotIndex - 1)
      return
    }

    if (
      event.key === 'Delete' &&
      start === input.value.length &&
      end === input.value.length &&
      slotIndex < slots.tags.length
    ) {
      event.preventDefault()
      removeTagAt(slotIndex)
      return
    }

    if (event.key === 'ArrowLeft' && start === 0 && end === 0 && slotIndex > 0) {
      event.preventDefault()
      const prev = slotRefs.current[slotIndex - 1]
      if (prev) {
        prev.focus()
        const pos = prev.value.length
        prev.setSelectionRange(pos, pos)
        activeSelectionRef.current = { slotIndex: slotIndex - 1, caretPos: pos }
      }
      return
    }

    if (
      event.key === 'ArrowRight' &&
      start === input.value.length &&
      end === input.value.length &&
      slotIndex < slots.tags.length
    ) {
      event.preventDefault()
      const next = slotRefs.current[slotIndex + 1]
      if (next) {
        next.focus()
        next.setSelectionRange(0, 0)
        activeSelectionRef.current = { slotIndex: slotIndex + 1, caretPos: 0 }
      }
    }
  }

  function resolveInsertionPoint() {
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    const isEditorFocused = slotRefs.current.some((el) => el !== null && el === activeEl)
    const maxSlot = slots.textSlots.length - 1
    if (!isEditorFocused) {
      const lastVal = slots.textSlots[maxSlot] ?? ''
      return { slotIndex: maxSlot, slotValue: lastVal, caretPos: lastVal.length }
    }
    const rawSlot = activeSelectionRef.current.slotIndex
    const slotIndex = rawSlot >= 0 && rawSlot <= maxSlot ? rawSlot : maxSlot
    const slotValue = slots.textSlots[slotIndex] ?? ''
    const rawCaret = activeSelectionRef.current.caretPos
    const caretPos = Math.max(0, Math.min(rawCaret, slotValue.length))
    return { slotIndex, slotValue, caretPos }
  }

  function insertVariableToken(token: string) {
    if (disabled) return
    const { slotIndex, slotValue, caretPos } = resolveInsertionPoint()
    const before = slotValue.slice(0, caretPos)
    const after = slotValue.slice(caretPos)
    const needsLeftSpace = before.length > 0 && /[A-Za-z0-9_.]$/.test(before)
    const needsRightSpace = after.length > 0 && /^[A-Za-z0-9_.]/.test(after)
    const leftText = `${before}${needsLeftSpace ? ' ' : ''}`
    const rightText = `${needsRightSpace ? ' ' : ''}${after}`

    const parsedTag = parseFormulaToEditorSlots(token).tags[0]
    if (!parsedTag) return

    const nextTextSlots = [
      ...slots.textSlots.slice(0, slotIndex),
      leftText,
      rightText,
      ...slots.textSlots.slice(slotIndex + 1),
    ]
    const nextTags = [
      ...slots.tags.slice(0, slotIndex),
      parsedTag,
      ...slots.tags.slice(slotIndex),
    ]
    pendingFocusRef.current = {
      slotIndex: slotIndex + 1,
      caretPos: needsRightSpace ? 1 : 0,
    }
    onChange(buildFormulaFromEditorSlots(nextTextSlots, nextTags))
  }

  function insertOperator(op: string) {
    if (disabled) return
    const { slotIndex, slotValue, caretPos } = resolveInsertionPoint()
    const before = slotValue.slice(0, caretPos)
    const after = slotValue.slice(caretPos)

    const nextSlot = `${before}${op}${after}`
    const nextTextSlots = [...slots.textSlots]
    nextTextSlots[slotIndex] = nextSlot
    pendingFocusRef.current = {
      slotIndex,
      caretPos: before.length + op.length,
    }
    onChange(buildFormulaFromEditorSlots(nextTextSlots, slots.tags))
  }

  function handleClear(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    pendingFocusRef.current = { slotIndex: 0, caretPos: 0 }
    onChange('')
  }

  function handleContainerMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (disabled) return
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.closest('button')) return
    event.preventDefault()
    const lastIdx = slots.textSlots.length - 1
    const lastInput = slotRefs.current[lastIdx]
    if (lastInput) {
      lastInput.focus()
      const endPos = lastInput.value.length
      lastInput.setSelectionRange(endPos, endPos)
      activeSelectionRef.current = { slotIndex: lastIdx, caretPos: endPos }
    }
  }

  const isEmpty = slots.tags.length === 0 && (slots.textSlots[0] ?? '') === ''

  return (
    <div className={`form-builder-formula-editor${compact ? ' is-compact' : ''}`}>
      <div className={`form-builder-property-field${error ? ' has-error' : ''}`}>
        <div className="form-builder-formula-label-row">
          <span className="required-field-label">{label}</span>
          {Boolean(value) && !disabled && (
            <button
              type="button"
              className="form-builder-formula-clear-btn"
              title="Xóa trắng công thức"
              aria-label="Xóa trắng công thức"
              onClick={handleClear}
            >
              <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
        <div
          className={`form-builder-formula-chip-input${error ? ' has-error' : ''}${
            disabled ? ' is-disabled' : ''
          }`}
          role="group"
          aria-label={label}
          aria-invalid={Boolean(error)}
          onMouseDown={handleContainerMouseDown}
        >
          <div className="form-builder-formula-chip-track">
            {slots.textSlots.map((slotText, slotIndex) => {
              const isTrailingSlot = slotIndex === slots.textSlots.length - 1
              const showPlaceholder = isEmpty && slotIndex === 0
              const isCollapsedSlot =
                slotText === '' && !isTrailingSlot && !showPlaceholder
              const sizerText = slotText || (showPlaceholder ? placeholder : '')
              const tagAfter = slots.tags[slotIndex]
              const tagMeta = tagAfter ? resolveTagMeta(tagAfter) : null

              return (
                <Fragment key={`slot-${slotIndex}`}>
                  <span
                    className={`form-builder-formula-text-sizer${
                      isTrailingSlot ? ' is-trailing' : ''
                    }${showPlaceholder ? ' is-empty-placeholder' : ''}${
                      isCollapsedSlot ? ' is-collapsed-slot' : ''
                    }`}
                    data-value={sizerText}
                  >
                    <input
                      ref={(el) => {
                        slotRefs.current[slotIndex] = el
                      }}
                      type="text"
                      size={1}
                      className="form-builder-formula-slot-input"
                      value={slotText}
                      disabled={disabled}
                      placeholder={showPlaceholder ? placeholder : undefined}
                      aria-label={
                        slotIndex === 0
                          ? label
                          : `${label} - đoạn phép toán ${slotIndex + 1}`
                      }
                      aria-invalid={Boolean(error)}
                      onFocus={(event) => recordSelection(slotIndex, event.currentTarget)}
                      onClick={(event) => recordSelection(slotIndex, event.currentTarget)}
                      onKeyUp={(event) => recordSelection(slotIndex, event.currentTarget)}
                      onSelect={(event) => recordSelection(slotIndex, event.currentTarget)}
                      onKeyDown={(event) => handleSlotKeyDown(slotIndex, event)}
                      onChange={(event) =>
                        handleSlotChange(
                          slotIndex,
                          event.target.value,
                          event.target.selectionStart ?? event.target.value.length,
                        )
                      }
                    />
                  </span>
                  {tagAfter && tagMeta && (
                    <span
                      className={`form-builder-formula-input-tag${
                        tagAfter.kind === 'SUM' ? ' is-sum' : ''
                      }${tagMeta.isMissing ? ' is-missing' : ''}`}
                      title={tagMeta.tooltip}
                    >
                      <span className="form-builder-formula-input-tag-text">
                        {tagMeta.text}
                      </span>
                      {!disabled && (
                        <button
                          type="button"
                          className="form-builder-formula-input-tag-remove"
                          title={`Xóa ${tagMeta.text}`}
                          aria-label={`Xóa biến ${tagMeta.text}`}
                          onClick={() => removeTagAt(slotIndex)}
                        >
                          <X size={11} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  )}
                </Fragment>
              )
            })}
          </div>
        </div>
        {error && (
          <small className="field-error" role="alert">
            {error}
          </small>
        )}
      </div>

      <div className="form-builder-formula-Operator-bar" aria-label="Toán tử phép tính">
        {FORMULA_OPERATORS.map((op) => (
          <button
            key={op}
            type="button"
            className="form-builder-formula-op-chip"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertOperator(op)}
          >
            {op}
          </button>
        ))}
      </div>

      {variables.length > 0 ? (
        <div className="form-builder-formula-tokens">
          <small className="form-builder-field-hint">
            Chèn nhanh biến:
          </small>
          <div className="form-builder-formula-chip-list">
            {variables.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`form-builder-formula-var-chip${
                  item.kind === 'SUM' ? ' is-sum' : ''
                }`}
                disabled={disabled}
                title={`Chèn biến ${item.label} (${item.token})`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertVariableToken(item.token)}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <small className="form-builder-field-hint">{emptyHint}</small>
      )}
    </div>
  )
}
