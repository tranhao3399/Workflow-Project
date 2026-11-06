import type { Employee } from "../types/employees";
import type { DepartmentOption } from "../types/reference-data";

const WORK_UNIT_TYPES = new Set(["COMPANY", "HEADQUARTERS", "REGION", "STORE"]);
const FUNCTIONAL_TYPES = new Set(["DEPARTMENT", "FUNCTIONAL", "UNCLASSIFIED"]);

export function workUnitOptions(
  departments: DepartmentOption[],
): DepartmentOption[] {
  return departments.filter(
    (item) =>
      item.isActive && WORK_UNIT_TYPES.has(item.unitType ?? "UNCLASSIFIED"),
  );
}

export function functionalDepartmentOptions(
  departments: DepartmentOption[],
): DepartmentOption[] {
  return departments.filter(
    (item) =>
      item.isActive && FUNCTIONAL_TYPES.has(item.unitType ?? "UNCLASSIFIED"),
  );
}

export function suggestedManagerId(
  departments: DepartmentOption[],
  workUnitId: string | undefined,
  people: Employee[],
  excludedEmployeeId?: string,
): string | undefined {
  if (!workUnitId) return undefined;
  const byId = new Map(departments.map((item) => [item._id, item]));
  const activePeople = new Set(
    people
      .filter((person) => person.isActive && person.id !== excludedEmployeeId)
      .map((person) => person.id),
  );
  const visited = new Set<string>();
  let current = byId.get(workUnitId);
  while (current && !visited.has(current._id)) {
    visited.add(current._id);
    if (
      current.managerEmployeeId &&
      activePeople.has(current.managerEmployeeId)
    ) {
      return current.managerEmployeeId;
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}

export function workUnitLabel(
  unit: Pick<DepartmentOption, "name" | "unitType">,
): string {
  const prefix =
    unit.unitType === "COMPANY"
      ? "Công ty"
      : unit.unitType === "REGION"
        ? "Khu vực"
        : unit.unitType === "STORE"
          ? "Cửa hàng"
          : unit.unitType === "HEADQUARTERS"
            ? "Trụ sở"
            : "Đơn vị";
  return `${prefix} · ${unit.name}`;
}
