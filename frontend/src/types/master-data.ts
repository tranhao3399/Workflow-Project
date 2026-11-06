export type OrganizationUnitType =
  | "COMPANY"
  | "HEADQUARTERS"
  | "REGION"
  | "STORE"
  | "DEPARTMENT"
  | "FUNCTIONAL"
  | "UNCLASSIFIED";

export interface DepartmentPreview {
  id: string;
  name: string;
  code: string;
  managerName?: string;
  managerEmployeeId?: string;
  unitType: OrganizationUnitType;
  parentId?: string;
  parentName?: string;
  employeeCount: number;
  positions?: Array<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  }>;
  positionCount?: number;
  isActive: boolean;
}

export interface CreateDepartmentInput {
  name: string;
  code: string;
  isActive: boolean;
  positionIds?: string[];
  unitType: OrganizationUnitType;
  parentId?: string;
  managerEmployeeId?: string;
}

export interface DepartmentApiResponse {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  unitType: OrganizationUnitType;
  parentId?: string;
  managerEmployeeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationManagerOption {
  id: string;
  employeeCode: string;
  fullName: string;
  departmentId: string;
  workUnitId?: string;
}

export interface JobTitlePreview {
  id: string;
  name: string;
  code: string;
  level?: number;
  canApprove?: boolean;
  departmentCount: number;
  isActive: boolean;
}

export interface JobTitleInput {
  name: string;
  code: string;
  isActive: boolean;
}

export interface JobTitleApiResponse extends JobTitleInput {
  id: string;
}
