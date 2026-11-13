import { useEffect, useRef, useState } from "react";
import { List, Network } from "lucide-react";
import {
  getEmployeeFilterOptions,
  getEmployeeHierarchy,
  getEmployeePage,
  type EmployeeFilterOptions,
  type EmployeeSortField,
} from "../services/employees.service";
import type { Employee, EmploymentType } from "../types/employees";
import { EmployeeStatusBadge } from "./StatusBadge";
import { ErrorState, LoadingState } from "./DataStates";
import { AdvancedFilterPanel } from "./ui/AdvancedFilterPanel";
import { DataTable, EmptyTableRow } from "./ui/DataTable";
import { FilterSelect } from "./ui/FilterSelect";
import { ListToolbar } from "./ui/ListToolbar";
import { PageHeader } from "./ui/PageHeader";
import { SurfaceCard } from "./ui/SurfaceCard";
import { SortableTableHeader } from "./ui/SortableTableHeader";
import { TablePagination } from "./ui/TablePagination";
import { EmployeeHierarchyView } from "./EmployeeHierarchyView";

interface EmployeeCatalogPageProps {
  onOpenEmployee: (employeeId: string) => void;
  onCreateEmployee: () => void;
  canCreateEmployee: boolean;
  initialViewMode?: ViewMode;
  onViewModeChange?: (viewMode: ViewMode) => void;
}

type FilterKey = "workUnit" | "department" | "employmentType" | "status";
type ViewMode = "LIST" | "TREE";
type PageSize = 10 | 20 | 50;
const pageSizes: PageSize[] = [10, 20, 50];
const employmentTypeLabels: Record<EmploymentType, string> = {
  OFFICIAL: "Chính thức",
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Thử việc",
  INTERN: "Thực tập",
};

