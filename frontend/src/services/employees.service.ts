import type { Employee, EmployeeFormValues } from "../types/employees";
import { apiClient, apiFormDataClient } from "./api-client";
import type { ApiDataResponse } from "./api-client";

interface EmployeeApiResponse extends Omit<Employee, "id"> {
  _id?: string;
  id?: string;
}
type CreateEmployeeValues = Omit<
  EmployeeFormValues,
  "employeeCode" | "workUnit"
>;

export type EmployeeSortField = "employeeCode" | "fullName" | "workEmail" | "employmentType" | "isActive" | "createdAt";

export interface EmployeeListQuery {
  search?: string;
  departmentId?: string;
  workUnitId?: string;
  employmentType?: Employee["employmentType"];
  isActive?: boolean;
  sortBy?: EmployeeSortField;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface EmployeePagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface EmployeeFilterOption {
  id: string;
  code: string;
  name: string;
  unitType: "COMPANY" | "REGION" | "STORE" | "FUNCTIONAL" | "UNCLASSIFIED";
  parentId?: string;
  managerEmployeeId?: string;
}

export interface EmployeeFilterOptions {
  departments: EmployeeFilterOption[];
  workUnits: EmployeeFilterOption[];
}

function fromApi(value: EmployeeApiResponse): Employee {
  return { ...value, id: value.id ?? value._id ?? "" };
}

export async function getEmployees(): Promise<Employee[]> {
  const result = await apiClient<{ data: EmployeeApiResponse[] }>(
    "/employees?page=1&limit=100",
  );
  return result.data.map(fromApi);
}

export async function getEmployeePage(query: EmployeeListQuery = {}): Promise<{
  data: Employee[];
  pagination: EmployeePagination;
}> {
  const parameters = new URLSearchParams();
  if (query.search?.trim()) parameters.set("search", query.search.trim());
  if (query.departmentId) parameters.set("departmentId", query.departmentId);
  if (query.workUnitId) parameters.set("workUnitId", query.workUnitId);
  if (query.employmentType)
    parameters.set("employmentType", query.employmentType);
  if (query.isActive !== undefined)
    parameters.set("isActive", String(query.isActive));
  if (query.sortBy) parameters.set("sortBy", query.sortBy);
  if (query.sortOrder) parameters.set("sortOrder", query.sortOrder);
  parameters.set("page", String(query.page ?? 1));
  parameters.set("limit", String(query.limit ?? 10));
  const result = await apiClient<{
    data: EmployeeApiResponse[];
    pagination: EmployeePagination;
  }>(`/employees?${parameters.toString()}`);
  return { data: result.data.map(fromApi), pagination: result.pagination };
}

export async function getEmployeeHierarchy(
  query: Omit<EmployeeListQuery, "search" | "sortBy" | "sortOrder" | "page" | "limit"> = {},
): Promise<Employee[]> {
  const firstPage = await getEmployeePage({
    ...query,
    sortBy: "fullName",
    sortOrder: "asc",
    page: 1,
    limit: 100,
  });
  if (firstPage.pagination.totalPages <= 1) return firstPage.data;

  const remainingPages = await Promise.all(
    Array.from(
      { length: firstPage.pagination.totalPages - 1 },
      (_, index) => getEmployeePage({
        ...query,
        sortBy: "fullName",
        sortOrder: "asc",
        page: index + 2,
        limit: 100,
      }),
    ),
  );
  return [firstPage, ...remainingPages].flatMap((result) => result.data);
}

export async function getEmployeeFilterOptions(): Promise<EmployeeFilterOptions> {
  return (
    await apiClient<ApiDataResponse<EmployeeFilterOptions>>(
      "/employees/filter-options",
    )
  ).data;
}

export async function getEmployeeById(
  employeeId: string,
): Promise<Employee | null> {
  try {
    return fromApi(
      (
        await apiClient<ApiDataResponse<EmployeeApiResponse>>(
          `/employees/${encodeURIComponent(employeeId)}`,
        )
      ).data,
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 404
    )
      return null;
    throw error;
  }
}

export async function getNextEmployeeCode(): Promise<string> {
  return (await apiClient<ApiDataResponse<string>>("/employees/next-code"))
    .data;
}

export async function createEmployee(
  values: CreateEmployeeValues,
): Promise<Employee> {
  return fromApi(
    (
      await apiClient<ApiDataResponse<EmployeeApiResponse>>("/employees", {
        method: "POST",
        body: JSON.stringify(values),
      })
    ).data,
  );
}

export async function getActiveEmployeeOptions(): Promise<Employee[]> {
  const first = await getEmployeePage({ isActive: true, page: 1, limit: 100 });
  if (first.pagination.totalPages <= 1) return first.data;
  const remaining = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
      getEmployeePage({ isActive: true, page: index + 2, limit: 100 }),
    ),
  );
  return [...first.data, ...remaining.flatMap((page) => page.data)];
}

export async function uploadEmployeeAvatar(
  employeeId: string,
  file: File,
): Promise<Employee> {
  const formData = new FormData();
  formData.append("file", file);
  return fromApi(
    (
      await apiFormDataClient<ApiDataResponse<EmployeeApiResponse>>(
        `/employees/${encodeURIComponent(employeeId)}/avatar`,
        "POST",
        formData,
      )
    ).data,
  );
}

export async function removeEmployeeAvatar(
  employeeId: string,
): Promise<Employee> {
  return fromApi(
    (
      await apiClient<ApiDataResponse<EmployeeApiResponse>>(
        `/employees/${encodeURIComponent(employeeId)}/avatar`,
        { method: "DELETE" },
      )
    ).data,
  );
}

export async function updateEmployee(
  employeeId: string,
  values: Omit<
    Partial<EmployeeFormValues>,
    "annualLeaveDays" | "gender" | "citizenId"
  > & {
    annualLeaveDays?: number | null;
    gender?: EmployeeFormValues["gender"] | null;
    citizenId?: string | null;
  },
): Promise<Employee> {
  const {
    employeeCode: _employeeCode,
    workUnit: _workUnit,
    ...payload
  } = values;
  return fromApi(
    (
      await apiClient<ApiDataResponse<EmployeeApiResponse>>(
        `/employees/${encodeURIComponent(employeeId)}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      )
    ).data,
  );
}
