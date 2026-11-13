import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

export interface SearchableFilterOption {
  value: string
  label: string
  description?: string
}

interface SearchableFilterSelectProps {
  value: string
  options: readonly SearchableFilterOption[]
  placeholder: string
  searchPlaceholder: string
  ariaLabel: string
  isOpen: boolean
  isLoading?: boolean
  emptyText?: string
  onChange: (value: string) => void
  onSearchChange: (value: string) => void
  onOpenChange: (isOpen: boolean) => void
}

export function SearchableFilterSelect({
  value,
  options,
  placeholder,
  searchPlaceholder,
  ariaLabel,
  isOpen,
  isLoading = false,
  emptyText = 'Không tìm thấy dữ liệu phù hợp.',
  onChange,
  onSearchChange,
  onOpenChange,
}: SearchableFilterSelectProps) {
  const [search, setSearch] = useState('')
  const [opensUpward, setOpensUpward] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const popoverId = useId()
  const selectedOption = options.find((option) => option.value === value)

  const resetSearch = useCallback(() => {
    setSearch('')
    onSearchChange('')
  }, [onSearchChange])

  const closePopover = useCallback(() => {
    onOpenChange(false)
    resetSearch()
  }, [onOpenChange, resetSearch])

  useEffect(() => {
    if (!isOpen) return
    const frameId = window.requestAnimationFrame(() => searchInputRef.current?.focus())

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) closePopover()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closePopover()
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frameId)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closePopover, isOpen])

  function togglePopover() {
    if (isOpen) {
      closePopover()
      return
    }
    const rect = rootRef.current?.getBoundingClientRect()
    setOpensUpward(Boolean(rect && window.innerHeight - rect.bottom < 330 && rect.top > 330))
    resetSearch()
    onOpenChange(true)
  }

  function selectOption(option: SearchableFilterOption) {
    onChange(option.value)
    closePopover()
    triggerRef.current?.focus()
  }

  function clearSelection() {
    onChange('')
    closePopover()
    triggerRef.current?.focus()
  }

  return <div className={`filter-select searchable-filter-select${isOpen ? ' is-open' : ''}${opensUpward ? ' opens-upward' : ''}`} ref={rootRef}>
    <button className="filter-select-trigger" ref={triggerRef} type="button" role="combobox" aria-label={ariaLabel} aria-expanded={isOpen} aria-controls={popoverId} onClick={togglePopover}>
      <span className={selectedOption ? 'searchable-filter-trigger-value' : 'searchable-filter-trigger-placeholder'}>{selectedOption?.label ?? placeholder}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    {value && <button className="searchable-filter-clear" type="button" aria-label={`Xóa ${ariaLabel.toLocaleLowerCase('vi-VN')}`} title="Xóa lựa chọn" onClick={clearSelection}><X size={13} aria-hidden="true" /></button>}
    {isOpen && <div className="searchable-filter-menu" id={popoverId} role="dialog" aria-label={ariaLabel}>
      <div className="searchable-filter-search"><Search size={14} aria-hidden="true" /><input ref={searchInputRef} type="text" value={search} placeholder={searchPlaceholder} aria-label={searchPlaceholder} onChange={(event) => { const nextSearch = event.target.value; setSearch(nextSearch); onSearchChange(nextSearch) }} />{search && <button type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={() => { resetSearch(); searchInputRef.current?.focus() }}><X size={13} aria-hidden="true" /></button>}</div>
      <div className="searchable-filter-options" role="listbox" aria-label={ariaLabel}>
        {options.map((option) => <button className={option.value === value ? 'searchable-filter-option is-selected' : 'searchable-filter-option'} type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => selectOption(option)}><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>{option.value === value && <Check size={15} aria-hidden="true" />}</button>)}
        {isLoading && <div className="searchable-filter-state">Đang tải người thực hiện...</div>}
        {!isLoading && options.length === 0 && <div className="searchable-filter-state">{emptyText}</div>}
      </div>
    </div>}
  </div>
}
