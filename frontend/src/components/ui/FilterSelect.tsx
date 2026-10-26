import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export interface FilterSelectOption {
  value: string
  label: string
}

interface FilterSelectProps {
  value: string
  options: readonly FilterSelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
  disabled?: boolean
  isOpen?: boolean
  onOpenChange?: (isOpen: boolean) => void
  className?: string
  menuPlacement?: 'auto' | 'bottom' | 'top'
}

export function FilterSelect({ value, options, onChange, ariaLabel, disabled = false, isOpen: controlledIsOpen, onOpenChange, className, menuPlacement = 'bottom' }: FilterSelectProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const [opensUpward, setOpensUpward] = useState(menuPlacement === 'top')
  const rootRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const selectedOption = options.find((option) => option.value === value) ?? options[0]
  const visibleOptions = options.filter((option) => option.value !== '' || !value || option.label !== selectedOption?.label)
  const selectedIndex = Math.max(0, visibleOptions.findIndex((option) => option.value === value))
  const isOpen = controlledIsOpen ?? internalIsOpen

  const setIsOpen = useCallback((isNextOpen: boolean) => {
    if (controlledIsOpen === undefined) setInternalIsOpen(isNextOpen)
    onOpenChange?.(isNextOpen)
  }, [controlledIsOpen, onOpenChange])

  const updateMenuDirection = useCallback(() => {
    if (menuPlacement !== 'auto') {
      setOpensUpward(menuPlacement === 'top')
      return
    }

    const root = rootRef.current
    if (!root) return

    const rect = root.getBoundingClientRect()
    const menuHeight = Math.min(visibleOptions.length * 38 + 10, 240)
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    setOpensUpward(spaceBelow < menuHeight + 4 && spaceAbove > spaceBelow)
  }, [menuPlacement, visibleOptions.length])

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updateMenuDirection)
    window.addEventListener('scroll', updateMenuDirection, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updateMenuDirection)
      window.removeEventListener('scroll', updateMenuDirection, true)
    }
  }, [isOpen, setIsOpen, updateMenuDirection])

  function focusOption(index: number) {
    const nextIndex = (index + visibleOptions.length) % visibleOptions.length
    optionRefs.current[nextIndex]?.focus()
  }

  function openMenu() {
    if (disabled) return
    updateMenuDirection()
    setIsOpen(true)
    window.requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus())
  }

  function selectOption(option: FilterSelectOption) {
    onChange(option.value)
    setIsOpen(false)
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu()
      window.requestAnimationFrame(() => focusOption(event.key === 'ArrowDown' ? selectedIndex + 1 : selectedIndex - 1))
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption(index + 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption(index - 1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      focusOption(options.length - 1)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  return (
    <div className={["filter-select", isOpen ? 'is-open' : '', opensUpward ? 'opens-upward' : '', className ?? ''].filter(Boolean).join(' ')} ref={rootRef}>
      <button className="filter-select-trigger" type="button" role="combobox" aria-label={ariaLabel} aria-expanded={isOpen} aria-controls={listboxId} disabled={disabled} onClick={() => isOpen ? setIsOpen(false) : openMenu()} onKeyDown={handleTriggerKeyDown}><span>{selectedOption?.label}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
      {isOpen && <div className="filter-select-menu" id={listboxId} role="listbox" aria-label={ariaLabel}>{visibleOptions.map((option, index) => <button className={option.value === value ? 'filter-select-option is-selected' : 'filter-select-option'} type="button" role="option" aria-selected={option.value === value} key={option.value} ref={(element) => { optionRefs.current[index] = element }} onClick={() => selectOption(option)} onKeyDown={(event) => handleOptionKeyDown(event, index)}><span>{option.label}</span>{option.value === value && <svg className="filter-select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}</button>)}</div>}
    </div>
  )
}
