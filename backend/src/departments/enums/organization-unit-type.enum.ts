export enum OrganizationUnitType {
  COMPANY = 'COMPANY',
  HEADQUARTERS = 'HEADQUARTERS',
  REGION = 'REGION',
  STORE = 'STORE',
  DEPARTMENT = 'DEPARTMENT',
  /** @deprecated Kept for records created before explicit headquarters/department types. */
  FUNCTIONAL = 'FUNCTIONAL',
  UNCLASSIFIED = 'UNCLASSIFIED',
}

export const ORGANIZATION_UNIT_TYPES = Object.values(OrganizationUnitType);
