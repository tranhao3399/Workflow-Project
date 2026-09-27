import type { ReactNode } from 'react'

interface AdvancedFilterPanelProps {
  isOpen: boolean
  children: ReactNode
  id: string
  label: string
}

export function AdvancedFilterPanel({ isOpen, children, id, label }: AdvancedFilterPanelProps) {
  return <section className={isOpen ? 'advanced-filter-panel open' : 'advanced-filter-panel'} id={id} aria-label={label} aria-hidden={!isOpen}>{children}</section>
}
