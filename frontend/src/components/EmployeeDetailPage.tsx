import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUserById } from "../services/administration.service";
import {
  getEmployeeAuditLogs,
  type EmployeeAuditLog,
} from "../services/employee-audit.service";
import {
  getActiveEmployeeOptions,
  getEmployeeById,
  updateEmployee,
} from "../services/employees.service";
import { getReferenceData } from "../services/reference-data.service";
import { getDepartmentPositionsFromApi } from "../services/master-data.service";
import { ApiError, resolveApiAssetUrl } from "../services/api-client";
import type { UserRole } from "../types/auth";
import type {
  Employee,
  EmployeeFormValues,
  EmploymentType,
} from "../types/employees";
import type { ReferenceData } from "../types/reference-data";
import type { JobTitlePreview } from "../types/master-data";
import {
  functionalDepartmentOptions,
  suggestedManagerId,
  workUnitLabel,
  workUnitOptions,
} from "../utils/employee-organization";
import {
  auditActorLabel,
  auditChangeDetails,
  auditValue,
} from "../utils/audit-display";
import {
  formatDate,
  formatDateTime as dateTime,
  formatRole,
} from "../utils/formatters";
import { ActivityStatusBadge } from "./StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "./DataStates";
import { DatePicker } from "./ui/DatePicker";
import { FilterSelect } from "./ui/FilterSelect";
import { ProfileField } from "./ui/ProfileField";
import { SurfaceCard } from "./ui/SurfaceCard";

interface Props {
  employeeId: string;
  currentUserId: string;
  onBack: () => void;
  onCreateAccount: (employeeId: string) => void;
  onOpenUser: (userId: string) => void;
  onCurrentUserUpdated: () => void;
  canUpdateEmployee: boolean;
  canChangeEmployeeStatus: boolean;
}
type Tab = "OVERVIEW" | "ORGANIZATION" | "ACCOUNT";
type Toast = { message: string; tone: "success" | "error" };
interface EmployeeFieldErrors {
  fullName?: string;
  workEmail?: string;
  workUnitId?: string;
  departmentId?: string;
  positionId?: string;
}
type EmployeeRequiredField = keyof EmployeeFieldErrors;

function validateEmployee(form: EmployeeFormValues): EmployeeFieldErrors {
  const email = form.workEmail.trim();
  return {
    fullName: form.fullName.trim()
      ? undefined
      : "Họ và tên không được để trống.",
    workEmail: !email
      ? "Email không được để trống."
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? undefined
        : "Email không hợp lệ.",
    workUnitId: form.workUnitId
      ? undefined
      : "Đơn vị làm việc không được để trống.",
    departmentId: form.departmentId
      ? undefined
      : "Phòng ban không được để trống.",
    positionId: form.positionId ? undefined : "Chức danh không được để trống.",
  };
}

