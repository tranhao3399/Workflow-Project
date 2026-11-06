import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { ApiError } from '../../services/api-client'
import {
  createFormGroup,
  deleteFormGroup,
  updateFormGroup,
} from '../../services/form-definitions.service'
import type { FormGroup } from '../../types/workflow'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DataTable, EmptyTableRow } from '../ui/DataTable'

interface FormGroupManagerDialogProps {
  groups: FormGroup[]
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  onClose: () => void
  onChanged: () => Promise<void>
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

interface GroupDraft {
  code: string
  name: string
  description: string
  isActive: boolean
  sortOrder: string
}

const emptyDraft: GroupDraft = {
  code: '',
  name: '',
  description: '',
  isActive: true,
  sortOrder: '0',
}

export function FormGroupManagerDialog({
  groups,
  canCreate,
  canUpdate,
  canDelete,
  onClose,
  onChanged,
  onNotify,
}: FormGroupManagerDialogProps) {
  const [editing, setEditing] = useState<FormGroup | null>(null)
  const [draft, setDraft] = useState<GroupDraft>(emptyDraft)
  const [errors, setErrors] = useState<Partial<Record<'code' | 'name', string>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FormGroup | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function startCreate() {
    setEditing(null)
    setDraft({ ...emptyDraft })
    setErrors({})
  }

  function startEdit(group: FormGroup) {
    setEditing(group)
    setDraft({
      code: group.code,
      name: group.name,
      description: group.description ?? '',
      isActive: group.isActive,
      sortOrder: String(group.sortOrder),
    })
    setErrors({})
  }

  async function save() {
    const nextErrors: typeof errors = {}
    if (!editing && !draft.code.trim()) nextErrors.code = 'Mã nhóm biểu mẫu không được để trống.'
    if (!draft.name.trim()) nextErrors.name = 'Tên nhóm biểu mẫu không được để trống.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    setIsSaving(true)
    setErrors({})
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        isActive: draft.isActive,
        sortOrder: Number(draft.sortOrder) || 0,
      }
      if (editing) {
        await updateFormGroup(editing.id, payload)
        onNotify('Đã cập nhật nhóm biểu mẫu.')
      } else {
        await createFormGroup({ code: draft.code.trim().toUpperCase(), ...payload })
        onNotify('Đã tạo nhóm biểu mẫu.')
      }
      await onChanged()
      setEditing(null)
      setDraft({ ...emptyDraft })
    } catch (error) {
      if (error instanceof ApiError && (error.field === 'code' || error.field === 'name')) {
        setErrors({ [error.field]: error.message })
      } else {
        onNotify(error instanceof Error ? error.message : 'Không thể lưu nhóm biểu mẫu.', 'error')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function remove() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await deleteFormGroup(deleteTarget.id)
      onNotify('Đã xóa nhóm biểu mẫu.')
      setDeleteTarget(null)
      await onChanged()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể xóa nhóm biểu mẫu.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  return <>
    <div className="modal-backdrop form-group-manager-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onClose()
    }}>
      <section className="modal-panel form-group-manager-modal" role="dialog" aria-modal="true" aria-labelledby="form-group-manager-title">
        <header className="modal-header">
          <div><h2 id="form-group-manager-title">Quản lý nhóm biểu mẫu</h2></div>
          <button className="icon-close" type="button" aria-label="Đóng" onClick={onClose} disabled={isSaving}>×</button>
        </header>
        <div className="form-group-manager-body">
          <div className="form-group-manager-list">
            <div className="form-group-manager-list-heading">
              <strong>Danh sách nhóm</strong>
              {canCreate && <button className="secondary-button compact-button" type="button" onClick={startCreate}>
                <Plus size={14} aria-hidden="true" /> Thêm nhóm
              </button>}
            </div>
            <DataTable className="form-group-manager-table" fixedLayout>
              <thead><tr><th>Mã nhóm</th><th>Tên nhóm</th><th>Biểu mẫu</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead>
              <tbody>
                {groups.length === 0 ? <EmptyTableRow colSpan={5} message="Chưa có nhóm biểu mẫu." /> : groups.map((group) => <tr
                  className={`${canUpdate ? 'is-clickable' : ''}${editing?.id === group.id ? ' is-selected' : ''}`}
                  key={group.id}
                  tabIndex={canUpdate ? 0 : undefined}
                  onClick={() => { if (canUpdate) startEdit(group) }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (canUpdate && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault()
                      startEdit(group)
                    }
                  }}
                >
                  <td>{group.code}</td><td><strong>{group.name}</strong></td><td>{group.formCount}</td>
                  <td><span className={group.isActive ? 'status-badge status-active' : 'status-badge status-inactive'}>{group.isActive ? 'Hoạt động' : 'Ngưng hoạt động'}</span></td>
                  <td><div className="form-group-manager-actions">
                    {canUpdate && <button className="icon-action" type="button" aria-label={`Chỉnh sửa ${group.name}`} title="Chỉnh sửa" onClick={(event) => { event.stopPropagation(); startEdit(group) }}><Pencil size={14} /></button>}
                    {canDelete && <button className="icon-action danger-icon-action" type="button" aria-label={`Xóa ${group.name}`} title="Xóa" onClick={(event) => { event.stopPropagation(); setDeleteTarget(group) }}><Trash2 size={14} /></button>}
                  </div></td>
                </tr>)}
              </tbody>
            </DataTable>
          </div>

          {(editing || canCreate) && <div className="form-group-editor">
            <h3>{editing ? 'Chỉnh sửa nhóm' : 'Tạo nhóm mới'}</h3>
            <div className="form-group-editor-grid">
              <label><span className="required-field-label">Mã nhóm</span><input value={draft.code} disabled={Boolean(editing) || isSaving} maxLength={80} aria-invalid={Boolean(errors.code)} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} />{errors.code && <small className="field-error">{errors.code}</small>}</label>
              <label><span className="required-field-label">Tên nhóm</span><input value={draft.name} disabled={isSaving} maxLength={160} aria-invalid={Boolean(errors.name)} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />{errors.name && <small className="field-error">{errors.name}</small>}</label>
              <label className="form-group-description-field"><span>Mô tả</span><textarea value={draft.description} disabled={isSaving} maxLength={1000} rows={3} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
              <label><span>Thứ tự hiển thị</span><input type="number" min={0} max={9999} value={draft.sortOrder} disabled={isSaving} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))} /></label>
              <div className="form-group-active-field"><span>Trạng thái</span><button className={draft.isActive ? 'form-group-status-toggle is-active' : 'form-group-status-toggle'} type="button" role="switch" aria-checked={draft.isActive} disabled={isSaving} onClick={() => setDraft((current) => ({ ...current, isActive: !current.isActive }))}><span aria-hidden="true" /><b>{draft.isActive ? 'Hoạt động' : 'Ngưng hoạt động'}</b></button></div>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" type="button" disabled={isSaving} onClick={() => { setEditing(null); setDraft({ ...emptyDraft }); setErrors({}) }}>Hủy</button>
              <button className="primary-button" type="button" disabled={isSaving} onClick={() => void save()}>{isSaving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Lưu'}</button>
            </div>
          </div>}
        </div>
      </section>
    </div>
    {deleteTarget && <ConfirmDialog title="Xóa nhóm biểu mẫu" description={`Bạn có chắc chắn muốn xóa nhóm ${deleteTarget.name}?`} confirmLabel="Xóa" tone="danger" onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} isConfirming={isDeleting} confirmingLabel="Đang xóa..." compact />}
  </>
}
