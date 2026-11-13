import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { ApiError, resolveApiAssetUrl } from '../services/api-client';
import {
  getEmployeePage,
  type EmployeePagination,
} from '../services/employees.service';
import {
  applyDepartmentJobTitlesFromApi,
  deleteDepartmentFromApi,
  getActivePositionCatalogFromApi,
  getDepartmentAuditLogs,
  getDepartmentBasicByIdFromApi,
  getDepartmentPositionsFromApi,
  getDepartmentsFromApi,
  getOrganizationManagerOptionsFromApi,
  removeDepartmentPositionsFromApi,
  updateDepartmentFromApi,
  type DepartmentAuditLog,
} from '../services/master-data.service';
import type {
  DepartmentPreview,
  JobTitlePreview,
  OrganizationManagerOption,
  OrganizationUnitType,
} from '../types/master-data';
import type { Employee } from '../types/employees';
import {
  auditChangeDetails,
  auditValue,
  formatAuditSentence,
} from '../utils/audit-display';
import {
  formatDateTime as dateTime,
  normalizeSearchText,
} from '../utils/formatters';
import { isOrganizationParentRequired } from '../utils/organization-tree';
import { ErrorState, LoadingState } from './DataStates';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { DataTable, EmptyTableRow } from './ui/DataTable';
import { FilterSelect } from './ui/FilterSelect';
import { DepartmentStatusBadge } from './ui/MasterDataStatusBadge';
import { OrganizationManagerSelect } from './ui/OrganizationManagerSelect';
import { OrganizationParentSelect } from './ui/OrganizationParentSelect';
import { SurfaceCard } from './ui/SurfaceCard';
import { TablePagination } from './ui/TablePagination';

interface DepartmentDetailPageProps {
  departmentId: string;
  currentUserId: string;
  canViewEmployees: boolean;
  onBack: () => void;
  onDeleted: () => void;
  onOpenEmployee: (employeeId: string) => void;
}

type EmployeePageSize = 5 | 10 | 20;
const employeePageSizes: EmployeePageSize[] = [5, 10, 20];
const workUnitTypes = new Set<OrganizationUnitType>([
  'COMPANY',
  'HEADQUARTERS',
  'REGION',
  'STORE',
]);

function DepartmentEmployeeAvatar({ employee }: { employee: Employee }) {
  const [hasImageError, setHasImageError] = useState(false);
  const avatarUrl =
    employee.avatarUrl && !hasImageError
      ? resolveApiAssetUrl(employee.avatarUrl)
      : '';

  return avatarUrl ? (
    <img
      className="department-employee-avatar"
      src={avatarUrl}
      alt=""
      onError={() => setHasImageError(true)}
    />
  ) : (
    <span
      className="department-employee-avatar department-employee-avatar-fallback"
      aria-hidden="true"
    >
      {employee.fullName.trim().charAt(0).toUpperCase() || 'N'}
    </span>
  );
}

const INVALID_PARENT_MESSAGE =
  "Bạn đang tạo một vòng lặp trong các bản ghi 'Phòng ban'. Một bản ghi không thể là phần tử phụ của chính nó hoặc của một trong các phần tử phụ của nó. Vui lòng chọn một phần tử chính khác.";

function departmentChangeDetails(
  log: DepartmentAuditLog,
  departments: DepartmentPreview[],
  managers: OrganizationManagerOption[],
): string[] {
  const departmentName = (value: unknown) => {
    if (!value) return 'Không có';
    return (
      departments.find((item) => item.id === String(value))?.name ??
      'Phòng ban khác'
    );
  };
  const managerName = (value: unknown) => {
    if (!value) return 'Chưa phân công';
    const manager = managers.find((item) => item.id === String(value));
    return manager
      ? `${manager.employeeCode} - ${manager.fullName}`
      : 'Nhân viên khác';
  };
  return auditChangeDetails(log.changes, [
    { key: 'code', label: 'Mã phòng ban' },
    { key: 'name', label: 'Tên phòng ban' },
    {
      key: 'parentId',
      label: 'Phòng ban cấp trên',
      format: departmentName,
    },
    {
      key: 'managerEmployeeId',
      label: 'Người quản lý',
      format: managerName,
    },
    {
      key: 'isActive',
      label: 'Trạng thái',
      format: (value) =>
        value === true
          ? 'Hoạt động'
          : value === false
            ? 'Ngưng hoạt động'
            : auditValue(value),
    },
  ]);
}

