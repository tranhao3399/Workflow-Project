import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, UserCheck, X } from 'lucide-react'
import { useMotionTokens, useShouldReduceMotion } from '@animate-ui/react/utils/motion'
import { motion } from 'motion/react'
import { listReassignCandidates } from '../../services/approvals.service'
import type { ApprovalReassignCandidate } from '../../types/workflow'
import { normalizeSearchText } from '../../utils/formatters'

interface ReassignTaskDialogProps {
  taskId: string
  requestNo: string
  stepName: string
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: (newAssigneeUserId: string, reason: string) => void
}

type ScopeFilter = 'all' | 'peers'

export function ReassignTaskDialog({
  taskId,
  requestNo,
  stepName,
  isSubmitting,
  onCancel,
  onConfirm,
}: ReassignTaskDialogProps) {
  const [candidates, setCandidates] = useState<ApprovalReassignCandidate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [reason, setReason] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useShouldReduceMotion()
  const { spring, transition } = useMotionTokens()

  const loadCandidates = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const result = await listReassignCandidates(taskId)
      setCandidates(result)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải danh sách nhân viên đủ điều kiện.')
    } finally {
      setIsLoading(false)
    }
  }, [taskId])

  // Initial candidate list fetch on dialog open.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadCandidates() }, [loadCandidates])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frameId)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isSubmitting, onCancel])

  const peerCandidates = useMemo(
    () => candidates.filter((item) => item.isSamePosition || item.isSameDepartment),
    [candidates],
  )

  const filteredCandidates = useMemo(() => {
    const base = scopeFilter === 'peers' ? peerCandidates : candidates
    const query = normalizeSearchText(search)
    if (!query) return base
    return base.filter((item) =>
      [
        item.fullName,
        item.employeeCode ?? '',
        item.email,
        item.positionName ?? '',
        item.departmentName ?? '',
        item.workUnitName ?? '',
      ].some((field) => normalizeSearchText(field).includes(query)),
    )
  }, [candidates, peerCandidates, scopeFilter, search])

  const selectedCandidate = useMemo(
    () => candidates.find((item) => item.userId === selectedUserId),
    [candidates, selectedUserId],
  )

  const canSubmit = Boolean(selectedUserId && reason.trim() && !isSubmitting)

  return (
    <motion.div
      className="modal-backdrop"
      role="presentation"
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transition.fade}
    >
      <motion.section
        className="confirm-panel reassign-task-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reassign-dialog-title"
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring.dialog}
      >
        <div className="reassign-dialog-header">
          <div>
            <p className="state-kicker">CHUYỂN GIAO PHÊ DUYỆT</p>
            <h2 id="reassign-dialog-title">Chọn người duyệt thay</h2>
            <p className="reassign-dialog-subtitle">
              Phiếu <strong>{requestNo}</strong> · Bước hiện tại: <strong>{stepName}</strong>
            </p>
          </div>
          <button
            className="reassign-dialog-close"
            type="button"
            aria-label="Đóng hộp thoại"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="reassign-toolbar">
          <div className="reassign-search-box">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              disabled={isLoading || isSubmitting}
              placeholder="Tìm theo tên, mã nhân viên (EMP...), chức danh, phòng ban..."
              aria-label="Tìm kiếm nhân viên nhận task"
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                className="reassign-search-clear"
                type="button"
                aria-label="Xóa từ khóa tìm kiếm"
                onClick={() => {
                  setSearch('')
                  searchInputRef.current?.focus()
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          {peerCandidates.length > 0 && (
            <div className="reassign-scope-pills" role="tablist" aria-label="Bộ lọc nhanh nhân viên">
              <button
                className={scopeFilter === 'all' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={scopeFilter === 'all'}
                onClick={() => setScopeFilter('all')}
              >
                Tất cả ({candidates.length})
              </button>
              <button
                className={scopeFilter === 'peers' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={scopeFilter === 'peers'}
                onClick={() => setScopeFilter('peers')}
              >
                Cùng cấp / Cùng phòng ban ({peerCandidates.length})
              </button>
            </div>
          )}
        </div>

        <div className="reassign-candidate-container" role="listbox" aria-label="Danh sách nhân viên đủ điều kiện">
          {isLoading ? (
            <div className="reassign-empty-state">
              <span>Đang tải danh sách nhân viên đủ điều kiện...</span>
            </div>
          ) : loadError ? (
            <div className="reassign-empty-state is-error">
              <strong>Không thể tải danh sách nhân viên</strong>
              <span>{loadError}</span>
              <button className="secondary-button" type="button" onClick={() => void loadCandidates()}>
                Thử lại
              </button>
            </div>
          ) : candidates.length === 0 ? (
            <div className="reassign-empty-state">
              <strong>Chưa có nhân viên khác đủ điều kiện nhận chuyển giao</strong>
              <span>Nhân viên nhận bàn giao cần đang hoạt động và có quyền phê duyệt phiếu.</span>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="reassign-empty-state">
              <strong>Không tìm thấy nhân viên phù hợp</strong>
              <span>Thử tìm theo tên, mã nhân viên hoặc chuyển về tab Tất cả.</span>
            </div>
          ) : (
            <div className="reassign-candidate-list">
              {filteredCandidates.map((candidate) => {
                const isSelected = candidate.userId === selectedUserId
                const metaParts = [
                  candidate.positionName,
                  candidate.departmentName || candidate.workUnitName,
                  candidate.email,
                ].filter(Boolean)
                return (
                  <button
                    key={candidate.userId}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={isSubmitting}
                    className={`reassign-candidate-item${isSelected ? ' is-selected' : ''}`}
                    onClick={() => setSelectedUserId(candidate.userId)}
                  >
                    <span className="reassign-candidate-avatar" aria-hidden="true">
                      {initialsOf(candidate.fullName)}
                    </span>
                    <span className="reassign-candidate-info">
                      <span className="reassign-candidate-title-row">
                        <strong>{candidate.fullName}</strong>
                        {candidate.employeeCode && (
                          <span className="reassign-candidate-code">{candidate.employeeCode}</span>
                        )}
                        {candidate.isSamePosition && (
                          <span className="reassign-peer-badge is-position">Cùng cấp / chức danh</span>
                        )}
                        {candidate.isSameDepartment && (
                          <span className="reassign-peer-badge is-department">Cùng phòng ban</span>
                        )}
                      </span>
                      <span className="reassign-candidate-meta">{metaParts.join(' · ')}</span>
                    </span>
                    <span className={`reassign-candidate-check${isSelected ? ' is-selected' : ''}`} aria-hidden="true">
                      {isSelected && <Check size={14} />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {selectedCandidate && (
          <div className="reassign-selected-banner" role="status">
            <UserCheck size={16} aria-hidden="true" />
            <span>
              Người nhận bàn giao:{' '}
              <strong>
                {selectedCandidate.fullName}
                {selectedCandidate.employeeCode ? ` (${selectedCandidate.employeeCode})` : ''}
              </strong>
              {selectedCandidate.positionName ? ` · ${selectedCandidate.positionName}` : ''}
            </span>
          </div>
        )}

        <label className="request-reason-field">
          <span>
            Lý do chuyển giao <b aria-hidden="true">*</b>
          </span>
          <textarea
            rows={3}
            maxLength={1000}
            value={reason}
            disabled={isSubmitting}
            placeholder="Nhập lý do chuyển giao task phê duyệt cho nhân viên này..."
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        <div className="modal-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Hủy
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (canSubmit) onConfirm(selectedUserId, reason.trim())
            }}
          >
            {isSubmitting ? 'Đang chuyển giao...' : 'Xác nhận chuyển giao'}
          </button>
        </div>
      </motion.section>
    </motion.div>
  )
}

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'NV'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}
