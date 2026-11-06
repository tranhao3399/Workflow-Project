import type {
  DepartmentPreview,
  OrganizationUnitType,
} from '../types/master-data';

export type OrganizationUnitTone =
  | 'company'
  | 'headquarters'
  | 'region'
  | 'store'
  | 'department'
  | 'unclassified';

export const MODERN_ORGANIZATION_UNIT_TYPES: readonly OrganizationUnitType[] = [
  'COMPANY',
  'HEADQUARTERS',
  'REGION',
  'STORE',
  'DEPARTMENT',
];

export const ORGANIZATION_UNIT_TYPE_LABELS: Record<
  OrganizationUnitType,
  string
> = {
  COMPANY: 'Công ty',
  HEADQUARTERS: 'Trụ sở chính',
  REGION: 'Khu vực',
  STORE: 'Cửa hàng',
  DEPARTMENT: 'Phòng ban',
  FUNCTIONAL: 'Đơn vị chức năng (cũ)',
  UNCLASSIFIED: 'Chưa phân loại',
};

export const ORGANIZATION_UNIT_TYPE_TONES: Record<
  OrganizationUnitType,
  OrganizationUnitTone
> = {
  COMPANY: 'company',
  HEADQUARTERS: 'headquarters',
  REGION: 'region',
  STORE: 'store',
  DEPARTMENT: 'department',
  FUNCTIONAL: 'department',
  UNCLASSIFIED: 'unclassified',
};

export interface OrganizationTreeNode {
  department: DepartmentPreview;
  children: OrganizationTreeNode[];
}

export interface OrganizationTreeGroups {
  companyRoots: OrganizationTreeNode[];
  unsortedRoots: OrganizationTreeNode[];
}

export function allowedOrganizationParentTypes(
  type: OrganizationUnitType,
): OrganizationUnitType[] | null {
  switch (type) {
    case 'COMPANY':
      return [];
    case 'HEADQUARTERS':
    case 'REGION':
      return ['COMPANY'];
    case 'STORE':
      return ['REGION'];
    case 'DEPARTMENT':
      return ['COMPANY', 'HEADQUARTERS', 'DEPARTMENT'];
    case 'FUNCTIONAL':
    case 'UNCLASSIFIED':
      return null;
  }
}

export function isOrganizationParentAllowed(
  childType: OrganizationUnitType,
  parentType: OrganizationUnitType,
): boolean {
  const allowed = allowedOrganizationParentTypes(childType);
  return allowed === null || allowed.includes(parentType);
}

export function isOrganizationParentRequired(
  unitType: OrganizationUnitType,
): boolean {
  return (allowedOrganizationParentTypes(unitType)?.length ?? 0) > 0;
}

export interface EligibleOrganizationManagerCandidate {
  id: string;
  employeeCode?: string;
  fullName: string;
  departmentId?: string;
  workUnitId?: string;
}

export function isEligibleOrganizationManager(
  manager: EligibleOrganizationManagerCandidate | null | undefined,
  targetDepartmentId?: string,
  targetWorkUnitId?: string,
): boolean {
  if (!manager) return false;
  if (targetWorkUnitId && manager.workUnitId === targetWorkUnitId) return true;
  if (targetDepartmentId && manager.departmentId === targetDepartmentId) return true;
  return false;
}