export function EmployeeCatalogPage({
  onOpenEmployee,
  onCreateEmployee,
  canCreateEmployee,
  initialViewMode = "LIST",
  onViewModeChange,
}: EmployeeCatalogPageProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [hierarchyEmployees, setHierarchyEmployees] = useState<Employee[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(
    initialViewMode === "TREE",
  );
  const [hasHierarchyError, setHasHierarchyError] = useState(false);
  const [filterOptions, setFilterOptions] = useState<EmployeeFilterOptions>({
    departments: [],
    workUnits: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<FilterKey | null>(null);
  const [workUnitId, setWorkUnitId] = useState("ALL");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [employmentType, setEmploymentType] = useState<"ALL" | EmploymentType>(
    "ALL",
  );
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [sortBy, setSortBy] = useState<EmployeeSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [hasUserSorted, setHasUserSorted] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const hierarchyRequestVersion = useRef(0);

  useEffect(() => {
    void getEmployeeFilterOptions()
      .then(setFilterOptions)
      .catch(() => setHasError(true));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (viewMode !== "LIST") return;
    const currentRequest = ++requestVersion.current;
    void getEmployeePage({
      search: searchQuery || undefined,
      workUnitId: workUnitId === "ALL" ? undefined : workUnitId,
      departmentId: departmentId === "ALL" ? undefined : departmentId,
      employmentType: employmentType === "ALL" ? undefined : employmentType,
      isActive: status === "ALL" ? undefined : status === "ACTIVE",
      sortBy,
      sortOrder,
      page,
      limit: pageSize,
    })
      .then((result) => {
        if (currentRequest !== requestVersion.current) return;
        const nextTotalPages = Math.max(1, result.pagination.totalPages);
        if (page > nextTotalPages) {
          setPage(nextTotalPages);
          return;
        }
        setEmployees(result.data);
        setTotal(result.pagination.total);
        setTotalPages(nextTotalPages);
        setHasError(false);
      })
      .catch(() => {
        if (currentRequest === requestVersion.current) setHasError(true);
      })
      .finally(() => {
        if (currentRequest !== requestVersion.current) return;
        setIsLoading(false);
        setIsRefreshing(false);
      });
  }, [
    departmentId,
    employmentType,
    page,
    pageSize,
    refreshVersion,
    searchQuery,
    sortBy,
    sortOrder,
    status,
    workUnitId,
    viewMode,
  ]);

  useEffect(() => {
    if (viewMode !== "TREE") return;
    const currentRequest = ++hierarchyRequestVersion.current;
    // Loading flags intentionally synchronize with the active server request.
    // oxlint-disable-next-line react/set-state-in-effect
    setIsHierarchyLoading(true);
    // oxlint-disable-next-line react/set-state-in-effect
    setHasHierarchyError(false);
    void getEmployeeHierarchy({
      workUnitId: workUnitId === "ALL" ? undefined : workUnitId,
      departmentId: departmentId === "ALL" ? undefined : departmentId,
      employmentType: employmentType === "ALL" ? undefined : employmentType,
      isActive: status === "ALL" ? undefined : status === "ACTIVE",
    })
      .then((result) => {
        if (currentRequest !== hierarchyRequestVersion.current) return;
        setHierarchyEmployees(result);
      })
      .catch(() => {
        if (currentRequest === hierarchyRequestVersion.current)
          setHasHierarchyError(true);
      })
      .finally(() => {
        if (currentRequest !== hierarchyRequestVersion.current) return;
        setIsHierarchyLoading(false);
        setIsRefreshing(false);
      });
  }, [
    departmentId,
    employmentType,
    refreshVersion,
    status,
    viewMode,
    workUnitId,
  ]);

  const currentPage = Math.min(page, totalPages);
  const rangeStart = total ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  function resetAndRefresh() {
    setIsRefreshing(true);
    setSearchInput("");
    setSearchQuery("");
    setWorkUnitId("ALL");
    setDepartmentId("ALL");
    setEmploymentType("ALL");
    setStatus("ALL");
    setPage(1);
    setPageSize(10);
    setSortBy("createdAt");
    setSortOrder("desc");
    setHasUserSorted(false);
    setIsFilterOpen(false);
    setOpenSelect(null);
    setRefreshVersion((value) => value + 1);
  }

  function changeSort(column: string) {
    const nextColumn = column as EmployeeSortField;
    setSortOrder((current) => sortBy === nextColumn
      ? (current === "asc" ? "desc" : "asc")
      : (nextColumn === "createdAt" ? "desc" : "asc"));
    setSortBy(nextColumn);
    setHasUserSorted(true);
    setPage(1);
    setIsLoading(true);
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function changeViewMode(nextViewMode: ViewMode) {
    if (nextViewMode === "TREE" && hierarchyEmployees.length === 0)
      setIsHierarchyLoading(true);
    setViewMode(nextViewMode);
    onViewModeChange?.(nextViewMode);
  }

  if (viewMode === "LIST" && isLoading) return <LoadingState />;
  if (hasError)
    return (
      <ErrorState onRetry={() => setRefreshVersion((value) => value + 1)} />
    );

  return (
    <>
      <PageHeader
        className="catalog-page-header"
        title="Nhân viên"
        actions={
          canCreateEmployee ? (
            <button
              className="primary-button compact-button"
              type="button"
              onClick={onCreateEmployee}
            >
              Thêm nhân viên
            </button>
          ) : undefined
        }
      />
      <SurfaceCard className="admin-section user-catalog-section">
        <ListToolbar>
          <div className="catalog-toolbar-main">
            <div className="catalog-search-row">
              <label className="catalog-search">
                <span>Tìm kiếm</span>
                <span className="catalog-search-input">
                  <input
                    ref={inputRef}
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Mã, họ tên hoặc email"
                  />
                  {searchInput && (
                    <button
                      className="clear-search-button"
                      type="button"
                      onClick={clearSearch}
                      aria-label="Xóa nội dung tìm kiếm"
                    >
                      ×
                    </button>
                  )}
                </span>
              </label>
              <button
                className={
                  isFilterOpen
                    ? "secondary-button filter-trigger is-active"
                    : "secondary-button filter-trigger"
                }
                type="button"
                onClick={() => {
                  setIsFilterOpen((open) => !open);
                  setOpenSelect(null);
                }}
                aria-expanded={isFilterOpen}
              >
                <svg
                  className="filter-trigger-icon"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d={
                      isFilterOpen
                        ? "m4 10 4-4 4 4"
                        : "M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z"
                    }
                  />
                </svg>
                <span>{isFilterOpen ? "Ẩn bộ lọc" : "Bộ lọc"}</span>
              </button>
              <button
                className="secondary-button catalog-refresh-button"
                type="button"
                onClick={resetAndRefresh}
                disabled={isRefreshing}
              >
                <span
                  className={
                    isRefreshing ? "refresh-icon is-spinning" : "refresh-icon"
                  }
                >
                  ↻
                </span>
                {isRefreshing ? "Đang làm mới..." : "Làm mới"}
              </button>
              <div
                className="organization-view-switch employee-view-switch"
                role="group"
                aria-label="Kiểu hiển thị nhân viên"
              >
                <button
                  className={viewMode === "LIST" ? "is-active" : ""}
                  type="button"
                  onClick={() => changeViewMode("LIST")}
                >
                  <List size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Danh sách</span>
                </button>
                <button
                  className={viewMode === "TREE" ? "is-active" : ""}
                  type="button"
                  onClick={() => changeViewMode("TREE")}
                >
                  <Network size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Sơ đồ nhân sự</span>
                </button>
              </div>
            </div>
            <AdvancedFilterPanel
              id="employee-filters"
              label="Bộ lọc nhân viên"
              isOpen={isFilterOpen}
            >
              <div className="advanced-filter-content">
                <div className="advanced-filter-fields">
                  <label>
                    <span>Đơn vị làm việc</span>
                    <FilterSelect
                      ariaLabel="Lọc theo đơn vị làm việc"
                      value={workUnitId}
                      options={[
                        { value: "ALL", label: "Tất cả đơn vị" },
                        ...filterOptions.workUnits.map((item) => ({
                          value: item.id,
                          label: item.name,
                        })),
                      ]}
                      onChange={(value) => {
                        setWorkUnitId(value);
                        setPage(1);
                      }}
                      isOpen={openSelect === "workUnit"}
                      onOpenChange={(open) =>
                        setOpenSelect(open ? "workUnit" : null)
                      }
                    />
                  </label>
                  <label>
                    <span>Phòng ban</span>
                    <FilterSelect
                      ariaLabel="Lọc theo phòng ban"
                      value={departmentId}
                      options={[
                        { value: "ALL", label: "Tất cả phòng ban" },
                        ...filterOptions.departments.map((item) => ({
                          value: item.id,
                          label: item.name,
                        })),
                      ]}
                      onChange={(value) => {
                        setDepartmentId(value);
                        setPage(1);
                      }}
                      isOpen={openSelect === "department"}
                      onOpenChange={(open) =>
                        setOpenSelect(open ? "department" : null)
                      }
                    />
                  </label>
                  <label>
                    <span>Loại hợp đồng</span>
                    <FilterSelect
                      ariaLabel="Lọc theo loại hợp đồng"
                      value={employmentType}
                      options={[
                        { value: "ALL", label: "Tất cả loại hợp đồng" },
                        ...Object.entries(employmentTypeLabels).map(
                          ([value, label]) => ({ value, label }),
                        ),
                      ]}
                      onChange={(value) => {
                        setEmploymentType(value as "ALL" | EmploymentType);
                        setPage(1);
                      }}
                      isOpen={openSelect === "employmentType"}
                      onOpenChange={(open) =>
                        setOpenSelect(open ? "employmentType" : null)
                      }
                    />
                  </label>
                  <label>
                    <span>Trạng thái</span>
                    <FilterSelect
                      ariaLabel="Lọc theo trạng thái nhân viên"
                      value={status}
                      options={[
                        { value: "ALL", label: "Tất cả trạng thái" },
                        { value: "ACTIVE", label: "Hoạt động" },
                        { value: "INACTIVE", label: "Ngưng hoạt động" },
                      ]}
                      onChange={(value) => {
                        setStatus(value as typeof status);
                        setPage(1);
                      }}
                      isOpen={openSelect === "status"}
                      onOpenChange={(open) =>
                        setOpenSelect(open ? "status" : null)
                      }
                    />
                  </label>
                </div>
              </div>
            </AdvancedFilterPanel>
          </div>
        </ListToolbar>
        {viewMode === "LIST" ? <><DataTable className="admin-table employee-catalog-table" fixedLayout>
          <thead>
            <tr>
              <SortableTableHeader column="employeeCode" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Mã nhân viên</SortableTableHeader>
              <SortableTableHeader column="fullName" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Họ và tên</SortableTableHeader>
              <SortableTableHeader column="workEmail" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Email</SortableTableHeader>
              <th>Đơn vị làm việc</th>
              <th>Phòng ban</th>
              <th>Chức danh</th>
                      <SortableTableHeader column="isActive" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Trạng thái</SortableTableHeader>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <EmptyTableRow
                colSpan={7}
                message="Không tìm thấy nhân viên phù hợp."
              />
            ) : (
              employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <button
                      className="user-detail-link employee-code-link"
                      type="button"
                      onClick={() => onOpenEmployee(employee.id)}
                    >
                      {employee.employeeCode}
                    </button>
                  </td>
                  <td>{employee.fullName}</td>
                  <td>
                    <span className="employee-work-email">
                      {employee.workEmail}
                    </span>
                  </td>
                  <td>
                    {employee.workUnitName ??
                      employee.workUnit ??
                      "Chưa thiết lập"}
                  </td>
                  <td>{employee.department}</td>
                  <td>{employee.position}</td>
                  <td>
                    <EmployeeStatusBadge isActive={employee.isActive} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevious={() => setPage(currentPage - 1)}
          onNext={() => setPage(currentPage + 1)}
          onPageChange={setPage}
          rangeLabel={`${rangeStart}–${rangeEnd} trên ${total} nhân viên`}
          pageSize={pageSize}
          pageSizes={pageSizes}
          onPageSizeChange={(value) => {
            setPageSize(value as PageSize);
            setPage(1);
          }}
        /></> : <EmployeeHierarchyView
          employees={hierarchyEmployees}
          search={searchInput}
          isLoading={isHierarchyLoading}
          hasError={hasHierarchyError}
          onRetry={() => setRefreshVersion((value) => value + 1)}
          onOpenEmployee={onOpenEmployee}
        />}
      </SurfaceCard>
    </>
  );
}
