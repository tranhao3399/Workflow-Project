import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserRoundPlus } from "lucide-react";
import { getUserById } from "../services/administration.service";
import {
  getEmployeeAuditLogs,
  type EmployeeAuditLog,
} from "../services/employee-audit.service";
import {
  getActiveEmployeeOptions,
  getEmployeeById,
  removeEmployeeAvatar,
  updateEmployee,
  uploadEmployeeAvatar,
} from "../services/employees.service";
import { getReferenceData } from "../services/reference-data.service";
import { getDepartmentPositionsFromApi } from "../services/master-data.service";
import { ApiError, resolveApiAssetUrl } from "../services/api-client";
import type { UserRole } from "../types/auth";
import type {
  Employee,
  EmployeeFormValues,
  EmploymentType,
  Gender,
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
  auditChangeDetails,
  auditValue,
  formatAuditSentence,
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
  initialTab?: Tab;
  onBack: () => void;
  onCreateAccount: (employeeId: string) => void;
  onOpenUser: (userId: string) => void;
  onCurrentUserUpdated: () => void;
  canUpdateEmployee: boolean;
  canUploadEmployeeAvatar: boolean;
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
  annualLeaveDays?: string;
  citizenId?: string;
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
    annualLeaveDays:
      form.annualLeaveDays === undefined ||
      (Number.isFinite(form.annualLeaveDays) &&
        form.annualLeaveDays >= 0 &&
        form.annualLeaveDays <= 365)
        ? undefined
        : "Số ngày nghỉ phép năm phải từ 0 đến 365.",
    citizenId:
      !form.citizenId || /^\d{12}$/.test(form.citizenId)
        ? undefined
        : "Số CCCD phải gồm đúng 12 chữ số.",
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
    gender: employee.gender,
    citizenId: employee.citizenId,
    hiredAt: employee.hiredAt,
    annualLeaveDays: employee.annualLeaveDays,
    employmentType: employee.employmentType ?? "FULL_TIME",
    managerId: employee.managerId,
    isActive: employee.isActive,
  };
}
function displayDate(value: unknown) {
  return typeof value === "string" || value instanceof Date
    ? formatDate(String(value))
    : auditValue(value);
}
function displayCitizenId(value: unknown) {
  if (value === undefined || value === null || value === "")
    return "Chưa cập nhật";
  const citizenId = String(value);
  return /^\d{12}$/.test(citizenId)
    ? `••••••••${citizenId.slice(-4)}`
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
    {
      key: "gender",
      label: "Giới tính",
      format: (value) =>
        value === "MALE"
          ? "Nam"
          : value === "FEMALE"
            ? "Nữ"
            : value === "OTHER"
              ? "Khác"
              : auditValue(value),
    },
    { key: "citizenId", label: "Số CCCD", format: displayCitizenId },
    { key: "hiredAt", label: "Ngày vào làm", format: displayDate },
    { key: "annualLeaveDays", label: "Số ngày nghỉ phép năm" },
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
      label: "Loại hợp đồng",
      format: (value) =>
        value === "OFFICIAL"
          ? "Chính thức"
          : value === "PART_TIME"
            ? "Part-time"
            : value === "CONTRACT"
              ? "Thử việc"
              : value === "INTERN"
                ? "Thực tập"
                : value === "FULL_TIME"
                  ? "Full-time"
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
  initialTab = "OVERVIEW",
  onBack,
  onCreateAccount,
  onOpenUser,
  onCurrentUserUpdated,
  canUpdateEmployee,
  canUploadEmployeeAvatar,
  canChangeEmployeeStatus,
}: Props) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeFormValues | null>(null);
  const [people, setPeople] = useState<Employee[]>([]);
  const [references, setReferences] = useState<ReferenceData | null>(null);
  const [account, setAccount] =
    useState<Awaited<ReturnType<typeof getUserById>>>(null);
  const [logs, setLogs] = useState<EmployeeAuditLog[]>([]);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState(5);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarRemovalRequested, setAvatarRemovalRequested] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [touched, setTouched] = useState<
    Partial<Record<EmployeeRequiredField, boolean>>
  >({});
  const [emailConflict, setEmailConflict] = useState("");
  const [citizenIdConflict, setCitizenIdConflict] = useState("");
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
      setCitizenIdConflict("");
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
  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );
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
    if (editing && !canUpdateEmployee && !canUploadEmployeeAvatar) {
      // oxlint-disable-next-line react/set-state-in-effect
      setEditing(false);
      setToast({
        message: "Bạn không có quyền chỉnh sửa thông tin nhân viên.",
        tone: "error",
      });
    }
  }, [editing, canUpdateEmployee, canUploadEmployeeAvatar]);
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
  const profileDirty = Boolean(
    employee &&
    form &&
    JSON.stringify(toForm(employee)) !== JSON.stringify(form),
  );
  const avatarDirty = Boolean(avatarFile || avatarRemovalRequested);
  const dirty = profileDirty || avatarDirty;
  const validation = useMemo(
    () => (form ? validateEmployee(form) : {}),
    [form],
  );
  const valid = !Object.values(validation).some(Boolean);
  const discardAndBack = useCallback(() => {
    if (employee) setForm(toForm(employee));
    setAvatarFailed(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarRemovalRequested(false);
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
    if (key === "citizenId") setCitizenIdConflict("");
    if (form) setForm({ ...form, [key]: value });
  };
  const touchField = (field: EmployeeRequiredField) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };
  const reset = () => {
    if (!employee) return;
    setForm(toForm(employee));
    setAvatarFailed(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarRemovalRequested(false);
    setTouched({});
    setEmailConflict("");
    setCitizenIdConflict("");
    setManagerOverridden(false);
    setEditing(false);
  };
  function selectAvatar(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setToast({
        message: "Ảnh đại diện chỉ hỗ trợ định dạng JPG hoặc PNG.",
        tone: "error",
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setToast({
        message: "Ảnh đại diện không được vượt quá 2 MB.",
        tone: "error",
      });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarRemovalRequested(false);
    setAvatarFailed(false);
  }
  function removeAvatar() {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarRemovalRequested(Boolean(employee?.avatarUrl));
    setAvatarFailed(false);
  }
  async function save() {
    if (!employee || !form || !dirty) return;
    if (profileDirty && !valid) {
      setTouched({
        fullName: true,
        workEmail: true,
        workUnitId: true,
        departmentId: true,
        positionId: true,
        annualLeaveDays: true,
        citizenId: true,
      });
      setTab(
        validation.fullName ||
        validation.workEmail ||
        validation.annualLeaveDays ||
        validation.citizenId
          ? "OVERVIEW"
          : "ORGANIZATION",
      );
      setToast({
        message: "Vui lòng kiểm tra lại các trường thông tin chưa hợp lệ.",
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
    if (changes.citizenId !== undefined)
      changes.citizenId = changes.citizenId.trim();
    setSaving(true);
    let updatedEmployee = employee;
    try {
      if (profileDirty) {
        updatedEmployee = await updateEmployee(employee.id, {
          ...changes,
          ...(employee.annualLeaveDays !== undefined &&
          form.annualLeaveDays === undefined
            ? { annualLeaveDays: null }
            : {}),
          ...(employee.gender !== undefined && form.gender === undefined
            ? { gender: null }
            : {}),
          ...(employee.citizenId !== undefined && form.citizenId === undefined
            ? { citizenId: null }
            : {}),
        });
      }
      if (avatarFile) {
        updatedEmployee = await uploadEmployeeAvatar(employee.id, avatarFile);
      } else if (avatarRemovalRequested) {
        updatedEmployee = await removeEmployeeAvatar(employee.id);
      }
      setEmployee(updatedEmployee);
      setForm(toForm(updatedEmployee));
      setAvatarFile(null);
      setAvatarPreview(null);
      setAvatarRemovalRequested(false);
      setAvatarFailed(false);
      setEditing(false);
      setToast({
        message: "Đã lưu cập nhật hồ sơ nhân viên.",
        tone: "success",
      });
      if (!employee.id.startsWith("emp-"))
        setLogs(await getEmployeeAuditLogs(employee.id, employee.userId));
    } catch (error) {
      if (updatedEmployee !== employee) {
        setEmployee(updatedEmployee);
        setForm(toForm(updatedEmployee));
      }
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
      if (
        error instanceof ApiError &&
        (error.field === "citizenId" ||
          error.code === "CITIZEN_ID_ALREADY_EXISTS")
      ) {
        setTouched((currentTouched) => ({
          ...currentTouched,
          citizenId: true,
        }));
        setCitizenIdConflict(error.message);
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
  const source = !avatarFailed && avatarPreview
    ? avatarPreview
    : !avatarRemovalRequested && !avatarFailed && employee.avatarUrl
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
  const editable = editing && !saving && canUpdateEmployee;
  const avatarEditable = editing && !saving && canUploadEmployeeAvatar;
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
          <div className="employee-avatar-editor">
            {avatarEditable ? (
              <label
                className="employee-avatar-button"
                title="Chọn ảnh đại diện"
              >
                {avatar}
                <span className="employee-avatar-change">Thay ảnh</span>
                <input
                  className="avatar-file-input"
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={saving}
                  onChange={(event) => {
                    selectAvatar(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : (
              <div className="employee-avatar-wrap">{avatar}</div>
            )}
            {avatarEditable && (employee.avatarUrl || avatarPreview) && (
              <button
                className="employee-avatar-remove"
                type="button"
                onClick={removeAvatar}
              >
                Xóa ảnh
              </button>
            )}
          </div>
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
                  setCitizenIdConflict("");
                  setManagerOverridden(false);
                  setAvatarFile(null);
                  setAvatarPreview(null);
                  setAvatarRemovalRequested(false);
                  setAvatarFailed(false);
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
              label="Giới tính"
              value={
                employee.gender === "MALE"
                  ? "Nam"
                  : employee.gender === "FEMALE"
                    ? "Nữ"
                    : employee.gender === "OTHER"
                      ? "Khác"
                      : undefined
              }
              isEditing={editable}
              editControl={
                <FilterSelect
                  ariaLabel="Chọn giới tính"
                  value={form.gender ?? ""}
                  options={[
                    { value: "", label: "Chọn giới tính" },
                    { value: "MALE", label: "Nam" },
                    { value: "FEMALE", label: "Nữ" },
                    { value: "OTHER", label: "Khác" },
                  ]}
                  onChange={(value) =>
                    update("gender", (value || undefined) as Gender | undefined)
                  }
                />
              }
            />
            <ProfileField
              label="Số CCCD"
              value={employee.citizenId}
              isEditing={editable}
              error={
                citizenIdConflict ||
                (touched.citizenId ? validation.citizenId : undefined)
              }
              editControl={
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  value={form.citizenId ?? ""}
                  onChange={(event) =>
                    update(
                      "citizenId",
                      event.target.value.replace(/\D/g, "").slice(0, 12) ||
                        undefined,
                    )
                  }
                  onBlur={() => touchField("citizenId")}
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
              label="Loại hợp đồng"
              value={
                form.employmentType === "OFFICIAL"
                  ? "Chính thức"
                  : form.employmentType === "PART_TIME"
                    ? "Part-time"
                    : form.employmentType === "CONTRACT"
                      ? "Thử việc"
                      : form.employmentType === "INTERN"
                        ? "Thực tập"
                        : "Full-time"
              }
              isEditing={editable}
              editControl={
                <FilterSelect
                  ariaLabel="Chọn loại hợp đồng"
                  value={form.employmentType}
                  options={[
                    { value: "OFFICIAL", label: "Chính thức" },
                    { value: "FULL_TIME", label: "Full-time" },
                    { value: "PART_TIME", label: "Part-time" },
                    { value: "CONTRACT", label: "Thử việc" },
                    { value: "INTERN", label: "Thực tập" },
                  ]}
                  onChange={(value) =>
                    update("employmentType", value as EmploymentType)
                  }
                />
              }
            />
            <ProfileField
              label="Số ngày nghỉ phép năm"
              value={
                employee.annualLeaveDays !== undefined
                  ? `${employee.annualLeaveDays} ngày`
                  : undefined
              }
              isEditing={editable}
              error={
                touched.annualLeaveDays
                  ? validation.annualLeaveDays
                  : undefined
              }
              editControl={
                <input
                  type="number"
                  min="0"
                  max="365"
                  step="0.5"
                  inputMode="decimal"
                  value={form.annualLeaveDays ?? ""}
                  onChange={(event) =>
                    update(
                      "annualLeaveDays",
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value),
                    )
                  }
                  onBlur={() => touchField("annualLeaveDays")}
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
          </div>
        )}
        {tab === "ACCOUNT" && (
          <div className="employee-account-panel">
            {account ? (
              <div className="employee-account-linked">
                <div className="employee-account-actions">
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    onClick={() => onOpenUser(account.id)}
                  >
                    Xem tài khoản người dùng
                  </button>
                </div>
                <div className="employee-account-grid">
                  <div className="employee-account-fact">
                    <span>Tài khoản đăng nhập</span>
                    <strong className="employee-account-email">{account.email}</strong>
                  </div>
                  <div className="employee-account-fact">
                    <span>Vai trò &amp; Trạng thái</span>
                    <div className="employee-account-badges">
                    {(account.roles ?? [account.role]).map((role) => (
                      <span className="role-chip" key={role}>
                        {formatRole(role)}
                      </span>
                    ))}
                      <ActivityStatusBadge isActive={account.isActive} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="employee-account-empty-state">
                <span className="employee-account-empty-icon" aria-hidden="true">
                  <UserRoundPlus size={28} strokeWidth={1.7} />
                </span>
                <h3>Chưa có tài khoản người dùng</h3>
                <p>Nhân viên này chưa có tài khoản để đăng nhập và sử dụng hệ thống.</p>
                <button
                  className="primary-button compact-button"
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
                    <strong>
                      {formatAuditSentence({
                        action: log.action,
                        actor: log.actor,
                        currentUserId,
                        resourceType: log.resource.type,
                        resourceName: log.resource.type === 'USER'
                          ? log.resource.code || employee.workEmail || employee.fullName
                          : employee.fullName,
                      })}
                    </strong>
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
