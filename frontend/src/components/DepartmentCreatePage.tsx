import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import { ApiError } from '../services/api-client';
import {
  createDepartmentFromApi,
  getActivePositionCatalogFromApi,
  getDepartmentsFromApi,
  getOrganizationManagerOptionsFromApi,
} from '../services/master-data.service';
import type {
  CreateDepartmentInput,
  DepartmentPreview,
  JobTitlePreview,
  OrganizationManagerOption,
} from '../types/master-data';
import { normalizeSearchText } from '../utils/formatters';
import {
  isOrganizationParentRequired,
} from '../utils/organization-tree';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { DataTable } from './ui/DataTable';
import { FilterSelect } from './ui/FilterSelect';
import { OrganizationManagerSelect } from './ui/OrganizationManagerSelect';
import { OrganizationParentSelect } from './ui/OrganizationParentSelect';
import { SurfaceCard } from './ui/SurfaceCard';

interface DepartmentCreatePageProps {
  onBack: () => void;
  onCreated: () => void;
}

type DepartmentField = 'name' | 'code' | 'parentId';
type DepartmentFieldErrors = Partial<Record<DepartmentField, string>>;

const initialForm: CreateDepartmentInput = {
  name: '',
  code: '',
  isActive: true,
  unitType: 'DEPARTMENT',
  positionIds: [],
};

function validate(form: CreateDepartmentInput): DepartmentFieldErrors {
  const errors: DepartmentFieldErrors = {};
  const name = form.name.trim();
  const code = form.code.trim();

  if (!name) errors.name = 'Tên phòng ban là bắt buộc.';
  else if (name.length > 120)
    errors.name = 'Tên phòng ban không được vượt quá 120 ký tự.';

  if (!code) errors.code = 'Mã phòng ban là bắt buộc.';
  else if (code.length > 40)
    errors.code = 'Mã phòng ban không được vượt quá 40 ký tự.';
  else if (!/^[A-Z0-9_]+$/.test(code))
    errors.code = 'Mã chỉ gồm A-Z, 0-9 và dấu gạch dưới.';

  if (isOrganizationParentRequired(form.unitType) && !form.parentId) {
    errors.parentId = 'Vui lòng chọn phòng ban cấp trên.';
  }
  return errors;
}