export function getOrganizationAncestryPath(
  departments: readonly DepartmentPreview[],
  targetId: string,
): DepartmentPreview[] {
  const byId = new Map(departments.map((department) => [department.id, department]));
  const path: DepartmentPreview[] = [];
  const visited = new Set<string>();
  let current = byId.get(targetId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path;
}

export function getDescendantDepartmentIds(
  departments: readonly DepartmentPreview[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const department of departments) {
    if (!department.parentId || department.parentId === department.id) continue;
    const list = childrenByParent.get(department.parentId) ?? [];
    list.push(department.id);
    childrenByParent.set(department.parentId, list);
  }

  const descendants = new Set<string>();
  const queue = [...(childrenByParent.get(rootId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === rootId || descendants.has(current)) continue;
    descendants.add(current);
    const nextChildren = childrenByParent.get(current);
    if (nextChildren) queue.push(...nextChildren);
  }
  return descendants;
}

export function buildOrganizationTree(
  departments: DepartmentPreview[],
): OrganizationTreeGroups {
  const byId = new Map(
    departments.map((department) => [department.id, department]),
  );
  const parentById = new Map<string, string>();

  for (const department of departments) {
    const parent = department.parentId
      ? byId.get(department.parentId)
      : undefined;
    if (
      parent &&
      parent.id !== department.id &&
      department.unitType !== 'UNCLASSIFIED' &&
      isOrganizationParentAllowed(department.unitType, parent.unitType)
    ) {
      parentById.set(department.id, parent.id);
    }
  }

  const cyclicIds = new Set<string>();
  for (const department of departments) {
    const path: string[] = [];
    const indexById = new Map<string, number>();
    let cursor: string | undefined = department.id;
    while (cursor && parentById.has(cursor)) {
      const repeatedAt = indexById.get(cursor);
      if (repeatedAt !== undefined) {
        path.slice(repeatedAt).forEach((id) => cyclicIds.add(id));
        break;
      }
      indexById.set(cursor, path.length);
      path.push(cursor);
      cursor = parentById.get(cursor);
    }
  }
  for (const id of cyclicIds) parentById.delete(id);

  const nodes = new Map<string, OrganizationTreeNode>(
    departments.map((department): [string, OrganizationTreeNode] => [
      department.id,
      { department, children: [] },
    ]),
  );
  const roots: OrganizationTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = parentById.get(node.department.id);
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const companyRoots: OrganizationTreeNode[] = [];
  const unsortedRoots: OrganizationTreeNode[] = [];
  for (const root of roots) {
    const { department } = root;
    const isExplicitlyUnclassified = department.unitType === 'UNCLASSIFIED';
    const hasParentId = Boolean(
      department.parentId &&
        department.parentId.trim() !== '' &&
        department.parentId !== department.id,
    );
    const isCyclic = cyclicIds.has(department.id);
    const isExplicitCompany =
      department.unitType === 'COMPANY' && !hasParentId && !isCyclic;
    const isGenericRoot =
      !hasParentId && !isCyclic && !isExplicitlyUnclassified;

    if (isExplicitCompany || isGenericRoot) companyRoots.push(root);
    else unsortedRoots.push(root);
  }

  return { companyRoots, unsortedRoots };
}

export function filterOrganizationTree(
  roots: OrganizationTreeNode[],
  matches: ReadonlySet<string>,
): OrganizationTreeNode[] {
  if (matches.size === 0) return roots;
  const filterNode = (
    node: OrganizationTreeNode,
  ): OrganizationTreeNode | null => {
    if (matches.has(node.department.id)) return node;
    const children = node.children
      .map(filterNode)
      .filter((child): child is OrganizationTreeNode => child !== null);
    if (children.length === 0) return null;
    return { ...node, children };
  };
  return roots
    .map(filterNode)
    .filter((node): node is OrganizationTreeNode => node !== null);
}

export function getOrganizationSearchMatches(
  departments: DepartmentPreview[],
  search: string,
  normalize: (value: string) => string,
): Set<string> {
  const normalized = normalize(search);
  if (!normalized) return new Set();
  return new Set(
    departments
      .filter((department) =>
        [department.name, department.code, department.managerName ?? ''].some(
          (value) => normalize(value).includes(normalized),
        ),
      )
      .map((department) => department.id),
  );
}

export function getOrganizationSearchExpandedIds(
  roots: OrganizationTreeNode[],
  matches: ReadonlySet<string>,
): Set<string> {
  const expanded = new Set<string>();
  const visit = (node: OrganizationTreeNode): boolean => {
    let hasMatchInBranch = matches.has(node.department.id);
    for (const child of node.children) {
      if (visit(child)) hasMatchInBranch = true;
    }
    if (hasMatchInBranch && node.children.length > 0) {
      expanded.add(node.department.id);
    }
    return hasMatchInBranch;
  };
  roots.forEach(visit);
  return expanded;
}
