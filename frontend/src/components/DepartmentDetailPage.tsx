import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getActivePositionCatalogFromApi,
  getDepartmentAuditLogs,
  getDepartmentBasicByIdFromApi,
  getDepartmentPositionsFromApi,
  applyDepartmentJobTitlesFromApi,
  deleteDepartmentFromApi,
  removeDepartmentPositionsFromApi,
  updateDepartmentFromApi,
  type DepartmentAuditLog,
} from '../services/master-data.service'
import type { DepartmentPreview, JobTitlePreview } from '../types/master-data'
import { auditActorLabel, auditChangeDetails, auditValue } from '../utils/audit-display'
import { formatDateTime as dateTime } from '../utils/formatters'
import { ErrorState, LoadingState } from './DataStates'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { DataTable } from './ui/DataTable'
import { FilterSelect } from './ui/FilterSelect'
import { DepartmentStatusBadge } from './ui/MasterDataStatusBadge'
import { SurfaceCard } from './ui/SurfaceCard'

interface DepartmentDetailPageProps { departmentId: string; currentUserId: string; onBack: () => void; onDeleted: () => void }

function actorName(log: DepartmentAuditLog, currentUserId: string): string {
  return auditActorLabel(log.actor, currentUserId)
}

function auditPositionNames(log: DepartmentAuditLog): string[] {
  const after = log.changes?.after
  const positions = Array.isArray(after?.positions) ? after.positions : after?.position ? [after.position] : []
  return positions.flatMap((position) => {
    if (typeof position !== 'object' || position === null || !('name' in position)) return []
    return typeof position.name === 'string' ? [position.name] : []
  })
}

function auditActionLabel(action: string): string {
  if (action === 'DEPARTMENT.POSITIONS_ADDED' || action === 'DEPARTMENT.POSITION_ASSIGNED' || action === 'DEPARTMENT.POSITIONS_ASSIGNED' || action === 'DEPARTMENT.POSITIONS_APPLIED') return 'Gán chức danh'
  if (action === 'DEPARTMENT.POSITIONS_DELETED' || action === 'DEPARTMENT.POSITION_DELETED' || action === 'DEPARTMENT.POSITION_REMOVED') return 'Gỡ chức danh'
  if (action === 'DEPARTMENT.CREATED') return 'Tạo phòng ban'
  if (action === 'DEPARTMENT.DEACTIVATED') return 'Cập nhật trạng thái'
  return 'Cập nhật thông tin'
}

function auditDescription(log: DepartmentAuditLog, departmentName: string, currentUserId: string): string {
  const actor = actorName(log, currentUserId)
  const positions = auditPositionNames(log).map((name) => `“${name}”`).join(', ')
  if (auditActionLabel(log.action) === 'Gán chức danh') return `${actor} đã gán${positions ? ` chức danh ${positions}` : ' chức danh'} cho phòng ban ${departmentName}.`
  if (auditActionLabel(log.action) === 'Gỡ chức danh') return `${actor} đã gỡ${positions ? ` chức danh ${positions}` : ' chức danh'} khỏi phòng ban ${departmentName}.`
  if (log.action === 'DEPARTMENT.CREATED') return `${actor} đã tạo phòng ban ${departmentName}.`
  if (log.action === 'DEPARTMENT.DEACTIVATED') return `${actor} đã thay đổi trạng thái phòng ban ${departmentName}.`
  return `${actor} đã cập nhật thông tin phòng ban ${departmentName}.`
}

function departmentChangeDetails(log: DepartmentAuditLog): string[] {
  return auditChangeDetails(log.changes, [
    { key: 'code', label: 'Mã phòng ban' },
    { key: 'name', label: 'Tên phòng ban' },
    { key: 'isActive', label: 'Trạng thái', format: (value) => value === true ? 'Hoạt động' : value === false ? 'Ngưng hoạt động' : auditValue(value) },
  ])
}