function toForm(employee: Employee): EmployeeFormValues {
  return {
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    workEmail: employee.workEmail,
    department: employee.department,
    departmentId: employee.departmentId,
    workUnit: employee.workUnitName ?? employee.workUnit,
    workUnitId: employee.workUnitId,
    position: employee.position,
    positionId: employee.positionId,
    phone: employee.phone,
    address: employee.address,
    dateOfBirth: employee.dateOfBirth,
    hiredAt: employee.hiredAt,
    employmentType: employee.employmentType ?? "FULL_TIME",
    managerId: employee.managerId,
    isActive: employee.isActive,
  };
}
function actor(log: EmployeeAuditLog, currentUserId: string) {
  return auditActorLabel(log.actor, currentUserId);
}
function description(log: EmployeeAuditLog, currentUserId: string) {
  const name = actor(log, currentUserId);
  const descriptions: Record<string, string> = {
    "EMPLOYEE.CREATED": `${name} đã tạo mới hồ sơ nhân viên`,
    "EMPLOYEE.UPDATED": `${name} đã chỉnh sửa thông tin nhân viên`,
    "EMPLOYEE.ACTIVATED": `${name} đã chuyển nhân viên sang hoạt động`,
    "EMPLOYEE.DEACTIVATED": `${name} đã chuyển nhân viên sang ngưng hoạt động`,
    "EMPLOYEE.AVATAR_UPDATED": `${name} đã cập nhật ảnh đại diện nhân viên`,
    "USER.EMPLOYEE_LINKED": `${name} đã liên kết tài khoản với nhân viên`,
    "USER.EMPLOYEE_UNLINKED": `${name} đã hủy liên kết tài khoản`,
    "USER.DEACTIVATED": `${name} đã ngưng hoạt động tài khoản`,
  };
  return (
    descriptions[log.action] ?? `${name} đã chỉnh sửa tài khoản người dùng`
  );
}
function displayDate(value: unknown) {
  return typeof value === "string" || value instanceof Date
    ? formatDate(String(value))
    : auditValue(value);
}
function employeeChangeDetails(
  log: EmployeeAuditLog,
  references: ReferenceData | null,
  people: Employee[],
): string[] {
  if (!log.action.startsWith("EMPLOYEE.")) {
    return auditChangeDetails(log.changes, [
      { key: "email", label: "Email đăng nhập" },
      {
        key: "isActive",
        label: "Trạng thái tài khoản",
        format: (value) =>
          value === true
            ? "Hoạt động"
            : value === false
              ? "Ngưng hoạt động"
              : auditValue(value),
      },
      {
        key: "roles",
        label: "Vai trò",
        format: (value) =>
          Array.isArray(value)
            ? value
                .filter((role): role is string => typeof role === "string")
                .map((role) => formatRole(role as UserRole))
                .join(", ")
            : auditValue(value),
      },
    ]);
  }
  const relationName = (
    value: unknown,
    options: Array<{
      _id?: string;
      id?: string;
      name?: string;
      fullName?: string;
    }>,
    fallback: string,
  ) => {
    if (!value) return "Chưa cập nhật";
    const match = options.find(
      (option) => (option._id ?? option.id) === String(value),
    );
    return match?.name ?? match?.fullName ?? fallback;
  };
  return auditChangeDetails(log.changes, [
    { key: "employeeCode", label: "Mã nhân viên" },
    { key: "fullName", label: "Họ và tên" },
    { key: "workEmail", label: "Email công việc" },
    { key: "phone", label: "Điện thoại" },
    { key: "dateOfBirth", label: "Ngày sinh", format: displayDate },
    { key: "hiredAt", label: "Ngày vào làm", format: displayDate },
    {
      key: "workUnitId",
      label: "Đơn vị làm việc",
      format: (value) =>
        relationName(value, references?.departments ?? [], "Đơn vị khác"),
    },
    {
      key: "departmentId",
      label: "Phòng ban",
      format: (value) =>
        relationName(value, references?.departments ?? [], "Phòng ban khác"),
    },
    {
      key: "positionId",
      label: "Chức danh",
      format: (value) =>
        relationName(value, references?.positions ?? [], "Chức danh khác"),
    },
    {
      key: "managerId",
      label: "Quản lý trực tiếp",
      format: (value) => relationName(value, people, "Nhân viên khác"),
    },
    {
      key: "employmentType",
      label: "Loại nhân sự",
      format: (value) =>
        value === "CONTRACT"
          ? "Hợp đồng"
          : value === "INTERN"
            ? "Thực tập"
            : value === "FULL_TIME"
              ? "Chính thức"
              : auditValue(value),
    },
    { key: "address", label: "Địa chỉ" },
    {
      key: "isActive",
      label: "Trạng thái làm việc",
      format: (value) =>
        value === true
          ? "Hoạt động"
          : value === false
            ? "Ngưng hoạt động"
            : auditValue(value),
    },
  ]);
}
export function EmployeeDetailPage({
  employeeId,
  currentUserId,
  onBack,
  onCreateAccount,
  onOpenUser,
  onCurrentUserUpdated,
  canUpdateEmployee,
  canChangeEmployeeStatus,
}: Props) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeFormValues | null>(null);
  const [people, setPeople] = useState<Employee[]>([]);
  const [references, setReferences] = useState<ReferenceData | null>(null);
  const [account, setAccount] =
    useState<Awaited<ReturnType<typeof getUserById>>>(null);
  const [logs, setLogs] = useState<EmployeeAuditLog[]>([]);
  const [tab, setTab] = useState<Tab>("OVERVIEW");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState(5);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [touched, setTouched] = useState<
    Partial<Record<EmployeeRequiredField, boolean>>
  >({});
  const [emailConflict, setEmailConflict] = useState("");
  const [managerOverridden, setManagerOverridden] = useState(false);
  const [departmentPositions, setDepartmentPositions] = useState<
    JobTitlePreview[]
  >([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  const [positionLoadError, setPositionLoadError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const auditRef = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    try {
      const current = await getEmployeeById(employeeId);
      const [activePeople, referenceResult, linked] = await Promise.all([
        getActiveEmployeeOptions(),
        getReferenceData(),
        current?.userId ? getUserById(current.userId) : Promise.resolve(null),
      ]);
      setEmployee(current);
      setForm(current ? toForm(current) : null);
      setTouched({});
      setEmailConflict("");
      setManagerOverridden(false);
      setPeople(activePeople);
      setReferences(referenceResult.data);
      setAccount(linked);
      setLogs(
        current ? await getEmployeeAuditLogs(current.id, current.userId) : [],
      );
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);
  // Initial/detail route synchronization with the server.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);
  // Permission changes can invalidate an already open edit session.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (editing && !canUpdateEmployee) {
      // oxlint-disable-next-line react/set-state-in-effect
      setEditing(false);
      setToast({
        message: "Bạn không có quyền chỉnh sửa thông tin nhân viên.",
        tone: "error",
      });
    }
  }, [editing, canUpdateEmployee]);
  useEffect(() => {
    if (employee?.updatedAt) onCurrentUserUpdated();
  }, [employee?.updatedAt, onCurrentUserUpdated]);
  useEffect(() => {
    const departmentId = form?.departmentId;
    if (!departmentId) {
      // oxlint-disable-next-line react/set-state-in-effect
      setDepartmentPositions([]);
      setPositionLoadError("");
      return;
    }
    let isCurrent = true;
    // oxlint-disable-next-line react/set-state-in-effect
    setIsLoadingPositions(true);
    setPositionLoadError("");
    void getDepartmentPositionsFromApi(departmentId)
      .then((items) => {
        if (isCurrent)
          setDepartmentPositions(items.filter((item) => item.isActive));
      })
      .catch(() => {
        if (isCurrent) {
          setDepartmentPositions([]);
          setPositionLoadError(
            "Không thể tải chức danh của phòng ban. Vui lòng thử lại.",
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoadingPositions(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [form?.departmentId]);
  const manager = useMemo(
    () =>
      people.find(
        (item) => item.id === (editing ? form?.managerId : employee?.managerId),
      ),
    [editing, form?.managerId, people, employee?.managerId],
  );
  const activeDepartments = useMemo(
    () => functionalDepartmentOptions(references?.departments ?? []),
    [references],
  );
  const activeWorkUnits = useMemo(
    () => workUnitOptions(references?.departments ?? []),
    [references],
  );
  const suggestedManager = useMemo(() => {
    const managerId = suggestedManagerId(
      references?.departments ?? [],
      form?.workUnitId,
      people,
      employee?.id,
    );
    return people.find((person) => person.id === managerId);
  }, [employee?.id, form?.workUnitId, people, references]);
  const dirty = Boolean(
    employee &&
    form &&
    JSON.stringify(toForm(employee)) !== JSON.stringify(form),
  );
  const validation = useMemo(
    () => (form ? validateEmployee(form) : {}),
    [form],
  );
  const valid = !Object.values(validation).some(Boolean);
  const discardAndBack = useCallback(() => {
    if (employee) setForm(toForm(employee));
    setAvatarFailed(false);
    setEditing(false);
    setPendingNavigation(false);
    onBack();
  }, [employee, onBack]);
  const requestBack = useCallback(() => {
    if (pendingNavigation) return;
    if (!editing || !dirty) {
      onBack();
      return;
    }
    setPendingNavigation(true);
    window.dispatchEvent(
      new CustomEvent("workflow:navigate-request", {
        detail: {
          onConfirm: discardAndBack,
        },
      }),
    );
  }, [dirty, discardAndBack, editing, onBack, pendingNavigation]);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("workflow:unsaved-change", { detail: editing && dirty }),
    );
    const cancelNavigation = () => setPendingNavigation(false);
    window.addEventListener("workflow:navigate-cancel", cancelNavigation);
    return () => {
      window.removeEventListener("workflow:navigate-cancel", cancelNavigation);
      window.dispatchEvent(
        new CustomEvent("workflow:unsaved-change", { detail: false }),
      );
    };
  }, [dirty, editing]);
  const update = <K extends keyof EmployeeFormValues>(
    key: K,
    value: EmployeeFormValues[K],
  ) => {
    if (key === "isActive" && !canChangeEmployeeStatus) {
      setToast({
        message: "Bạn không có quyền thay đổi trạng thái nhân viên.",
        tone: "error",
      });
      return;
    }
    if (key === "workEmail") setEmailConflict("");
    if (form) setForm({ ...form, [key]: value });
  };
  const touchField = (field: EmployeeRequiredField) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };
  const reset = () => {
    if (!employee) return;
    setForm(toForm(employee));
    setAvatarFailed(false);
    setTouched({});
    setEmailConflict("");
    setManagerOverridden(false);
    setEditing(false);
  };
  async function save() {
    if (!employee || !form || !dirty) return;
    if (!valid) {
      setTouched({
        fullName: true,
        workEmail: true,
        workUnitId: true,
        departmentId: true,
        positionId: true,
      });
      setTab(
        validation.fullName || validation.workEmail
          ? "OVERVIEW"
          : "ORGANIZATION",
      );
      setToast({
        message: "Vui lòng nhập đầy đủ các thông tin bắt buộc.",
        tone: "error",
      });
      return;
    }
    const current = toForm(employee);
    const changes = Object.fromEntries(
      Object.entries(form).filter(
        ([key, value]) => value !== current[key as keyof EmployeeFormValues],
      ),
    ) as Partial<EmployeeFormValues>;
    if (changes.fullName !== undefined)
      changes.fullName = changes.fullName.trim();
    if (changes.workEmail !== undefined)
      changes.workEmail = changes.workEmail.trim().toLowerCase();
    setSaving(true);
    try {
      const updated = await updateEmployee(employee.id, changes);
      setEmployee(updated);
      setForm(toForm(updated));
      setEditing(false);
      setToast({
        message: "Đã lưu cập nhật hồ sơ nhân viên.",
        tone: "success",
      });
      if (!employee.id.startsWith("emp-"))
        setLogs(await getEmployeeAuditLogs(employee.id, employee.userId));
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.field === "workEmail" || error.code === "EMAIL_ALREADY_EXISTS")
      ) {
        setTouched((currentTouched) => ({
          ...currentTouched,
          workEmail: true,
        }));
        setEmailConflict(error.message);
        setTab("OVERVIEW");
        return;
      }
      setToast({
        message:
          error instanceof Error ? error.message : "Không thể lưu thay đổi.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <LoadingState />;
  if (failed) return <ErrorState onRetry={() => void load()} />;
  if (!employee || !form)
    return (
      <EmptyState
        title="Không tìm thấy nhân viên"
        description="Hồ sơ này không còn trong dữ liệu hiện có."
      />
    );
  const source =
    !avatarFailed && employee.avatarUrl
      ? resolveApiAssetUrl(employee.avatarUrl)
      : null;
  const avatar = source ? (
    <img
      className="employee-avatar"
      src={source}
      alt={`Ảnh đại diện ${employee.fullName}`}
      onError={() => setAvatarFailed(true)}
    />
  ) : (
    <span className="employee-avatar employee-avatar-fallback">
      {employee.fullName.trim().charAt(0).toUpperCase() || "N"}
    </span>
  );
  const editable = editing && !saving;
  return (
    <>
      <nav className="detail-breadcrumb" aria-label="Điều hướng nhân viên">
        <button className="breadcrumb-link" type="button" onClick={requestBack}>
          Nhân viên
        </button>
        <span aria-hidden="true">/</span>
        <strong>{employee.fullName}</strong>
      </nav>
      <section className="employee-summary-card">
        <div className="employee-summary-main">
          <div className="employee-avatar-wrap">{avatar}</div>
          <div>
            <h2>{employee.fullName}</h2>
            <p className="employee-summary-code">{employee.employeeCode}</p>
            <p className="employee-summary-email">{employee.workEmail}</p>
          </div>
        </div>
        <div className="user-profile-actions">
          {editing ? (
            <>
              <button
                className="secondary-button"
                type="button"
                onClick={reset}
              >
                Hủy
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!dirty || saving}
                onClick={() => void save()}
              >
                Lưu thay đổi
              </button>
            </>
          ) : (
            <>
              <button
                className="secondary-button"
                type="button"
                onClick={requestBack}
              >
                ← Quay lại
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setTouched({});
                  setEmailConflict("");
                  setManagerOverridden(false);
                  setEditing(true);
                }}
              >
                Chỉnh sửa
              </button>
              <div className="employee-action-menu" ref={menuRef}>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  ⋯ Thao tác
                </button>
                {menuOpen && (
                  <div className="employee-action-menu-popover" role="menu">
                    {!account && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onCreateAccount(employee.id)}
                      >
                        Tạo/Liên kết tài khoản
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        auditRef.current?.scrollIntoView({ behavior: "smooth" })
                      }
                    >
                      Đi tới lịch sử
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
      <SurfaceCard className="employee-detail-card">
        <div className="detail-tabs" role="tablist">
          <button
            className={tab === "OVERVIEW" ? "active" : ""}
            type="button"
            onClick={() => setTab("OVERVIEW")}
          >
            Tổng quan
          </button>
          <button
            className={tab === "ORGANIZATION" ? "active" : ""}
            type="button"
            onClick={() => setTab("ORGANIZATION")}
          >
            Tổ chức &amp; phê duyệt
          </button>
          <button
            className={tab === "ACCOUNT" ? "active" : ""}
            type="button"
            onClick={() => setTab("ACCOUNT")}
          >
            Tài khoản &amp; phân quyền
          </button>
        </div>
        {tab === "OVERVIEW" && (
          <div className="profile-field-grid">
            <ProfileField
              label="Mã nhân viên"
              value={employee.employeeCode}
              isEditing={editable}
              editControl={
                <input
                  className="employee-code-readonly"
                  value={employee.employeeCode}
                  readOnly
                  disabled
                />
              }
            />
            <ProfileField
              label="Họ và tên"
              value={employee.fullName}
              isEditing={editable}
              required
              showRequiredError={Boolean(touched.fullName)}
              error={touched.fullName ? validation.fullName : undefined}
              editControl={
                <input
                  value={form.fullName}
                  onChange={(event) => update("fullName", event.target.value)}
                  onBlur={() => touchField("fullName")}
                />
              }
            />
            <ProfileField
              label="Email"
              value={employee.workEmail}
              isEditing={editable}
              required
              showRequiredError={Boolean(touched.workEmail)}
              error={
                emailConflict ||
                (touched.workEmail ? validation.workEmail : undefined)
              }
              editControl={
                <input
                  type="email"
                  value={form.workEmail}
                  onChange={(event) => update("workEmail", event.target.value)}
                  onBlur={() => touchField("workEmail")}
                />
              }
            />
            <ProfileField
              label="Trạng thái"
              value={<ActivityStatusBadge isActive={employee.isActive} />}
              isEditing={editable}
              editControl={
                <FilterSelect
                  ariaLabel="Chọn trạng thái làm việc"
                  value={String(form.isActive)}
                  options={[
                    { value: "true", label: "Hoạt động" },
                    { value: "false", label: "Ngưng hoạt động" },
                  ]}
                  onChange={(value) => update("isActive", value === "true")}
                />
              }
            />
            <ProfileField
              label="Điện thoại"
              value={employee.phone}
              isEditing={editable}
              editControl={
                <input
                  type="tel"
                  value={form.phone ?? ""}
                  onChange={(event) => update("phone", event.target.value)}
                />
              }
            />
            <ProfileField
              label="Ngày sinh"
              value={
                employee.dateOfBirth
                  ? formatDate(employee.dateOfBirth)
                  : undefined
              }
              isEditing={editable}
              editControl={
                <DatePicker
                  ariaLabel="Ngày sinh"
                  value={form.dateOfBirth}
                  onChange={(value) => update("dateOfBirth", value)}
                />
              }
            />
            <ProfileField
              label="Ngày vào làm"
              value={
                employee.hiredAt ? formatDate(employee.hiredAt) : undefined
              }
              isEditing={editable}
              editControl={
                <DatePicker
                  ariaLabel="Ngày vào làm"
                  value={form.hiredAt}
                  onChange={(value) => update("hiredAt", value)}
                />
              }
            />
            <ProfileField
              label="Loại nhân sự"
              value={
                form.employmentType === "CONTRACT"
                  ? "Hợp đồng"
                  : form.employmentType === "INTERN"
                    ? "Thực tập"
                    : "Chính thức"
              }
              isEditing={editable}
              editControl={
                <FilterSelect
                  ariaLabel="Chọn loại nhân sự"
                  value={form.employmentType}
                  options={[
                    { value: "FULL_TIME", label: "Chính thức" },
                    { value: "CONTRACT", label: "Hợp đồng" },
                    { value: "INTERN", label: "Thực tập" },
                  ]}
                  onChange={(value) =>
                    update("employmentType", value as EmploymentType)
                  }
                />
              }
            />
            <ProfileField
              label="Địa chỉ"
              value={employee.address}
              isEditing={editable}
              editControl={
                <input
                  value={form.address ?? ""}
                  onChange={(event) => update("address", event.target.value)}
                />
              }
            />
          </div>
        )}
        {tab === "ORGANIZATION" && (
          <div className="profile-field-grid profile-field-grid-organization">
            <ProfileField
              label="Đơn vị làm việc"
              value={
                employee.workUnitName ?? employee.workUnit ?? "Chưa thiết lập"
              }
              isEditing={editable}
              required
              showRequiredError={Boolean(touched.workUnitId)}
              error={touched.workUnitId ? validation.workUnitId : undefined}
              editControl={
                <FilterSelect
                  ariaLabel="Chọn đơn vị làm việc"
                  value={form.workUnitId ?? ""}
                  options={[
                    { value: "", label: "Chọn đơn vị làm việc" },
                    ...activeWorkUnits.map((item) => ({
                      value: item._id,
                      label: workUnitLabel(item),
                    })),
                  ]}
                  onOpenChange={(isOpen) => {
                    if (!isOpen) touchField("workUnitId");
                  }}
                  onChange={(value) => {
                    const item = activeWorkUnits.find(
                      (unit) => unit._id === value,
                    );
                    const nextSuggestedManagerId = suggestedManagerId(
                      references?.departments ?? [],
                      value || undefined,
                      people,
                      employee.id,
                    );
                    setForm({
                      ...form,
                      workUnitId: value || undefined,
                      workUnit: item?.name ?? "",
                      ...(!managerOverridden
                        ? { managerId: nextSuggestedManagerId }
                        : {}),
                    });
                  }}
                />
              }
            />
            <ProfileField
              label="Phòng ban"
              value={employee.department}
              isEditing={editable}
              required
              showRequiredError={Boolean(touched.departmentId)}
              error={touched.departmentId ? validation.departmentId : undefined}
              editControl={
                <FilterSelect
                  ariaLabel="Chọn phòng ban"
                  value={form.departmentId ?? ""}
                  options={[
                    { value: "", label: "Chọn phòng ban" },
                    ...activeDepartments.map((item) => ({
                      value: item._id,
                      label: item.name,
                    })),
                  ]}
                  onOpenChange={(isOpen) => {
                    if (!isOpen) touchField("departmentId");
                  }}
                  onChange={(value) => {
                    const item = activeDepartments.find(
                      (department) => department._id === value,
                    );
                    setTouched((current) => ({
                      ...current,
                      positionId: false,
                    }));
                    setForm({
                      ...form,
                      departmentId: value || undefined,
                      department: item?.name ?? "",
                      positionId: undefined,
                      position: "",
                    });
                  }}
                />
              }
            />
            <ProfileField
              label="Chức danh"
              value={employee.position}
              isEditing={editable}
              required
              showRequiredError={Boolean(touched.positionId)}
              error={
                positionLoadError ||
                (touched.positionId ? validation.positionId : undefined)
              }
              editControl={
                <FilterSelect
                  ariaLabel="Chọn chức danh"
                  value={form.positionId ?? ""}
                  options={[
                    {
                      value: "",
                      label: !form.departmentId
                        ? "Chọn phòng ban trước"
                        : isLoadingPositions
                          ? "Đang tải chức danh..."
                          : departmentPositions.length
                            ? "Chọn chức danh"
                            : "Phòng ban chưa có chức danh áp dụng",
                    },
                    ...departmentPositions.map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                  ]}
                  disabled={!form.departmentId || isLoadingPositions}
                  onOpenChange={(isOpen) => {
                    if (!isOpen) touchField("positionId");
                  }}
                  onChange={(value) => {
                    const item = departmentPositions.find(
                      (position) => position.id === value,
                    );
                    setForm({
                      ...form,
                      positionId: value || undefined,
                      position: item?.name ?? "",
                    });
                  }}
                />
              }
            />
            <ProfileField
              label="Quản lý trực tiếp"
              value={
                manager
                  ? `${manager.fullName} · ${manager.employeeCode}`
                  : undefined
              }
              isEditing={editable}
              editControl={
                <FilterSelect
                  ariaLabel="Chọn quản lý trực tiếp"
                  value={form.managerId ?? ""}
                  options={[
                    { value: "", label: "Chưa thiết lập" },
                    ...people
                      .filter(
                        (item) => item.id !== employee.id && item.isActive,
                      )
                      .map((item) => ({
                        value: item.id,
                        label: `${item.fullName} · ${item.employeeCode}`,
                      })),
                  ]}
                  onChange={(value) => {
                    setManagerOverridden(true);
                    update("managerId", value || undefined);
                  }}
                />
              }
            />
            <p className="employee-display-note">
              {suggestedManager
                ? `Gợi ý theo cây tổ chức: ${suggestedManager.fullName} · ${suggestedManager.employeeCode}.`
                : "Đơn vị đã chọn chưa có người quản lý phù hợp trong cây tổ chức."}{" "}
              Admin có thể chọn người khác khi cần; lựa chọn thủ công sẽ không
              bị tự động ghi đè.
            </p>
          </div>
        )}
        {tab === "ACCOUNT" && (
          <div className="employee-account-panel">
            <p className="state-kicker">TÀI KHOẢN VÀ PHÂN QUYỀN</p>
            {account ? (
              <div className="employee-account-content">
                <div>
                  <h3>{account.email}</h3>
                  <p className="role-chip-list">
                    {(account.roles ?? [account.role]).map((role) => (
                      <span className="role-chip" key={role}>
                        {formatRole(role)}
                      </span>
                    ))}
                  </p>
                  <ActivityStatusBadge isActive={account.isActive} />
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onOpenUser(account.id)}
                >
                  Xem tài khoản người dùng
                </button>
              </div>
            ) : (
              <div className="employee-account-content">
                <div>
                  <h3>Chưa có tài khoản người dùng</h3>
                  <p>Hồ sơ nhân sự có thể tồn tại độc lập.</p>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => onCreateAccount(employee.id)}
                >
                  Tạo tài khoản
                </button>
              </div>
            )}
          </div>
        )}
      </SurfaceCard>
      <section className="employee-activity-section" ref={auditRef}>
        <div className="employee-activity-heading">
          <div>
            <h2>Lịch sử</h2>
          </div>
        </div>
        <SurfaceCard className="employee-activity-card">
          <div className="employee-activity-list">
            {logs.slice(0, visibleLogs).map((log) => {
              const changes = employeeChangeDetails(log, references, people);
              return (
                <article className="activity-log-row" key={log._id ?? log.id}>
                  <div>
                    <strong>{description(log, currentUserId)}</strong>
                    {changes.length > 0 && (
                      <p>Thay đổi: {changes.join(" · ")}</p>
                    )}
                  </div>
                  <time>{dateTime(log.occurredAt)}</time>
                </article>
              );
            })}
            {!logs.length && (
              <p className="employee-activity-empty">
                Chưa có lịch sử liên quan đến nhân viên hoặc tài khoản liên kết.
              </p>
            )}
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
        </SurfaceCard>
      </section>
      {toast && (
        <div
          className={`toast-message${toast.tone === "error" ? " toast-error" : ""}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