export function DepartmentDetailPage({
  departmentId,
  currentUserId,
  canViewEmployees,
  onBack,
  onDeleted,
  onOpenEmployee,
}: DepartmentDetailPageProps) {
  const [department, setDepartment] = useState<DepartmentPreview | null>(null);
  const [positions, setPositions] = useState<JobTitlePreview[]>([]);
  const [catalog, setCatalog] = useState<JobTitlePreview[]>([]);
  const [logs, setLogs] = useState<DepartmentAuditLog[]>([]);
  const [visibleLogs, setVisibleLogs] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftIsActive, setDraftIsActive] = useState(true);
  const [draftUnitType, setDraftUnitType] =
    useState<OrganizationUnitType>('DEPARTMENT');
  const [draftParentId, setDraftParentId] = useState('');
  const [draftManagerEmployeeId, setDraftManagerEmployeeId] = useState('');
  const [allDepartments, setAllDepartments] = useState<DepartmentPreview[]>([]);
  const [managerOptions, setManagerOptions] = useState<
    OrganizationManagerOption[]
  >([]);
  const [codeError, setCodeError] = useState('');
  const [nameError, setNameError] = useState('');
  const [parentError, setParentError] = useState('');
  const [hasInvalidParentSelection, setHasInvalidParentSelection] =
    useState(false);
  const [showInvalidParentWarning, setShowInvalidParentWarning] =
    useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isJobTitleDialogOpen, setIsJobTitleDialogOpen] = useState(false);
  const [jobTitleSearch, setJobTitleSearch] = useState('');
  const [selectedJobTitleIds, setSelectedJobTitleIds] = useState<string[]>([]);
  const [selectedPositionIds, setSelectedPositionIds] = useState<string[]>([]);
  const [pendingRemoval, setPendingRemoval] = useState<
    JobTitlePreview[] | null
  >(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [isErrorNotice, setIsErrorNotice] = useState(false);
  const [departmentEmployees, setDepartmentEmployees] = useState<Employee[]>(
    [],
  );
  const [employeePagination, setEmployeePagination] =
    useState<EmployeePagination>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [employeePage, setEmployeePage] = useState(1);
  const [employeePageSize, setEmployeePageSize] =
    useState<EmployeePageSize>(10);
  const [areEmployeesLoading, setAreEmployeesLoading] = useState(false);
  const [hasEmployeeLoadError, setHasEmployeeLoadError] = useState(false);
  const [employeeRefreshVersion, setEmployeeRefreshVersion] = useState(0);
  const [isInfoCollapsed, setIsInfoCollapsed] = useState(false);
  const [isPositionsCollapsed, setIsPositionsCollapsed] = useState(false);
  const [isEmployeesCollapsed, setIsEmployeesCollapsed] = useState(false);
  const dialogCloseRef = useRef<HTMLButtonElement>(null);
  const employeeRequestVersion = useRef(0);

  function showToast(message: string, isError = false) {
    setIsErrorNotice(isError);
    setNotice(message);
  }

  async function refreshAppliedPositions(): Promise<void> {
    const [assigned, activeCatalog, auditLogs] = await Promise.all([
      getDepartmentPositionsFromApi(departmentId),
      getActivePositionCatalogFromApi(),
      getDepartmentAuditLogs(departmentId).catch(() => []),
    ]);
    setPositions(assigned);
    setCatalog(activeCatalog);
    setLogs(auditLogs);
    setVisibleLogs(5);
  }

  async function load() {
    setIsLoading(true);
    try {
      const [departmentResult, units, managers] = await Promise.all([
        getDepartmentBasicByIdFromApi(departmentId),
        getDepartmentsFromApi(),
        getOrganizationManagerOptionsFromApi().catch(() => []),
      ]);
      setDepartment(departmentResult);
      setAllDepartments(units);
      setManagerOptions(managers);
      setDraftCode(departmentResult.code);
      setDraftName(departmentResult.name);
      setDraftIsActive(departmentResult.isActive);
      setDraftUnitType(departmentResult.unitType);
      setDraftParentId(departmentResult.parentId ?? '');
      setDraftManagerEmployeeId(departmentResult.managerEmployeeId ?? '');
      await refreshAppliedPositions();
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  // Reload detail state when the route identity changes.
  // oxlint-disable-next-line react/set-state-in-effect react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [departmentId]);

  useEffect(() => {
    if (!department || !canViewEmployees) return;
    const currentRequest = ++employeeRequestVersion.current;
    // Loading flags intentionally synchronize with the active server request.
    // oxlint-disable-next-line react/set-state-in-effect
    setAreEmployeesLoading(true);
    // oxlint-disable-next-line react/set-state-in-effect
    setHasEmployeeLoadError(false);
    const scopeQuery = workUnitTypes.has(department.unitType)
      ? { workUnitId: department.id }
      : { departmentId: department.id };
    void getEmployeePage({
      ...scopeQuery,
      sortBy: 'fullName',
      sortOrder: 'asc',
      page: employeePage,
      limit: employeePageSize,
    })
      .then((result) => {
        if (currentRequest !== employeeRequestVersion.current) return;
        const totalPages = Math.max(1, result.pagination.totalPages);
        if (employeePage > totalPages) {
          setEmployeePage(totalPages);
          return;
        }
        setDepartmentEmployees(result.data);
        setEmployeePagination({ ...result.pagination, totalPages });
      })
      .catch(() => {
        if (currentRequest === employeeRequestVersion.current)
          setHasEmployeeLoadError(true);
      })
      .finally(() => {
        if (currentRequest === employeeRequestVersion.current)
          setAreEmployeesLoading(false);
      });
  }, [
    canViewEmployees,
    department,
    employeePage,
    employeePageSize,
    employeeRefreshVersion,
  ]);

  useEffect(() => {
    // A different department always starts from the first employee page.
    // oxlint-disable-next-line react/set-state-in-effect
    setEmployeePage(1);
  }, [departmentId]);

  const normalizedDraftCode = draftCode.trim().toUpperCase();
  const isCodeValid = /^[A-Z0-9_]+$/.test(normalizedDraftCode);
  const isParentRequired = isOrganizationParentRequired(draftUnitType);
  const hasUnsavedChanges = Boolean(
    department &&
      isEditing &&
      (normalizedDraftCode !== department.code ||
        draftName.trim() !== department.name ||
        draftIsActive !== department.isActive ||
        draftUnitType !== department.unitType ||
        draftParentId !== (department.parentId ?? '') ||
        draftManagerEmployeeId !== (department.managerEmployeeId ?? '')),
  );

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('workflow:unsaved-change', {
        detail: hasUnsavedChanges,
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('workflow:unsaved-change', { detail: false }),
      );
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!isJobTitleDialogOpen) return;
    dialogCloseRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) setIsJobTitleDialogOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isJobTitleDialogOpen, isSaving]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const availablePositions = useMemo(
    () =>
      catalog.filter(
        (item) =>
          item.isActive &&
          !positions.some((assigned) => assigned.code === item.code),
      ),
    [catalog, positions],
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

  function resetDraftFromDepartment(target: DepartmentPreview) {
    setDraftCode(target.code);
    setDraftName(target.name);
    setDraftIsActive(target.isActive);
    setDraftUnitType(target.unitType);
    setDraftParentId(target.parentId ?? '');
    setDraftManagerEmployeeId(target.managerEmployeeId ?? '');
    setCodeError('');
    setNameError('');
    setParentError('');
    setHasInvalidParentSelection(false);
    setShowInvalidParentWarning(false);
  }

  function requestBack() {
    if (hasUnsavedChanges) setPendingNavigation(true);
    else onBack();
  }

  function discardAndBack() {
    if (department) resetDraftFromDepartment(department);
    setIsEditing(false);
    setPendingNavigation(false);
    onBack();
  }

  function handleDraftParentChange(nextParentId: string) {
    setDraftParentId(nextParentId);
    setParentError('');
    setHasInvalidParentSelection(false);
  }

  function handleInvalidParentSelection() {
    setParentError(INVALID_PARENT_MESSAGE);
    setHasInvalidParentSelection(true);
    setShowInvalidParentWarning(true);
  }

  async function saveDepartment() {
    if (!department) return;
    if (hasInvalidParentSelection) {
      setShowInvalidParentWarning(true);
      return;
    }
    if (!isCodeValid) {
      setCodeError(
        normalizedDraftCode
          ? 'Mã phòng ban chỉ dùng A-Z, 0-9 và dấu gạch dưới.'
          : 'Mã phòng ban không được để trống.',
      );
      if (!normalizedDraftCode) {
        showToast('Vui lòng nhập đầy đủ các thông tin bắt buộc.', true);
      }
      return;
    }
    if (!draftName.trim()) {
      setNameError('Tên phòng ban là bắt buộc.');
      showToast('Vui lòng nhập đầy đủ các thông tin bắt buộc.', true);
      return;
    }
    if (isParentRequired && !draftParentId) {
      setParentError('Vui lòng chọn phòng ban cấp trên.');
      showToast('Vui lòng chọn phòng ban cấp trên phù hợp.', true);
      return;
    }
    if (!hasUnsavedChanges) return;

    setCodeError('');
    setNameError('');
    setParentError('');
    setIsSaving(true);
    try {
      const code = normalizedDraftCode;
      const name = draftName.trim();
      await updateDepartmentFromApi(department.id, {
        code,
        name,
        isActive: draftIsActive,
        unitType: draftUnitType,
        parentId: draftParentId || null,
        managerEmployeeId: draftManagerEmployeeId || null,
      });
      const parent = allDepartments.find((item) => item.id === draftParentId);
      const manager = managerOptions.find(
        (item) => item.id === draftManagerEmployeeId,
      );
      const updatedUnit: DepartmentPreview = {
        ...department,
        code,
        name,
        isActive: draftIsActive,
        unitType: draftUnitType,
        parentId: draftParentId || undefined,
        parentName: parent?.name,
        managerEmployeeId: draftManagerEmployeeId || undefined,
        managerEmployeeCode: manager?.employeeCode,
        managerName: manager?.fullName,
      };
      setDepartment(updatedUnit);
      setAllDepartments((current) =>
        current.map((item) =>
          item.id === updatedUnit.id ? updatedUnit : item,
        ),
      );
      setDraftCode(code);
      setDraftName(name);
      setIsEditing(false);
      showToast('Đã lưu thay đổi thông tin phòng ban.');
      setLogs(await getDepartmentAuditLogs(departmentId).catch(() => logs));
      setVisibleLogs(5);
    } catch (error) {
      let message =
        error instanceof Error
          ? error.message
          : 'Không thể lưu thay đổi thông tin phòng ban.';
      if (error instanceof ApiError && error.field === 'code') {
        message = 'Mã phòng ban đã tồn tại.';
        setCodeError(message);
      } else if (error instanceof ApiError && error.field === 'name') {
        setNameError(message);
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        message.toLowerCase().includes('mã')
      ) {
        message = 'Mã phòng ban đã tồn tại.';
        setCodeError(message);
      }
      showToast(message, true);
    } finally {
      setIsSaving(false);
    }
  }

  async function startEditing() {
    try {
      const [managers, units] = await Promise.all([
        getOrganizationManagerOptionsFromApi(),
        getDepartmentsFromApi(),
      ]);
      setManagerOptions(managers);
      setAllDepartments(units);
      setHasInvalidParentSelection(false);
      setShowInvalidParentWarning(false);
      setIsEditing(true);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Không thể tải danh sách người quản lý.',
        true,
      );
    }
  }

  function openJobTitleDialog() {
    setNotice('');
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

  async function applyJobTitles() {
    if (selectedJobTitleIds.length === 0) return;
    setIsSaving(true);
    try {
      await applyDepartmentJobTitlesFromApi(departmentId, selectedJobTitleIds);
      await refreshAppliedPositions();
      setSelectedJobTitleIds([]);
      setIsJobTitleDialogOpen(false);
      window.requestAnimationFrame(() =>
        showToast('Gán chức danh thành công.'),
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Không thể áp dụng chức danh cho phòng ban.',
        true,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removePositions() {
    if (!pendingRemoval || pendingRemoval.length === 0) return;
    const removalCount = pendingRemoval.length;
    setIsSaving(true);
    try {
      await removeDepartmentPositionsFromApi(
        departmentId,
        pendingRemoval.map((position) => position.id),
      );
      setPendingRemoval(null);
      setSelectedPositionIds([]);
      await refreshAppliedPositions();
      showToast(`Đã gỡ ${removalCount} chức danh khỏi phòng ban.`);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Không thể gỡ chức danh khỏi phòng ban.',
        true,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteDepartment() {
    setIsSaving(true);
    try {
      await deleteDepartmentFromApi(departmentId);
      onDeleted();
    } catch (error) {
      setShowDeleteConfirm(false);
      showToast(
        error instanceof Error
          ? error.message
          : 'Không thể xóa phòng ban. Vui lòng thử lại.',
        true,
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <LoadingState />;
  if (hasError || !department)
    return <ErrorState onRetry={() => void load()} />;

  return (
    <>
      <nav className="detail-breadcrumb" aria-label="Điều hướng phòng ban">
        <button className="breadcrumb-link" type="button" onClick={requestBack}>
          Phòng ban
        </button>
        <span aria-hidden="true">/</span>
        <strong>{department.name}</strong>
      </nav>
      <section className="department-detail-summary">
        <div className="department-detail-summary-main">
          <h1>{department.name}</h1>
        </div>
        <div className="department-detail-actions">
          {isEditing ? (
            <>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => {
                  resetDraftFromDepartment(department);
                  setSelectedPositionIds([]);
                  setSelectedJobTitleIds([]);
                  setIsJobTitleDialogOpen(false);
                  setIsEditing(false);
                }}
                disabled={isSaving}
              >
                Hủy
              </button>
              <button
                className="primary-button compact-button"
                type="button"
                onClick={() => void saveDepartment()}
                disabled={
                  !hasUnsavedChanges || hasInvalidParentSelection || isSaving
                }
              >
                {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </>
          ) : (
            <>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={requestBack}
                disabled={isSaving}
              >
                ← Quay lại
              </button>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => void startEditing()}
                disabled={isSaving}
              >
                Chỉnh sửa
              </button>
              <button
                className="danger-outline-button compact-button department-delete-button"
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving}
              >
                Xóa
              </button>
            </>
          )}
        </div>
      </section>

      <SurfaceCard className="department-info-card">
        <div
          className={`department-info-heading${isInfoCollapsed ? ' is-collapsed' : ''}`}
        >
          <h2>Thông tin phòng ban</h2>
          <button
            className="department-card-toggle"
            type="button"
            aria-expanded={!isInfoCollapsed}
            aria-controls="department-general-information"
            onClick={() => setIsInfoCollapsed((current) => !current)}
          >
            {isInfoCollapsed ? 'Mở rộng' : 'Thu gọn'}
            {isInfoCollapsed ? (
              <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <ChevronUp size={15} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
        </div>
        {!isInfoCollapsed && (
        <div id="department-general-information" className="department-info-grid">
          <div className="department-info-field">
            <span
              className={
                isEditing
                  ? 'profile-field-label required-field-label'
                  : 'profile-field-label'
              }
            >
              Mã phòng ban
            </span>
            {isEditing ? (
              <>
                <input
                  className="department-info-input"
                  value={draftCode}
                  onChange={(event) => {
                    setDraftCode(event.target.value.toUpperCase());
                    setCodeError('');
                  }}
                  aria-label="Mã phòng ban"
                  aria-invalid={Boolean(codeError) || !isCodeValid}
                  disabled={isSaving}
                  required
                />
                {(codeError || !isCodeValid) && (
                  <small className="department-info-error">
                    {codeError ||
                      (normalizedDraftCode
                        ? 'Mã phòng ban chỉ dùng A-Z, 0-9 và dấu gạch dưới.'
                        : 'Mã phòng ban không được để trống.')}
                  </small>
                )}
              </>
            ) : (
              <span className="department-info-value department-info-code">
                {department.code}
              </span>
            )}
          </div>

          <div className="department-info-field">
            <span
              className={
                isEditing
                  ? 'profile-field-label required-field-label'
                  : 'profile-field-label'
              }
            >
              Tên phòng ban
            </span>
            {isEditing ? (
              <>
                <input
                  className="department-info-input"
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    setNameError('');
                  }}
                  aria-label="Tên phòng ban"
                  aria-invalid={Boolean(nameError) || !draftName.trim()}
                  disabled={isSaving}
                  required
                />
                {(nameError || !draftName.trim()) && (
                  <small className="department-info-error">
                    {nameError || 'Tên phòng ban là bắt buộc.'}
                  </small>
                )}
              </>
            ) : (
              <span className="department-info-value">{department.name}</span>
            )}
          </div>

          <div className="department-info-field">
            <span className="profile-field-label">Trạng thái</span>
            {isEditing ? (
              <FilterSelect
                ariaLabel="Trạng thái phòng ban"
                value={String(draftIsActive)}
                options={[
                  { value: 'true', label: 'Hoạt động' },
                  { value: 'false', label: 'Ngưng hoạt động' },
                ]}
                onChange={(value) => setDraftIsActive(value === 'true')}
                disabled={isSaving}
              />
            ) : (
              <span className="department-info-value">
                <DepartmentStatusBadge isActive={department.isActive} />
              </span>
            )}
          </div>

          <div className="department-info-field">
            <span
              className={
                isEditing && isParentRequired
                  ? 'profile-field-label required-field-label'
                  : 'profile-field-label'
              }
            >
              Phòng ban cấp trên
            </span>
            {isEditing ? (
              <>
                <OrganizationParentSelect
                  ariaLabel="Phòng ban cấp trên"
                  departments={allDepartments}
                  unitType={draftUnitType}
                  value={draftParentId}
                  excludeUnitId={department.id}
                  disabled={isSaving}
                  invalid={Boolean(parentError)}
                  onChange={handleDraftParentChange}
                  onInvalidSelection={handleInvalidParentSelection}
                />
                {parentError && (
                  <small className="department-info-error">{parentError}</small>
                )}
              </>
            ) : (
              <span className="department-info-value">
                {department.parentName ? (
                  department.parentName
                ) : department.unitType === 'COMPANY' ? (
                  <span className="department-info-muted">
                    Không có
                  </span>
                ) : (
                  <span className="department-info-muted">Chưa thiết lập</span>
                )}
              </span>
            )}
          </div>

          <div className="department-info-field">
            <span className="profile-field-label">Người quản lý</span>
            {isEditing ? (
              <OrganizationManagerSelect
                ariaLabel="Người quản lý"
                  options={managerOptions}
                value={draftManagerEmployeeId}
                disabled={isSaving}
                  emptyHint="Chưa có nhân viên đang hoạt động trong hệ thống."
                onChange={setDraftManagerEmployeeId}
              />
            ) : (
              <span className="department-info-value">
                {department.managerName ? (
                  [department.managerEmployeeCode, department.managerName]
                    .filter(Boolean)
                    .join(' - ')
                ) : (
                  <span className="department-info-muted">Chưa phân công</span>
                )}
              </span>
            )}
          </div>
        </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="department-position-card">
        <div
          className={`department-position-heading${isPositionsCollapsed ? ' is-collapsed' : ''}`}
        >
          <div className="department-position-title-group">
            <h2>Chức danh</h2>
          </div>
          <div className="department-card-heading-actions">
            {isEditing && !isPositionsCollapsed && (
              <>
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
              </>
            )}
            <button
              className="department-card-toggle"
              type="button"
              aria-expanded={!isPositionsCollapsed}
              aria-controls="department-applied-positions"
              onClick={() =>
                setIsPositionsCollapsed((current) => !current)
              }
            >
              {isPositionsCollapsed ? 'Mở rộng' : 'Thu gọn'}
              {isPositionsCollapsed ? (
                <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <ChevronUp size={15} strokeWidth={1.8} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {!isPositionsCollapsed && (
        <div id="department-applied-positions">
        {positions.length === 0 ? (
          <p className="department-position-empty">
            Chưa có chức danh nào được áp dụng cho phòng ban này.
          </p>
        ) : (
          <DataTable className="admin-table department-position-table">
            <thead>
              <tr>
                {isEditing && (
                  <th className="department-position-select">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả chức danh"
                      checked={allPositionsSelected}
                      onChange={toggleAllPositions}
                      disabled={isSaving}
                    />
                  </th>
                )}
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
                    isEditing && selectedPositionIds.includes(position.id)
                      ? 'is-selected'
                      : ''
                  }
                >
                  {isEditing && (
                    <td className="department-position-select">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${position.name}`}
                        checked={selectedPositionIds.includes(position.id)}
                        onChange={() => togglePosition(position.id)}
                        disabled={isSaving}
                      />
                    </td>
                  )}
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
        </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="department-employee-card">
        <div
          className={`department-employee-heading${isEmployeesCollapsed ? ' is-collapsed' : ''}`}
        >
          <div>
            <h2>Danh sách nhân sự</h2>
            {canViewEmployees &&
              !areEmployeesLoading &&
              !hasEmployeeLoadError && (
              <span>{employeePagination.total} nhân sự</span>
              )}
          </div>
          <button
            className="department-card-toggle"
            type="button"
            aria-expanded={!isEmployeesCollapsed}
            aria-controls="department-employees"
            onClick={() => setIsEmployeesCollapsed((current) => !current)}
          >
            {isEmployeesCollapsed ? 'Mở rộng' : 'Thu gọn'}
            {isEmployeesCollapsed ? (
              <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <ChevronUp size={15} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
        </div>
        {!isEmployeesCollapsed && (
        <div id="department-employees">
        {!canViewEmployees ? (
          <p className="department-employee-state">
            Bạn không có quyền xem danh sách nhân sự của phòng ban này.
          </p>
        ) : areEmployeesLoading ? (
          <p className="department-employee-state">
            Đang tải danh sách nhân sự...
          </p>
        ) : hasEmployeeLoadError ? (
          <div className="department-employee-state department-employee-error">
            <span>Không thể tải danh sách nhân sự.</span>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => setEmployeeRefreshVersion((value) => value + 1)}
            >
              Thử lại
            </button>
          </div>
        ) : (
          <>
            <DataTable className="department-employee-table">
              <thead>
                <tr>
                  <th>Họ và tên</th>
                  <th>Mã nhân viên</th>
                  <th>Chức danh</th>
                </tr>
              </thead>
              <tbody>
                {departmentEmployees.length === 0 ? (
                  <EmptyTableRow
                    colSpan={3}
                    message="Chưa có nhân sự nào được phân công vào phòng ban này."
                  />
                ) : (
                  departmentEmployees.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <button
                          className="department-employee-link"
                          type="button"
                          onClick={() => onOpenEmployee(employee.id)}
                        >
                          <DepartmentEmployeeAvatar employee={employee} />
                          <strong>{employee.fullName}</strong>
                        </button>
                      </td>
                      <td>
                        <button
                          className="master-code-link"
                          type="button"
                          onClick={() => onOpenEmployee(employee.id)}
                        >
                          {employee.employeeCode}
                        </button>
                      </td>
                      <td>{employee.position || 'Chưa thiết lập'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </DataTable>
            {employeePagination.total > 0 && (
              <TablePagination
                currentPage={employeePagination.page}
                totalPages={employeePagination.totalPages}
                onPrevious={() => setEmployeePage((value) => value - 1)}
                onNext={() => setEmployeePage((value) => value + 1)}
                onPageChange={setEmployeePage}
                rangeLabel={`${(employeePagination.page - 1) * employeePageSize + 1}–${Math.min(employeePagination.page * employeePageSize, employeePagination.total)} trên ${employeePagination.total} nhân sự`}
                pageSize={employeePageSize}
                pageSizes={employeePageSizes}
                onPageSizeChange={(value) => {
                  setEmployeePageSize(value as EmployeePageSize);
                  setEmployeePage(1);
                }}
              />
            )}
          </>
        )}
        </div>
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
              {availablePositions.length === 0 ? (
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
                onClick={() => void applyJobTitles()}
                disabled={selectedJobTitleIds.length === 0 || isSaving}
              >
                {isSaving
                  ? 'Đang áp dụng...'
                  : `Áp dụng${selectedJobTitleIds.length ? ` (${selectedJobTitleIds.length})` : ''}`}
              </button>
            </footer>
          </section>
        </div>
      )}

      <section className="employee-activity-section department-audit-section">
        <div className="employee-activity-heading">
          <div>
            <h2>Lịch sử</h2>
          </div>
        </div>
        <SurfaceCard className="employee-activity-card">
          {logs.length === 0 ? (
            <p className="employee-activity-empty">
              Chưa có lịch sử liên quan đến phòng ban này.
            </p>
          ) : (
            <>
              <div className="employee-activity-list">
                {logs.slice(0, visibleLogs).map((log) => {
                  const changeDetails = departmentChangeDetails(
                    log,
                    allDepartments,
                    managerOptions,
                  );
                  return (
                    <article
                      className="activity-log-row"
                      key={
                        log._id ?? log.id ?? `${log.occurredAt}-${log.action}`
                      }
                    >
                      <div>
                        <strong>
                          {formatAuditSentence({
                            action: log.action,
                            actor: log.actor,
                            currentUserId,
                            resourceType: 'DEPARTMENT',
                            resourceName: department.name,
                          })}
                        </strong>
                        {changeDetails.length > 0 && (
                          <p>Thay đổi: {changeDetails.join(' · ')}</p>
                        )}
                      </div>
                      <time>{dateTime(log.occurredAt)}</time>
                    </article>
                  );
                })}
              </div>
              {visibleLogs < logs.length && (
                <div className="employee-activity-more">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setVisibleLogs((count) => count + 5)}
                  >
                    Xem thêm
                  </button>
                </div>
              )}
            </>
          )}
        </SurfaceCard>
      </section>

      {notice && (
        <div
          className={`toast-message${isErrorNotice ? ' toast-error' : ''}`}
          role={isErrorNotice ? 'alert' : 'status'}
        >
          {notice}
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Xóa phòng ban"
          description="Bạn có chắc chắn muốn xóa phòng ban này?"
          confirmLabel="Xóa"
          confirmingLabel="Đang xóa..."
          tone="danger"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => void deleteDepartment()}
          isConfirming={isSaving}
          compact
        />
      )}
      {showInvalidParentWarning && (
        <ConfirmDialog
          title="Thao tác không hợp lệ"
          description={INVALID_PARENT_MESSAGE}
          confirmLabel="Đã hiểu"
          onCancel={() => setShowInvalidParentWarning(false)}
          onConfirm={() => setShowInvalidParentWarning(false)}
          hideCancel
          compact
        />
      )}
      {pendingRemoval && (
        <ConfirmDialog
          title="Gỡ chức danh"
          description={`Bạn có chắc chắn muốn gỡ ${pendingRemoval.length} chức danh đã chọn?`}
          confirmLabel="Gỡ"
          tone="danger"
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => void removePositions()}
          isConfirming={isSaving}
          compact
        />
      )}
      {pendingNavigation && (
        <ConfirmDialog
          title="Chưa lưu thay đổi"
          description="Thông tin phòng ban đang chỉnh sửa chưa được lưu. Bạn có chắc chắn muốn rời khỏi trang?"
          confirmLabel="Rời khỏi trang"
          variant="discard-changes"
          onCancel={() => setPendingNavigation(false)}
          onConfirm={discardAndBack}
        />
      )}
    </>
  );
}