export function DepartmentCreatePage({
  onBack,
  onCreated,
}: DepartmentCreatePageProps) {
  const [form, setForm] = useState<CreateDepartmentInput>(initialForm);
  const [errors, setErrors] = useState<DepartmentFieldErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<DepartmentField, boolean>>
  >({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [jobTitles, setJobTitles] = useState<JobTitlePreview[]>([]);
  const [departments, setDepartments] = useState<DepartmentPreview[]>([]);
  const [managerOptions, setManagerOptions] = useState<
    OrganizationManagerOption[]
  >([]);
  const [isJobTitleDialogOpen, setIsJobTitleDialogOpen] = useState(false);
  const [jobTitleSearch, setJobTitleSearch] = useState('');
  const [selectedJobTitleIds, setSelectedJobTitleIds] = useState<string[]>([]);
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([]);
  const [pendingRemoval, setPendingRemoval] = useState<
    JobTitlePreview[] | null
  >(null);
  const [isLoadingJobTitles, setIsLoadingJobTitles] = useState(true);
  const [jobTitlesError, setJobTitlesError] = useState('');
  const dialogCloseRef = useRef<HTMLButtonElement>(null);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form],
  );
  const validation = useMemo(() => validate(form), [form]);
  const isParentRequired = isOrganizationParentRequired(form.unitType);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('workflow:unsaved-change', { detail: isDirty }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('workflow:unsaved-change', { detail: false }),
      );
    };
  }, [isDirty]);

  useEffect(() => {
    if (!formError) return;
    const timeoutId = window.setTimeout(() => setFormError(''), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [formError]);

  async function loadInitialOptions() {
    setIsLoadingJobTitles(true);
    setJobTitlesError('');
    try {
      const [titles, units, managers] = await Promise.all([
        getActivePositionCatalogFromApi(),
        getDepartmentsFromApi(),
        getOrganizationManagerOptionsFromApi(),
      ]);
      setJobTitles(titles);
      setDepartments(units.filter((unit) => unit.isActive));
      setManagerOptions(managers);
    } catch {
      setJobTitlesError(
        'Không thể tải dữ liệu cơ cấu tổ chức và chức danh đang hoạt động.',
      );
    } finally {
      setIsLoadingJobTitles(false);
    }
  }

  // Initial server synchronization for organization tree & job titles.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadInitialOptions(); }, []);

  useEffect(() => {
    if (!isJobTitleDialogOpen) return;
    dialogCloseRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) setIsJobTitleDialogOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isJobTitleDialogOpen, isSaving]);

  function updateField(field: 'name' | 'code', value: string) {
    const nextValue = field === 'code' ? value.toUpperCase() : value;
    const nextForm = { ...form, [field]: nextValue };
    setForm(nextForm);
    setFormError('');
    if (touched[field]) {
      setErrors((current) => ({
        ...current,
        [field]: validate(nextForm)[field],
      }));
    }
  }

  function validateOnBlur(field: DepartmentField) {
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors((current) => ({ ...current, [field]: validation[field] }));
  }

  function handleParentChange(nextParentValue: string) {
    const nextParentId = nextParentValue || undefined;
    setForm((current) => ({ ...current, parentId: nextParentId }));
    setErrors((current) => ({ ...current, parentId: undefined }));
    setFormError('');
  }

  function requestBack() {
    if (isDirty) setShowLeaveConfirm(true);
    else onBack();
  }

  const positions = useMemo(
    () => jobTitles.filter((item) => form.positionIds?.includes(item.id)),
    [form.positionIds, jobTitles],
  );
  const availablePositions = useMemo(
    () =>
      jobTitles.filter(
        (item) => item.isActive && !form.positionIds?.includes(item.id),
      ),
    [form.positionIds, jobTitles],
  );
  const filteredAvailablePositions = useMemo(() => {
    const query = normalizeSearchText(jobTitleSearch);
    if (!query) return availablePositions;
    return availablePositions.filter((item) =>
      [item.name, item.code].some((text) =>
        normalizeSearchText(text).includes(query),
      ),
    );
  }, [availablePositions, jobTitleSearch]);

  const allAvailableSelected =
    filteredAvailablePositions.length > 0 &&
    filteredAvailablePositions.every((item) =>
      selectedJobTitleIds.includes(item.id),
    );
  const selectedPositions = useMemo(
    () =>
      positions.filter((position) => selectedPositionIds.includes(position.id)),
    [positions, selectedPositionIds],
  );
  const allPositionsSelected =
    positions.length > 0 &&
    positions.every((position) => selectedPositionIds.includes(position.id));

  function openJobTitleDialog() {
    setSelectedJobTitleIds([]);
    setJobTitleSearch('');
    setIsJobTitleDialogOpen(true);
  }

  function toggleJobTitle(jobTitleId: string) {
    setSelectedJobTitleIds((selected) =>
      selected.includes(jobTitleId)
        ? selected.filter((id) => id !== jobTitleId)
        : [...selected, jobTitleId],
    );
  }

  function toggleAllJobTitles() {
    const visibleIds = filteredAvailablePositions.map((item) => item.id);
    if (allAvailableSelected) {
      setSelectedJobTitleIds((current) =>
        current.filter((id) => !visibleIds.includes(id)),
      );
    } else {
      setSelectedJobTitleIds((current) => [
        ...new Set([...current, ...visibleIds]),
      ]);
    }
  }

  function togglePosition(positionId: string) {
    setSelectedPositionIds((selected) =>
      selected.includes(positionId)
        ? selected.filter((id) => id !== positionId)
        : [...selected, positionId],
    );
  }

  function toggleAllPositions() {
    setSelectedPositionIds(
      allPositionsSelected ? [] : positions.map((position) => position.id),
    );
  }

  function applyJobTitles() {
    if (selectedJobTitleIds.length === 0) return;
    setForm((current) => ({
      ...current,
      positionIds: [
        ...new Set([...(current.positionIds ?? []), ...selectedJobTitleIds]),
      ],
    }));
    setSelectedJobTitleIds([]);
    setIsJobTitleDialogOpen(false);
  }

  function removePositions() {
    if (!pendingRemoval?.length) return;
    const positionIds = new Set(pendingRemoval.map((position) => position.id));
    setForm((current) => ({
      ...current,
      positionIds: (current.positionIds ?? []).filter(
        (id) => !positionIds.has(id),
      ),
    }));
    setSelectedPositionIds([]);
    setPendingRemoval(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(form);
    setTouched({ name: true, code: true, parentId: true });
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length > 0) {
      setFormError('Vui lòng nhập đầy đủ các thông tin bắt buộc.');
      return;
    }

    setIsSaving(true);
    try {
      await createDepartmentFromApi({
        ...form,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
      });
      setSuccessMessage('Đã tạo phòng ban.');
      window.setTimeout(onCreated, 650);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        (error.field === 'name' || error.field === 'code')
      ) {
        const field: DepartmentField = error.field;
        const message =
          field === 'code' ? 'Mã phòng ban đã tồn tại.' : error.message;
        setTouched((current) => ({ ...current, [field]: true }));
        setErrors((current) => ({ ...current, [field]: message }));
        setFormError(message);
      } else {
        setFormError(
          error instanceof Error
            ? error.message
            : 'Không thể tạo phòng ban. Vui lòng thử lại.',
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <nav className="detail-breadcrumb" aria-label="Điều hướng phòng ban">
        <button className="breadcrumb-link" type="button" onClick={requestBack}>
          Phòng ban
        </button>
        <span aria-hidden="true">/</span>
        <strong>Tạo phòng ban</strong>
      </nav>
      <section className="department-detail-summary">
        <div className="department-detail-summary-main">
          <h1>Tạo phòng ban</h1>
        </div>
        <div className="department-detail-actions">
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={requestBack}
            disabled={isSaving}
          >
            Hủy
          </button>
          <button
            className="primary-button compact-button"
            type="submit"
            form="department-create-form"
            disabled={isSaving || Boolean(successMessage)}
          >
            {isSaving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </section>

      <SurfaceCard className="department-create-card">
        <div className="department-create-heading">
          <h2>Thông tin phòng ban</h2>
          <p className="department-section-subtitle">
            Thiết lập thông tin, cấp bậc và vị trí của phòng ban trong cơ cấu
            tổ chức.
          </p>
        </div>
        <form
          className="department-create-form"
          id="department-create-form"
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <div className="department-create-field">
            <label
              className="required-field-label"
              htmlFor="department-create-code"
            >
              Mã phòng ban
            </label>
            <input
              id="department-create-code"
              value={form.code}
              onChange={(event) => updateField('code', event.target.value)}
              onBlur={() => validateOnBlur('code')}
              autoCapitalize="characters"
              disabled={isSaving}
              aria-invalid={Boolean(touched.code && errors.code)}
              aria-describedby={
                touched.code && errors.code ? 'department-code-error' : undefined
              }
            />
            {touched.code && errors.code && (
              <small
                id="department-code-error"
                className="department-create-error"
              >
                {errors.code}
              </small>
            )}
          </div>

          <div className="department-create-field">
            <label
              className="required-field-label"
              htmlFor="department-create-name"
            >
              Tên phòng ban
            </label>
            <input
              id="department-create-name"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              onBlur={() => validateOnBlur('name')}
              disabled={isSaving}
              aria-invalid={Boolean(touched.name && errors.name)}
              aria-describedby={
                touched.name && errors.name
                  ? 'department-name-error'
                  : undefined
              }
            />
            {touched.name && errors.name && (
              <small
                id="department-name-error"
                className="department-create-error"
              >
                {errors.name}
              </small>
            )}
          </div>

          <div className="department-create-field">
            <span>Trạng thái</span>
            <FilterSelect
              ariaLabel="Trạng thái phòng ban"
              value={String(form.isActive)}
              options={[
                { value: 'true', label: 'Hoạt động' },
                { value: 'false', label: 'Ngưng hoạt động' },
              ]}
              onChange={(value) => {
                setForm((current) => ({
                  ...current,
                  isActive: value === 'true',
                }));
                setFormError('');
              }}
              disabled={isSaving}
            />
          </div>

          <div className="department-create-field">
            <span className={isParentRequired ? 'required-field-label' : ''}>
              Phòng ban cấp trên
            </span>
            <OrganizationParentSelect
              ariaLabel="Phòng ban cấp trên"
              departments={departments}
              unitType={form.unitType}
              value={form.parentId ?? ''}
              disabled={isSaving}
              invalid={Boolean(touched.parentId && errors.parentId)}
              onChange={handleParentChange}
              onBlur={() => validateOnBlur('parentId')}
            />
            {touched.parentId && errors.parentId && (
              <small className="department-create-error">
                {errors.parentId}
              </small>
            )}
          </div>

          <div className="department-create-field">
            <span>Người quản lý</span>
            <OrganizationManagerSelect
              ariaLabel="Người quản lý"
              options={managerOptions}
              value={form.managerEmployeeId ?? ''}
              disabled={isSaving}
              emptyHint="Chưa có nhân viên đang hoạt động trong hệ thống."
              onChange={(managerId) => {
                setForm((current) => ({
                  ...current,
                  managerEmployeeId: managerId || undefined,
                }));
                setFormError('');
              }}
            />
          </div>

        </form>
      </SurfaceCard>

      <SurfaceCard className="department-position-card">
        <div className="department-position-heading">
          <div className="department-position-title-group">
            <h2>Chức danh áp dụng</h2>
            {positions.length > 0 && (
              <span className="department-position-badge">
                {positions.length}
              </span>
            )}
          </div>
          <div>
            <button
              className="secondary-button compact-button department-assign-job-title-button"
              type="button"
              onClick={openJobTitleDialog}
              disabled={isSaving}
            >
              + Gán chức danh
            </button>
            {selectedPositions.length > 0 && (
              <button
                className="danger-button danger-outline-button compact-button"
                type="button"
                onClick={() => setPendingRemoval(selectedPositions)}
                disabled={isSaving}
              >
                Gỡ ({selectedPositions.length})
              </button>
            )}
          </div>
        </div>
        {positions.length === 0 ? (
          <p className="department-position-empty">
            Chưa có chức danh nào được áp dụng cho phòng ban này.
          </p>
        ) : (
          <DataTable className="admin-table department-position-table">
            <thead>
              <tr>
                <th className="department-position-select">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả chức danh"
                    checked={allPositionsSelected}
                    onChange={toggleAllPositions}
                    disabled={isSaving}
                  />
                </th>
                <th className="department-position-number">#</th>
                <th>Mã chức danh</th>
                <th>Tên chức danh</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position, index) => (
                <tr
                  key={position.id}
                  className={
                    selectedPositionIds.includes(position.id)
                      ? 'is-selected'
                      : ''
                  }
                >
                  <td className="department-position-select">
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${position.name}`}
                      checked={selectedPositionIds.includes(position.id)}
                      onChange={() => togglePosition(position.id)}
                      disabled={isSaving}
                    />
                  </td>
                  <td className="department-position-number">{index + 1}</td>
                  <td>
                    <span className="master-secondary-text">
                      {position.code}
                    </span>
                  </td>
                  <td>
                    <strong className="master-primary-text">
                      {position.name}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SurfaceCard>

      {isJobTitleDialogOpen && (
        <div
          className="modal-backdrop department-job-title-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving)
              setIsJobTitleDialogOpen(false);
          }}
        >
          <section
            className="modal-panel department-job-title-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="department-job-title-dialog-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="department-job-title-dialog-title">Gán chức danh</h2>
              </div>
              <button
                className="icon-button"
                ref={dialogCloseRef}
                type="button"
                aria-label="Đóng hộp thoại"
                onClick={() => setIsJobTitleDialogOpen(false)}
                disabled={isSaving}
              >
                ×
              </button>
            </header>
            <div className="department-job-title-modal-content">
              {isLoadingJobTitles ? (
                <p className="department-job-title-modal-empty">
                  Đang tải chức danh...
                </p>
              ) : jobTitlesError ? (
                <p className="department-job-title-modal-empty">
                  {jobTitlesError}{' '}
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void loadInitialOptions()}
                  >
                    Thử lại
                  </button>
                </p>
              ) : availablePositions.length === 0 ? (
                <p className="department-job-title-modal-empty">
                  Tất cả chức danh đang hoạt động đã được gán cho phòng ban này.
                </p>
              ) : (
                <>
                  <div className="department-job-title-search">
                    <Search size={14} aria-hidden="true" />
                    <input
                      type="text"
                      value={jobTitleSearch}
                      onChange={(event) =>
                        setJobTitleSearch(event.target.value)
                      }
                      placeholder="Tìm theo mã hoặc tên chức danh..."
                      aria-label="Tìm chức danh"
                    />
                    {jobTitleSearch && (
                      <button
                        className="org-parent-search-clear"
                        type="button"
                        aria-label="Xóa tìm kiếm"
                        onClick={() => setJobTitleSearch('')}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {filteredAvailablePositions.length === 0 ? (
                    <p className="department-job-title-modal-empty">
                      Không tìm thấy chức danh phù hợp với từ khóa.
                    </p>
                  ) : (
                    <DataTable className="department-job-title-selection-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              aria-label="Chọn tất cả chức danh"
                              checked={allAvailableSelected}
                              onChange={toggleAllJobTitles}
                              disabled={isSaving}
                            />
                          </th>
                          <th>Mã chức danh</th>
                          <th>Tên chức danh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAvailablePositions.map((jobTitle) => (
                          <tr
                            key={jobTitle.id}
                            className={
                              selectedJobTitleIds.includes(jobTitle.id)
                                ? 'is-selected'
                                : ''
                            }
                          >
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Chọn ${jobTitle.name}`}
                                checked={selectedJobTitleIds.includes(
                                  jobTitle.id,
                                )}
                                onChange={() => toggleJobTitle(jobTitle.id)}
                                disabled={isSaving}
                              />
                            </td>
                            <td>
                              <span>{jobTitle.code}</span>
                            </td>
                            <td>
                              <strong>{jobTitle.name}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  )}
                </>
              )}
            </div>
            <footer className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsJobTitleDialogOpen(false)}
                disabled={isSaving}
              >
                Hủy
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={applyJobTitles}
                disabled={selectedJobTitleIds.length === 0 || isSaving}
              >
                Áp dụng
                {selectedJobTitleIds.length
                  ? ` (${selectedJobTitleIds.length})`
                  : ''}
              </button>
            </footer>
          </section>
        </div>
      )}

      {showLeaveConfirm && (
        <ConfirmDialog
          title="Chưa lưu thay đổi"
          description="Thông tin phòng ban đang nhập sẽ bị hủy nếu bạn rời khỏi trang."
          confirmLabel="Rời khỏi trang"
          tone="danger"
          onCancel={() => setShowLeaveConfirm(false)}
          onConfirm={onBack}
        />
      )}
      {pendingRemoval && (
        <ConfirmDialog
          title="Gỡ chức danh"
          description={`Bạn có chắc chắn muốn gỡ ${pendingRemoval.length} chức danh đã chọn?`}
          confirmLabel="Gỡ"
          tone="danger"
          onCancel={() => setPendingRemoval(null)}
          onConfirm={removePositions}
          compact
        />
      )}
      {formError && (
        <div className="toast-message toast-error" role="alert">
          {formError}
        </div>
      )}
      {successMessage && (
        <div className="toast-message" role="status">
          {successMessage}
        </div>
      )}
    </>
  );
}