export function DepartmentDetailPage({ departmentId, currentUserId, onBack, onDeleted }: DepartmentDetailPageProps) {
  const [department, setDepartment] = useState<DepartmentPreview | null>(null)
  const [positions, setPositions] = useState<JobTitlePreview[]>([])
  const [catalog, setCatalog] = useState<JobTitlePreview[]>([])
  const [logs, setLogs] = useState<DepartmentAuditLog[]>([])
  const [visibleLogs, setVisibleLogs] = useState(5)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draftCode, setDraftCode] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftIsActive, setDraftIsActive] = useState(true)
  const [codeError, setCodeError] = useState('')
  const [nameError, setNameError] = useState('')
  const [pendingNavigation, setPendingNavigation] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isJobTitleDialogOpen, setIsJobTitleDialogOpen] = useState(false)
  const [selectedJobTitleIds, setSelectedJobTitleIds] = useState<string[]>([])
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([])
  const [pendingRemoval, setPendingRemoval] = useState<JobTitlePreview[] | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [notice, setNotice] = useState('')
  const dialogCloseRef = useRef<HTMLButtonElement>(null)

  async function refreshAppliedPositions(): Promise<void> {
    const [assigned, activeCatalog, auditLogs] = await Promise.all([
      getDepartmentPositionsFromApi(departmentId),
      getActivePositionCatalogFromApi(),
      getDepartmentAuditLogs(departmentId).catch(() => []),
    ])
    setPositions(assigned)
    setCatalog(activeCatalog)
    setLogs(auditLogs)
    setVisibleLogs(5)
  }

  async function load() {
    setIsLoading(true)
    try {
      const departmentResult = await getDepartmentBasicByIdFromApi(departmentId)
      setDepartment(departmentResult)
      setDraftCode(departmentResult.code)
      setDraftName(departmentResult.name)
      setDraftIsActive(departmentResult.isActive)
      await refreshAppliedPositions()
      setHasError(false)
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }

  // Reload detail state when the route identity changes.
  // oxlint-disable-next-line react/set-state-in-effect react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [departmentId])
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: isEditing && Boolean(department && (draftCode !== department.code || draftName !== department.name || draftIsActive !== department.isActive)) }))
    return () => { window.dispatchEvent(new CustomEvent('workflow:unsaved-change', { detail: false })) }
  }, [department, draftCode, draftIsActive, draftName, isEditing])
  useEffect(() => {
    if (!isJobTitleDialogOpen) return
    dialogCloseRef.current?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) setIsJobTitleDialogOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isJobTitleDialogOpen, isSaving])
  useEffect(() => {
    if (!notice) return
    const timeoutId = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  const availablePositions = useMemo(() => catalog.filter((item) => item.isActive && !positions.some((assigned) => assigned.code === item.code)), [catalog, positions])
  const allAvailableSelected = availablePositions.length > 0 && availablePositions.every((item) => selectedJobTitleIds.includes(item.id))
  const selectedPositions = useMemo(() => positions.filter((position) => selectedPositionIds.includes(position.id)), [positions, selectedPositionIds])
  const allPositionsSelected = positions.length > 0 && positions.every((position) => selectedPositionIds.includes(position.id))
  const normalizedDraftCode = draftCode.trim().toUpperCase()
  const isCodeValid = /^[A-Z0-9_]+$/.test(normalizedDraftCode)
  const hasUnsavedChanges = Boolean(department && isEditing && (normalizedDraftCode !== department.code || draftName.trim() !== department.name || draftIsActive !== department.isActive))

  function requestBack() {
    if (hasUnsavedChanges) setPendingNavigation(true)
    else onBack()
  }

  function discardAndBack() {
    if (department) {
      setDraftCode(department.code)
      setDraftName(department.name)
      setDraftIsActive(department.isActive)
    }
    setCodeError('')
    setNameError('')
    setIsEditing(false)
    setPendingNavigation(false)
    onBack()
  }

  async function saveDepartment() {
    if (!department) return
    if (!isCodeValid) {
      setCodeError(normalizedDraftCode ? 'Mã phòng ban chỉ dùng A-Z, 0-9 và dấu gạch dưới.' : 'Mã phòng ban không được để trống.')
      if (!normalizedDraftCode) setNotice('Vui lòng nhập đầy đủ các thông tin bắt buộc.')
      return
    }
    if (!draftName.trim()) {
      setNameError('Tên phòng ban là bắt buộc.')
      setNotice('Vui lòng nhập đầy đủ các thông tin bắt buộc.')
      return
    }
    if (!hasUnsavedChanges) return
    setCodeError('')
    setNameError('')
    setIsSaving(true)
    try {
      const code = normalizedDraftCode
      const name = draftName.trim()
      await updateDepartmentFromApi(department.id, { code, name, isActive: draftIsActive })
      setDepartment({ ...department, code, name, isActive: draftIsActive })
      setDraftCode(code)
      setDraftName(name)
      setIsEditing(false)
      setNotice('Đã lưu thay đổi phòng ban.')
      setLogs(await getDepartmentAuditLogs(departmentId).catch(() => logs))
      setVisibleLogs(5)
    } catch {
      setNameError('Tên phòng ban đã tồn tại hoặc không hợp lệ.')
      setNotice('Không thể lưu thay đổi phòng ban.')
    } finally {
      setIsSaving(false)
    }
  }

  function openJobTitleDialog() {
    setNotice('')
    setSelectedJobTitleIds([])
    setIsJobTitleDialogOpen(true)
  }

  function toggleJobTitle(jobTitleId: string) {
    setSelectedJobTitleIds((selected) => selected.includes(jobTitleId) ? selected.filter((id) => id !== jobTitleId) : [...selected, jobTitleId])
  }

  function toggleAllJobTitles() {
    setSelectedJobTitleIds(allAvailableSelected ? [] : availablePositions.map((item) => item.id))
  }

  function togglePosition(positionId: string) {
    setSelectedPositionIds((selected) => selected.includes(positionId) ? selected.filter((id) => id !== positionId) : [...selected, positionId])
  }

  function toggleAllPositions() {
    setSelectedPositionIds(allPositionsSelected ? [] : positions.map((position) => position.id))
  }

  async function applyJobTitles() {
    if (selectedJobTitleIds.length === 0) return
    setIsSaving(true)
    try {
      await applyDepartmentJobTitlesFromApi(departmentId, selectedJobTitleIds)
      await refreshAppliedPositions()
      setSelectedJobTitleIds([])
      setIsJobTitleDialogOpen(false)
      window.requestAnimationFrame(() => setNotice('Gán chức danh thành công.'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Không thể áp dụng chức danh cho phòng ban.')
    } finally { setIsSaving(false) }
  }

  async function removePositions() {
    if (!pendingRemoval || pendingRemoval.length === 0) return
    const removalCount = pendingRemoval.length
    setIsSaving(true)
    try {
      await removeDepartmentPositionsFromApi(departmentId, pendingRemoval.map((position) => position.id))
      setPendingRemoval(null)
      setSelectedPositionIds([])
      await refreshAppliedPositions()
      setNotice(`Đã gỡ ${removalCount} chức danh khỏi phòng ban.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Không thể xóa vị trí khỏi phòng ban.')
    } finally { setIsSaving(false) }
  }

  async function deleteDepartment() {
    setIsSaving(true)
    try {
      await deleteDepartmentFromApi(departmentId)
      onDeleted()
    } catch (error) {
      setShowDeleteConfirm(false)
      setNotice(error instanceof Error ? error.message : 'Không thể xóa phòng ban. Vui lòng thử lại.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (hasError || !department) return <ErrorState onRetry={() => void load()} />

  return <>
    <nav className="detail-breadcrumb" aria-label="Điều hướng phòng ban"><button className="breadcrumb-link" type="button" onClick={requestBack}>Phòng ban</button><span aria-hidden="true">/</span><strong>{department.name}</strong></nav>
    <section className="department-detail-summary">
      <div className="department-detail-summary-main"><h1>{department.name}</h1></div>
      <div className="department-detail-actions">
        {isEditing ? <><button className="secondary-button compact-button" type="button" onClick={() => { setDraftCode(department.code); setDraftName(department.name); setDraftIsActive(department.isActive); setCodeError(''); setNameError(''); setSelectedPositionIds([]); setSelectedJobTitleIds([]); setIsJobTitleDialogOpen(false); setIsEditing(false) }} disabled={isSaving}>Hủy</button><button className="primary-button compact-button" type="button" onClick={() => void saveDepartment()} disabled={!hasUnsavedChanges || isSaving}>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></> : <><button className="secondary-button compact-button" type="button" onClick={requestBack} disabled={isSaving}>← Quay lại</button><button className="secondary-button compact-button" type="button" onClick={() => setIsEditing(true)} disabled={isSaving}>Chỉnh sửa</button><button className="danger-button compact-button" type="button" onClick={() => setShowDeleteConfirm(true)} disabled={isSaving}>Xóa</button></>}
      </div>
    </section>

    <SurfaceCard className="department-info-card">
      <div className="department-info-heading"><h2>Thông tin phòng ban</h2></div>
      <div className="department-info-grid">
        <div><span className={isEditing ? 'profile-field-label required-field-label' : 'profile-field-label'}>Mã phòng ban</span>{isEditing ? <><input className="department-info-input" value={draftCode} onChange={(event) => { setDraftCode(event.target.value.toUpperCase()); setCodeError('') }} aria-label="Mã phòng ban" aria-invalid={Boolean(codeError) || !isCodeValid} required />{(codeError || !isCodeValid) && <small className="department-info-error">{codeError || (normalizedDraftCode ? 'Mã phòng ban chỉ dùng A-Z, 0-9 và dấu gạch dưới.' : 'Mã phòng ban không được để trống.')}</small>}</> : <span className="department-info-value department-info-code">{department.code}</span>}</div>
        <div><span className={isEditing ? 'profile-field-label required-field-label' : 'profile-field-label'}>Tên phòng ban</span>{isEditing ? <><input className="department-info-input" value={draftName} onChange={(event) => { setDraftName(event.target.value); setNameError('') }} aria-label="Tên phòng ban" aria-invalid={Boolean(nameError) || !draftName.trim()} required />{(nameError || !draftName.trim()) && <small className="department-info-error">{nameError || 'Tên phòng ban là bắt buộc.'}</small>}</> : <strong className="department-info-value">{department.name}</strong>}</div>
        <div><span className="profile-field-label">Trạng thái</span>{isEditing ? <FilterSelect ariaLabel="Trạng thái phòng ban" value={String(draftIsActive)} options={[{ value: 'true', label: 'Hoạt động' }, { value: 'false', label: 'Ngưng hoạt động' }]} onChange={(value) => setDraftIsActive(value === 'true')} disabled={isSaving} /> : <span className="department-info-value"><DepartmentStatusBadge isActive={department.isActive} /></span>}</div>
      </div>
    </SurfaceCard>

    <SurfaceCard className="department-position-card">
      <div className="department-position-heading">
        <h2>Chức danh</h2>
        {isEditing && <div>
          <button className="secondary-button compact-button department-assign-job-title-button" type="button" onClick={openJobTitleDialog} disabled={isSaving}>+ Gán chức danh</button>
          {selectedPositions.length > 0 && <button className="danger-button danger-outline-button compact-button" type="button" onClick={() => setPendingRemoval(selectedPositions)} disabled={isSaving}>Gỡ ({selectedPositions.length})</button>}
        </div>}
      </div>
      {positions.length === 0 ? <p className="department-position-empty">Chưa có chức danh nào được gán.</p> : <DataTable className="admin-table department-position-table"><thead><tr>{isEditing && <th className="department-position-select"><input type="checkbox" aria-label="Chọn tất cả chức danh" checked={allPositionsSelected} onChange={toggleAllPositions} disabled={isSaving} /></th>}<th className="department-position-number">#</th><th>Mã chức danh</th><th>Tên chức danh</th></tr></thead><tbody>{positions.map((position, index) => <tr key={position.id} className={isEditing && selectedPositionIds.includes(position.id) ? 'is-selected' : ''}>{isEditing && <td className="department-position-select"><input type="checkbox" aria-label={`Chọn ${position.name}`} checked={selectedPositionIds.includes(position.id)} onChange={() => togglePosition(position.id)} disabled={isSaving} /></td>}<td className="department-position-number">{index + 1}</td><td><span className="master-secondary-text">{position.code}</span></td><td><strong className="master-primary-text">{position.name}</strong></td></tr>)}</tbody></DataTable>}
    </SurfaceCard>

    {isJobTitleDialogOpen && <div className="modal-backdrop department-job-title-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsJobTitleDialogOpen(false) }}><section className="modal-panel department-job-title-modal" role="dialog" aria-modal="true" aria-labelledby="department-job-title-dialog-title"><header className="modal-header"><div><h2 id="department-job-title-dialog-title">Gán chức danh</h2></div><button className="icon-button" ref={dialogCloseRef} type="button" aria-label="Đóng hộp thoại" onClick={() => setIsJobTitleDialogOpen(false)} disabled={isSaving}>×</button></header><div className="department-job-title-modal-content">{availablePositions.length === 0 ? <p className="department-job-title-modal-empty">Tất cả chức danh đang hoạt động đã được gán cho phòng ban này.</p> : <DataTable className="department-job-title-selection-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả chức danh" checked={allAvailableSelected} onChange={toggleAllJobTitles} disabled={isSaving} /></th><th>Mã chức danh</th><th>Tên chức danh</th></tr></thead><tbody>{availablePositions.map((jobTitle) => <tr key={jobTitle.id} className={selectedJobTitleIds.includes(jobTitle.id) ? 'is-selected' : ''}><td><input type="checkbox" aria-label={`Chọn ${jobTitle.name}`} checked={selectedJobTitleIds.includes(jobTitle.id)} onChange={() => toggleJobTitle(jobTitle.id)} disabled={isSaving} /></td><td><span>{jobTitle.code}</span></td><td><strong>{jobTitle.name}</strong></td></tr>)}</tbody></DataTable>}</div><footer className="modal-actions"><button className="secondary-button" type="button" onClick={() => setIsJobTitleDialogOpen(false)} disabled={isSaving}>Hủy</button><button className="primary-button" type="button" onClick={() => void applyJobTitles()} disabled={selectedJobTitleIds.length === 0 || isSaving}>{isSaving ? 'Đang áp dụng...' : `Áp dụng${selectedJobTitleIds.length ? ` (${selectedJobTitleIds.length})` : ''}`}</button></footer></section></div>}

    <section className="employee-activity-section department-audit-section"><div className="employee-activity-heading"><div><h2>Lịch sử</h2></div></div><SurfaceCard className="employee-activity-card">{logs.length === 0 ? <p className="employee-activity-empty">Chưa có lịch sử liên quan đến phòng ban này.</p> : <><div className="employee-activity-list">{logs.slice(0, visibleLogs).map((log) => { const changeDetails = departmentChangeDetails(log); return <article className="activity-log-row" key={log._id ?? log.id ?? `${log.occurredAt}-${log.action}`}><div><strong>{auditDescription(log, department.name, currentUserId)}</strong>{changeDetails.length > 0 && <p>Thay đổi: {changeDetails.join(' · ')}</p>}<small>{auditActionLabel(log.action)}</small></div><time>{dateTime(log.occurredAt)}</time></article> })}</div>{visibleLogs < logs.length && <div className="employee-activity-more"><button className="secondary-button" type="button" onClick={() => setVisibleLogs((count) => count + 5)}>Xem thêm</button></div>}</>}</SurfaceCard></section>
    {notice && <div className={`toast-message${notice === 'Vui lòng nhập đầy đủ các thông tin bắt buộc.' || notice.startsWith('Không thể') ? ' toast-error' : ''}`} role={notice === 'Vui lòng nhập đầy đủ các thông tin bắt buộc.' || notice.startsWith('Không thể') ? 'alert' : 'status'}>{notice}</div>}
    {showDeleteConfirm && <ConfirmDialog title="Xóa phòng ban" description="Bạn có chắc chắn muốn xóa phòng ban này?" confirmLabel="Xóa" confirmingLabel="Đang xóa..." tone="danger" onCancel={() => setShowDeleteConfirm(false)} onConfirm={() => void deleteDepartment()} isConfirming={isSaving} compact />}
    {pendingRemoval && <ConfirmDialog title="Gỡ chức danh" description={`Bạn có chắc chắn muốn gỡ ${pendingRemoval.length} chức danh đã chọn?`} confirmLabel="Gỡ" tone="danger" onCancel={() => setPendingRemoval(null)} onConfirm={() => void removePositions()} isConfirming={isSaving} compact />}
    {pendingNavigation && <ConfirmDialog title="Chưa lưu thay đổi" description="Bạn đang có thay đổi chưa lưu. Nếu rời trang, các thay đổi này sẽ bị hủy." confirmLabel="Rời khỏi trang" tone="danger" onCancel={() => setPendingNavigation(false)} onConfirm={discardAndBack} />}
  </>
}
