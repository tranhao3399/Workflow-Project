import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useMotionTokens, useShouldReduceMotion } from '@animate-ui/react/utils/motion'
import { motion } from 'motion/react'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  onCancel: () => void
  onConfirm: () => void
  tone?: 'danger' | 'primary'
  variant?: 'default' | 'discard-changes'
  children?: ReactNode
  confirmDisabled?: boolean
  isConfirming?: boolean
  confirmingLabel?: string
  compact?: boolean
  hideCancel?: boolean
}

export function ConfirmDialog({ title, description, confirmLabel, cancelLabel, onCancel, onConfirm, tone = 'primary', variant = 'default', children, confirmDisabled = false, isConfirming = false, confirmingLabel = 'Đang cập nhật...', compact = false, hideCancel = false }: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const shouldReduceMotion = useShouldReduceMotion()
  const { spring, transition } = useMotionTokens()
  const isDiscardChanges = variant === 'discard-changes'
  const resolvedCancelLabel = cancelLabel ?? (isDiscardChanges ? 'Ở lại trang' : 'Hủy')
  const cancelButtonClassName = isDiscardChanges
    ? 'primary-button confirm-dialog-stay-button'
    : 'secondary-button'
  const confirmButtonClassName = isDiscardChanges
    ? 'danger-outline-button confirm-dialog-leave-button'
    : tone === 'danger'
      ? 'danger-button'
      : 'primary-button'

  useEffect(() => {
    if (hideCancel) confirmButtonRef.current?.focus()
    else cancelButtonRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [hideCancel, onCancel])

  return (
    <motion.div className="modal-backdrop" role="presentation" initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={transition.fade}>
      <motion.section className={compact ? 'confirm-panel confirm-panel-compact' : 'confirm-panel'} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={spring.dialog}>
        {!compact && <p className="state-kicker">XÁC NHẬN THAO TÁC</p>}
        <h2 id="confirm-dialog-title">{title}</h2>
        <p className={compact ? 'confirm-panel-message' : undefined}>{description}</p>
        {children}
        <div className="modal-actions">{!hideCancel && <button className={cancelButtonClassName} ref={cancelButtonRef} type="button" onClick={onCancel} disabled={isConfirming}>{resolvedCancelLabel}</button>}<button className={confirmButtonClassName} ref={confirmButtonRef} type="button" onClick={onConfirm} disabled={confirmDisabled || isConfirming}>{isConfirming ? confirmingLabel : confirmLabel}</button></div>
      </motion.section>
    </motion.div>
  )
}
