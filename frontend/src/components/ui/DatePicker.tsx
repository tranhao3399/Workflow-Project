import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface DatePickerProps {
  value?: string
  onChange: (value?: string) => void
  ariaLabel: string
  placeholder?: string
  minDate?: string
  maxDate?: string
  showToday?: boolean
  clearable?: boolean
}

interface PopupPosition { top: number; left: number; width: number }

const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const months = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']

function dateFromValue(value?: string): Date | undefined {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
  if (!match) return undefined
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date : undefined
}

function toDateOnly(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function formatDate(value?: string): string { const date = dateFromValue(value); return date ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}` : '' }
function parseDate(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return undefined
  const [, day, month, year] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? toDateOnly(date) : undefined
}
function sameDate(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
}

export function DatePicker({ value, onChange, ariaLabel, placeholder = 'dd/MM/yyyy', minDate, maxDate, showToday: showTodayProp = true, clearable = true }: DatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const selectedDate = dateFromValue(value)
  const [today] = useState(() => new Date())
  const [displayValue, setDisplayValue] = useState(() => formatDate(value))
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? today)
  const [isOpen, setIsOpen] = useState(false)
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [yearDraft, setYearDraft] = useState(String((selectedDate ?? today).getFullYear()))
  const [error, setError] = useState('')
  const [position, setPosition] = useState<PopupPosition | null>(null)
  const earliest = dateFromValue(minDate)
  const latest = dateFromValue(maxDate) ?? (ariaLabel.toLowerCase().includes('sinh') ? today : undefined)
  const showToday = showTodayProp && !ariaLabel.toLowerCase().includes('sinh')

  useEffect(() => {
    const nextSelectedDate = dateFromValue(value)
    // This controlled field mirrors its external value while preserving typed drafts.
    // oxlint-disable-next-line react/set-state-in-effect
    setDisplayValue(formatDate(value))
    setError('')
    if (nextSelectedDate) {
      setVisibleMonth(nextSelectedDate)
      setYearDraft(String(nextSelectedDate.getFullYear()))
    }
  }, [value])
  useEffect(() => {
    if (!isOpen) return
    const updatePosition = () => { const rect = rootRef.current?.getBoundingClientRect(); if (!rect) return; const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 24); const estimatedHeight = 300; const hasRoomBelow = window.innerHeight - rect.bottom >= estimatedHeight + 12; const top = hasRoomBelow ? rect.bottom + 6 : Math.max(12, rect.top - estimatedHeight - 6); const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12)); setPosition({ top, left, width }) }
    const outside = (event: MouseEvent) => { const target = event.target as Node; if (!rootRef.current?.contains(target) && !popupRef.current?.contains(target)) setIsOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false) }
    updatePosition(); window.addEventListener('resize', updatePosition); window.addEventListener('scroll', updatePosition, true); document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [isOpen])
  const unavailable = (date: Date) => { const time = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); return Boolean((earliest && time < earliest.getTime()) || (latest && time > latest.getTime())) }
  const commitTyped = (raw: string) => { if (!raw.trim()) { setError(''); onChange(undefined); return }; const next = parseDate(raw); const date = dateFromValue(next); if (!date || unavailable(date)) { setError(latest && date && date > latest ? 'Không thể chọn ngày trong tương lai.' : 'Vui lòng nhập ngày theo định dạng dd/MM/yyyy.'); return }; setError(''); setDisplayValue(formatDate(next)); onChange(next) }
  const selectDate = (date: Date) => { if (unavailable(date)) return; const next = toDateOnly(date); setDisplayValue(formatDate(next)); setError(''); onChange(next); setIsOpen(false); setShowMonthPicker(false) }
  const open = () => { setVisibleMonth(selectedDate ?? today); setYearDraft(String((selectedDate ?? today).getFullYear())); setShowMonthPicker(false); setIsOpen(true) }
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth])
  const popup = isOpen && position ? createPortal(<div className="date-picker-popover" ref={popupRef} role="dialog" aria-label={`Chọn ${ariaLabel}`} style={{ top: position.top, left: position.left, width: position.width }}>
    <div className="date-picker-header"><button className="date-picker-nav" type="button" aria-label="Tháng trước" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>‹</button><button className="date-picker-title" type="button" onClick={() => setShowMonthPicker((current) => !current)}>{months[visibleMonth.getMonth()]} năm {visibleMonth.getFullYear()}</button><button className="date-picker-nav" type="button" aria-label="Tháng sau" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>›</button></div>
    {showMonthPicker ? <div className="date-picker-month-panel"><div className="date-picker-year-controls"><button type="button" aria-label="Năm trước" onClick={() => { const year = visibleMonth.getFullYear() - 1; setVisibleMonth((current) => new Date(year, current.getMonth(), 1)); setYearDraft(String(year)) }}>−</button><input className="date-picker-year-input" value={yearDraft} inputMode="numeric" maxLength={4} aria-label="Năm" onChange={(event) => setYearDraft(event.target.value.replace(/\D/g, '').slice(0, 4))} onBlur={() => { const year = Number(yearDraft); if (year >= 1900 && year <= 9999) setVisibleMonth((current) => new Date(year, current.getMonth(), 1)); else setYearDraft(String(visibleMonth.getFullYear())) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} /><button type="button" aria-label="Năm sau" onClick={() => { const year = visibleMonth.getFullYear() + 1; setVisibleMonth((current) => new Date(year, current.getMonth(), 1)); setYearDraft(String(year)) }}>+</button></div><div className="date-picker-month-grid">{months.map((month, index) => <button className={index === visibleMonth.getMonth() ? 'is-current' : ''} type="button" key={month} onClick={() => { setVisibleMonth((current) => new Date(current.getFullYear(), index, 1)); setShowMonthPicker(false) }}>{month}</button>)}</div></div> : <><div className="date-picker-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div><div className="date-picker-days">{days.map((date) => { const selected = Boolean(selectedDate && sameDate(date, selectedDate)); const current = date.getMonth() === visibleMonth.getMonth(); return <button className={['date-picker-day', !current ? 'is-outside-month' : '', selected ? 'is-selected' : '', sameDate(date, today) ? 'is-today' : ''].filter(Boolean).join(' ')} type="button" key={toDateOnly(date)} disabled={unavailable(date)} onClick={() => selectDate(date)}>{date.getDate()}</button> })}</div></>}
    <div className="date-picker-footer">{clearable && <button type="button" onClick={() => { setDisplayValue(''); setError(''); onChange(undefined); setIsOpen(false) }}>Xóa ngày</button>}{showToday && <button type="button" disabled={unavailable(today)} onClick={() => selectDate(today)}>Hôm nay</button>}</div>
  </div>, document.body) : null
  return <div className="date-picker-field"><div className="date-picker" ref={rootRef}><input className="date-picker-text" value={displayValue} inputMode="numeric" maxLength={10} placeholder={placeholder} aria-label={ariaLabel} aria-invalid={Boolean(error)} onChange={(event) => { setDisplayValue(event.target.value.replace(/[^0-9/]/g, '')); if (error) setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitTyped(displayValue) } }} onBlur={(event) => commitTyped(event.target.value)} /><button className="date-picker-trigger" type="button" aria-label={`Mở lịch ${ariaLabel}`} aria-expanded={isOpen} onClick={() => isOpen ? setIsOpen(false) : open()}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v2M12 2.5v2M2.75 6h10.5M3.5 3.5h9a.75.75 0 0 1 .75.75v8.25a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75V4.25a.75.75 0 0 1 .75-.75Z" /></svg></button></div>{error && <p className="date-picker-error" role="alert">{error}</p>}{popup}</div>
}
