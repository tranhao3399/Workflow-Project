import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock } from 'lucide-react'

interface DateTimePickerProps {
  value?: string
  onChange: (value?: string) => void
  ariaLabel: string
  ariaDescribedBy?: string
  ariaInvalid?: boolean
  placeholder?: string
  disabled?: boolean
  onBlur?: () => void
}

interface DateTimeParts {
  date?: string
  time: string
}

interface PopupPosition {
  top: number
  left: number
  width: number
}

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const months = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']

export function DateTimePicker({
  value,
  onChange,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid = false,
  placeholder = 'Chọn ngày và giờ',
  disabled = false,
  onBlur,
}: DateTimePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const selectedParts = dateTimeParts(value)
  const selectedDate = dateFromValue(selectedParts.date)
  const [today] = useState(() => new Date())
  const [displayValue, setDisplayValue] = useState(() => formatDateTimeValue(value))
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? today)
  const [draftDate, setDraftDate] = useState<string | undefined>(selectedParts.date)
  const [draftTime, setDraftTime] = useState(selectedParts.time || '00:00')
  const [yearDraft, setYearDraft] = useState(String((selectedDate ?? today).getFullYear()))
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState('')
  const [position, setPosition] = useState<PopupPosition | null>(null)

  useEffect(() => {
    const nextParts = dateTimeParts(value)
    const nextDate = dateFromValue(nextParts.date)
    // Keep the controlled display synchronized after saved data or auto-fill changes.
    // oxlint-disable-next-line react/set-state-in-effect
    setDisplayValue(formatDateTimeValue(value))
    setError('')
    if (!isOpen) {
      setDraftDate(nextParts.date)
      setDraftTime(nextParts.time || '00:00')
      if (nextDate) {
        setVisibleMonth(nextDate)
        setYearDraft(String(nextDate.getFullYear()))
      }
    }
  }, [isOpen, value])

  useEffect(() => {
    if (!isOpen) return
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 24)
      const estimatedHeight = 440
      const hasRoomBelow = window.innerHeight - rect.bottom >= estimatedHeight + 12
      const top = hasRoomBelow ? rect.bottom + 6 : Math.max(12, rect.top - estimatedHeight - 6)
      const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12))
      setPosition({ top, left, width })
    }
    const closeWithoutSaving = () => {
      setIsOpen(false)
      setDisplayValue(formatDateTimeValue(value))
      setError('')
      onBlur?.()
    }
    const outside = (event: MouseEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popupRef.current?.contains(target)) closeWithoutSaving()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWithoutSaving()
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [isOpen, onBlur, value])

  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth])
  const draftSelectedDate = dateFromValue(draftDate)
  const normalizedDraftTime = normalizeTimeInput(draftTime)
  const [draftHour = '', draftMinute = ''] = draftTime.split(':')

  const updateTimePart = (part: 'hour' | 'minute', value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 2)
    setDraftTime(part === 'hour' ? `${sanitized}:${draftMinute}` : `${draftHour}:${sanitized}`)
  }

  const normalizeTimePart = (part: 'hour' | 'minute') => {
    const raw = part === 'hour' ? draftHour : draftMinute
    if (!raw) return
    const numeric = Number(raw)
    const maximum = part === 'hour' ? 23 : 59
    if (!Number.isInteger(numeric) || numeric > maximum) return
    updateTimePart(part, String(numeric).padStart(2, '0'))
  }

  const open = () => {
    if (disabled) return
    const nextParts = dateTimeParts(value)
    const nextDate = dateFromValue(nextParts.date)
    setDraftDate(nextParts.date)
    setDraftTime(nextParts.time || '00:00')
    setVisibleMonth(nextDate ?? today)
    setYearDraft(String((nextDate ?? today).getFullYear()))
    setShowMonthPicker(false)
    setError('')
    setIsOpen(true)
  }

  const close = () => {
    setIsOpen(false)
    setDisplayValue(formatDateTimeValue(value))
    setError('')
    onBlur?.()
  }

  const commitTyped = (raw: string) => {
    if (!raw.trim()) {
      setError('')
      onChange(undefined)
      onBlur?.()
      return
    }
    const next = parseDisplayDateTime(raw)
    if (!next) {
      setError('Vui lòng nhập ngày và giờ theo định dạng DD/MM/YYYY HH:mm.')
      return
    }
    setError('')
    setDisplayValue(formatDateTimeValue(next))
    onChange(next)
    onBlur?.()
  }

  const apply = () => {
    if (!draftDate || !normalizedDraftTime) return
    const next = `${draftDate}T${normalizedDraftTime}`
    setDisplayValue(formatDateTimeValue(next))
    setError('')
    onChange(next)
    setIsOpen(false)
    onBlur?.()
  }

  const clear = () => {
    setDisplayValue('')
    setError('')
    onChange(undefined)
    setIsOpen(false)
    onBlur?.()
  }

  const popup = isOpen && position ? createPortal(
    <div
      className="date-picker-popover date-time-picker-popover"
      ref={popupRef}
      role="dialog"
      aria-label={`Chọn ${ariaLabel}`}
      style={{ top: position.top, left: position.left, width: position.width }}
    >
      <div className="date-picker-header">
        <button className="date-picker-nav" type="button" aria-label="Tháng trước" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button>
        <button className="date-picker-title" type="button" onClick={() => setShowMonthPicker((current) => !current)}>{months[visibleMonth.getMonth()]} năm {visibleMonth.getFullYear()}</button>
        <button className="date-picker-nav" type="button" aria-label="Tháng sau" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button>
      </div>
      {showMonthPicker ? (
        <div className="date-picker-month-panel">
          <div className="date-picker-year-controls">
            <button type="button" aria-label="Năm trước" onClick={() => { const year = visibleMonth.getFullYear() - 1; setVisibleMonth((current) => new Date(year, current.getMonth(), 1)); setYearDraft(String(year)) }}>−</button>
            <input className="date-picker-year-input" value={yearDraft} inputMode="numeric" maxLength={4} aria-label="Năm" onChange={(event) => setYearDraft(event.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={() => { const year = Number(yearDraft); if (year >= 1900 && year <= 9999) setVisibleMonth((current) => new Date(year, current.getMonth(), 1)); else setYearDraft(String(visibleMonth.getFullYear())) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} />
            <button type="button" aria-label="Năm sau" onClick={() => { const year = visibleMonth.getFullYear() + 1; setVisibleMonth((current) => new Date(year, current.getMonth(), 1)); setYearDraft(String(year)) }}>+</button>
          </div>
          <div className="date-picker-month-grid">{months.map((month, index) => <button className={index === visibleMonth.getMonth() ? 'is-current' : ''} type="button" key={month} onClick={() => { setVisibleMonth((current) => new Date(current.getFullYear(), index, 1)); setShowMonthPicker(false) }}>{month}</button>)}</div>
        </div>
      ) : (
        <>
          <div className="date-picker-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="date-picker-days">{days.map((date) => {
            const selected = Boolean(draftSelectedDate && sameDate(date, draftSelectedDate))
            const current = date.getMonth() === visibleMonth.getMonth()
            return <button className={['date-picker-day', !current ? 'is-outside-month' : '', selected ? 'is-selected' : '', sameDate(date, today) ? 'is-today' : ''].filter(Boolean).join(' ')} type="button" key={toDateOnly(date)} onClick={() => { setDraftDate(toDateOnly(date)); setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1)); setShowMonthPicker(false) }}>{date.getDate()}</button>
          })}</div>
        </>
      )}
      <div className="date-time-picker-popover-time">
        <span>Thời gian</span>
        <div className="date-time-picker-time-controls">
          <input
            className={draftHour && Number(draftHour) <= 23 ? undefined : 'has-error'}
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={draftHour}
            placeholder="HH"
            aria-label={`${ariaLabel} - giờ`}
            aria-invalid={!draftHour || Number(draftHour) > 23}
            onChange={(event) => updateTimePart('hour', event.target.value)}
            onBlur={() => normalizeTimePart('hour')}
          />
          <b aria-hidden="true">:</b>
          <input
            className={draftMinute.length === 2 && Number(draftMinute) <= 59 ? undefined : 'has-error'}
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={draftMinute}
            placeholder="mm"
            aria-label={`${ariaLabel} - phút`}
            aria-invalid={draftMinute.length !== 2 || Number(draftMinute) > 59}
            onChange={(event) => updateTimePart('minute', event.target.value)}
            onBlur={() => normalizeTimePart('minute')}
          />
        </div>
      </div>
      <div className="date-picker-footer date-time-picker-footer">
        <button type="button" onClick={clear}>Xóa</button>
        <button type="button" onClick={() => { const todayValue = toDateOnly(today); setDraftDate(todayValue); setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setShowMonthPicker(false) }}>Hôm nay</button>
        <button className="date-time-picker-apply" type="button" disabled={!draftDate || !normalizedDraftTime} onClick={apply}>Áp dụng</button>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div className="date-picker-field">
      <div
        className={['date-time-picker', disabled ? 'is-disabled' : '', ariaInvalid || error ? 'has-error' : ''].filter(Boolean).join(' ')}
        ref={rootRef}
      >
        <input
          className="date-time-picker-text"
          value={displayValue}
          inputMode="numeric"
          maxLength={16}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || Boolean(error)}
          disabled={disabled}
          onChange={(event) => {
            setDisplayValue(event.target.value.replace(/[^0-9/: ]/g, '').slice(0, 16))
            if (error) setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitTyped(displayValue)
            }
          }}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget as Node | null
            if (nextTarget && (rootRef.current?.contains(nextTarget) || popupRef.current?.contains(nextTarget))) return
            commitTyped(event.currentTarget.value)
          }}
        />
        <button className="date-time-picker-trigger" type="button" aria-label={`Mở lịch ${ariaLabel}`} aria-expanded={isOpen} disabled={disabled} onClick={() => isOpen ? close() : open()}>
          <CalendarClock size={16} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>
      {error && <p className="date-picker-error" role="alert">{error}</p>}
      {popup}
    </div>
  )
}

function dateTimeParts(value?: string): DateTimeParts {
  const match = value ? /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value) : null
  return match ? { date: match[1], time: `${match[2]}:${match[3]}` } : { time: '' }
}

function dateFromValue(value?: string): Date | undefined {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  if (!match) return undefined
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date : undefined
}

function toDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDateTimeValue(value?: string): string {
  const parts = dateTimeParts(value)
  const date = dateFromValue(parts.date)
  return date ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${parts.time}` : ''
}

function parseDisplayDateTime(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const [, day, month, year, hour, minute] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return undefined
  if (Number(hour) > 23 || Number(minute) > 59) return undefined
  return `${year}-${month}-${day}T${hour}:${minute}`
}

function normalizeTimeInput(value: string): string | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return undefined
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
}
