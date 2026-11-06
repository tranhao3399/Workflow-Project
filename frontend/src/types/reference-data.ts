import type { UserRole } from "./auth";

export type OrganizationUnitType =
  | "COMPANY"
  | "HEADQUARTERS"
  | "REGION"
  | "STORE"
  | "DEPARTMENT"
  | "FUNCTIONAL"
  | "UNCLASSIFIED";
export interface DepartmentOption {
  _id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  unitType?: OrganizationUnitType;
  parentId?: string;
  parentName?: string;
  managerEmployeeId?: string;
  managerName?: string;
  managerEmployeeCode?: string;
}
export interface PositionOption {
  _id: string;
  code: string;
  name: string;
  departmentId?: string | { _id: string; name: string };
  isActive: boolean;
  sortOrder: number;
}
export interface RoleOption {
  id?: string;
  _id?: string;
  key: UserRole;
  name: string;
  description?: string;
  permissions?: string[];
  permissionKeys?: string[];
  isSystem: boolean;
  isActive: boolean;
}
export interface ReferenceData {
  departments: DepartmentOption[];
  positions: PositionOption[];
  roles: RoleOption[];
}
