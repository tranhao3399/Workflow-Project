import type { Employee } from '../types/employees';

export interface EmployeeHierarchyNode {
  employee: Employee;
  children: EmployeeHierarchyNode[];
}

export interface EmployeeHierarchyForest {
  roots: EmployeeHierarchyNode[];
  detachedRoots: EmployeeHierarchyNode[];
}

function compareEmployees(left: Employee, right: Employee): number {
  return left.fullName.localeCompare(right.fullName, 'vi');
}

export function buildEmployeeHierarchy(
  employees: readonly Employee[],
): EmployeeHierarchyForest {
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const childrenByManagerId = new Map<string, string[]>();
  const rootIds: string[] = [];
  const detachedIds: string[] = [];

  for (const employee of employees) {
    if (!employee.managerId) {
      rootIds.push(employee.id);
      continue;
    }
    if (!employeesById.has(employee.managerId)) {
      detachedIds.push(employee.id);
      continue;
    }
    childrenByManagerId.set(employee.managerId, [
      ...(childrenByManagerId.get(employee.managerId) ?? []),
      employee.id,
    ]);
  }

  const visited = new Set<string>();
  const buildNode = (employeeId: string, ancestors: ReadonlySet<string>): EmployeeHierarchyNode | null => {
    const employee = employeesById.get(employeeId);
    if (!employee || ancestors.has(employeeId)) return null;
    visited.add(employeeId);
    const nextAncestors = new Set(ancestors).add(employeeId);
    const children = (childrenByManagerId.get(employeeId) ?? [])
      .map((childId) => buildNode(childId, nextAncestors))
      .filter((node): node is EmployeeHierarchyNode => Boolean(node))
      .sort((left, right) => compareEmployees(left.employee, right.employee));
    return { employee, children };
  };

  const buildRoots = (ids: readonly string[]) => ids
    .map((id) => buildNode(id, new Set()))
    .filter((node): node is EmployeeHierarchyNode => Boolean(node))
    .sort((left, right) => compareEmployees(left.employee, right.employee));

  const roots = buildRoots(rootIds);
  const detachedRoots = buildRoots(detachedIds);

  // Existing malformed data may contain a closed cycle with no root. Keep it
  // visible for administrators instead of silently dropping those employees.
  for (const employee of [...employees].sort(compareEmployees)) {
    if (visited.has(employee.id)) continue;
    const node = buildNode(employee.id, new Set());
    if (node) detachedRoots.push(node);
  }

  detachedRoots.sort((left, right) => compareEmployees(left.employee, right.employee));

  return { roots, detachedRoots };
}

export function filterEmployeeHierarchy(
  nodes: readonly EmployeeHierarchyNode[],
  matchingIds: ReadonlySet<string>,
): EmployeeHierarchyNode[] {
  return nodes.flatMap((node) => {
    const children = filterEmployeeHierarchy(node.children, matchingIds);
    return matchingIds.has(node.employee.id) || children.length > 0
      ? [{ ...node, children }]
      : [];
  });
}

export function collectExpandedEmployeeIds(
  nodes: readonly EmployeeHierarchyNode[],
): Set<string> {
  const result = new Set<string>();
  const visit = (node: EmployeeHierarchyNode) => {
    if (node.children.length > 0) result.add(node.employee.id);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}
