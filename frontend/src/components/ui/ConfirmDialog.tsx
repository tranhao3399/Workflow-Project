import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  tone?: 'danger' | 'primary'
  children?: ReactNode
  confirmDisabled?: boolean
  isConfirming?: boolean
  confirmingLabel?: string
  compact?: boolean
}

export function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm, tone = 'primary', children, confirmDisabled = false, isConfirming = false, confirmingLabel = 'Đang cập nhật...', compact = false }: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelButtonRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="modal-backdrop" role="presentation">
      <section className={compact ? 'confirm-panel confirm-panel-compact' : 'confirm-panel'} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        {!compact && <p className="state-kicker">XÁC NHẬN THAO TÁC</p>}
        <h2 id="confirm-dialog-title">{title}</h2>
        <p className={compact ? 'confirm-panel-message' : undefined}>{description}</p>
        {children}
        <div className="modal-actions"><button className="secondary-button" ref={cancelButtonRef} type="button" onClick={onCancel} disabled={isConfirming}>Hủy</button><button className={tone === 'danger' ? 'danger-button' : 'primary-button'} type="button" onClick={onConfirm} disabled={confirmDisabled || isConfirming}>{isConfirming ? confirmingLabel : confirmLabel}</button></div>
      </section>
    </div>
  )
}
