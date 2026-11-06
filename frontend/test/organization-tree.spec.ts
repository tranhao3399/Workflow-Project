import { describe, expect, it } from "vitest";
import {
  buildOrganizationTree,
  filterOrganizationTree,
  getDescendantDepartmentIds,
  getOrganizationAncestryPath,
  getOrganizationSearchExpandedIds,
  getOrganizationSearchMatches,
  isEligibleOrganizationManager,
  isOrganizationParentAllowed,
  isOrganizationParentRequired,
} from "../src/utils/organization-tree";
import type { DepartmentPreview } from "../src/types/master-data";

function unit(
  id: string,
  unitType: DepartmentPreview["unitType"],
  parentId?: string,
): DepartmentPreview {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    unitType,
    parentId,
    employeeCount: 0,
    isActive: true,
  };
}

describe("organization tree", () => {
  it("builds NexaSport with two regions, seven stores and direct departments from parentId", () => {
    const groups = buildOrganizationTree([
      unit("nexasport", "COMPANY"),
      unit("hcm", "REGION", "nexasport"),
      unit("hn", "REGION", "nexasport"),
      ...Array.from({ length: 4 }, (_, index) =>
        unit(`hcm-store-${index + 1}`, "STORE", "hcm"),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        unit(`hn-store-${index + 1}`, "STORE", "hn"),
      ),
      unit("board", "DEPARTMENT", "nexasport"),
      unit("sales", "DEPARTMENT", "nexasport"),
    ]);

    const company = groups.companyRoots[0];
    const regions = company.children.filter(
      (child) => child.department.unitType === "REGION",
    );
    const departments = company.children.filter(
      (child) => child.department.unitType === "DEPARTMENT",
    );

    expect(groups.unsortedRoots).toHaveLength(0);
    expect(regions).toHaveLength(2);
    expect(regions.find((region) => region.department.id === "hcm")?.children).toHaveLength(4);
    expect(regions.find((region) => region.department.id === "hn")?.children).toHaveLength(3);
    expect(departments.map((department) => department.department.id)).toEqual([
      "board",
      "sales",
    ]);
  });

  it("keeps company, headquarters, departments and multiple stores in database hierarchy", () => {
    const groups = buildOrganizationTree([
      unit("company", "COMPANY"),
      unit("headquarters", "HEADQUARTERS", "company"),
      unit("finance", "DEPARTMENT", "headquarters"),
      unit("hcm", "REGION", "company"),
      unit("store-1", "STORE", "hcm"),
      unit("store-2", "STORE", "hcm"),
      unit("empty-region", "REGION", "company"),
    ]);

    expect(groups.companyRoots).toHaveLength(1);
    expect(
      groups.companyRoots[0].children.map((child) => child.department.id),
    ).toEqual(["headquarters", "hcm", "empty-region"]);
    expect(groups.companyRoots[0].children[0].children[0].department.id).toBe(
      "finance",
    );
    expect(groups.companyRoots[0].children[1].children).toHaveLength(2);
    expect(groups.companyRoots[0].children[2].children).toHaveLength(0);
    expect(groups.unsortedRoots).toHaveLength(0);
  });

  it("puts unclassified units, missing parents and invalid parent types under unsorted", () => {
    const groups = buildOrganizationTree([
      unit("company", "COMPANY"),
      unit("legacy", "UNCLASSIFIED"),
      unit("orphan", "STORE", "missing-region"),
      unit("invalid-store", "STORE", "company"),
    ]);

    expect(groups.companyRoots.map((node) => node.department.id)).toEqual([
      "company",
    ]);
    expect(groups.unsortedRoots.map((node) => node.department.id)).toEqual([
      "legacy",
      "orphan",
      "invalid-store",
    ]);
  });

  it("breaks cycle links into unsorted roots instead of recursing indefinitely", () => {
    const groups = buildOrganizationTree([
      unit("a", "FUNCTIONAL", "b"),
      unit("b", "FUNCTIONAL", "a"),
    ]);

    expect(groups.unsortedRoots.map((node) => node.department.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("keeps a deep search match visible, opens its ancestors and marks the matching unit", () => {
    const { companyRoots } = buildOrganizationTree([
      unit("company", "COMPANY"),
      unit("hanoi", "REGION", "company"),
      unit("store-hn", "STORE", "hanoi"),
    ]);
    const departments = [
      unit("company", "COMPANY"),
      unit("hanoi", "REGION", "company"),
      unit("store-hn", "STORE", "hanoi"),
    ];
    const matches = getOrganizationSearchMatches(
      departments,
      "store-hn",
      (value) => value.toLowerCase(),
    );
    const visible = filterOrganizationTree(companyRoots, matches);
    const expanded = getOrganizationSearchExpandedIds(visible, matches);

    expect(visible[0].children[0].children[0].department.id).toBe("store-hn");
    expect(expanded).toEqual(new Set(["company", "hanoi"]));
    expect(matches).toEqual(new Set(["store-hn"]));
  });

  it("computes descendant ids and ancestry paths safely even when cycles exist", () => {
    const departments = [
      unit("nexasport", "COMPANY"),
      unit("hq", "HEADQUARTERS", "nexasport"),
      unit("finance", "DEPARTMENT", "hq"),
      unit("tax-team", "DEPARTMENT", "finance"),
      unit("cycle-a", "DEPARTMENT", "cycle-b"),
      unit("cycle-b", "DEPARTMENT", "cycle-a"),
    ];

    expect(getDescendantDepartmentIds(departments, "hq")).toEqual(
      new Set(["finance", "tax-team"]),
    );
    expect(getDescendantDepartmentIds(departments, "cycle-a")).toEqual(
      new Set(["cycle-b"]),
    );
    expect(
      getOrganizationAncestryPath(departments, "tax-team").map((item) => item.id),
    ).toEqual(["nexasport", "hq", "finance", "tax-team"]);
    expect(
      getOrganizationAncestryPath(departments, "cycle-a").map((item) => item.id),
    ).toEqual(["cycle-b", "cycle-a"]);
  });

  it("validates parent unit rules and matrix manager eligibility", () => {
    expect(isOrganizationParentRequired("COMPANY")).toBe(false);
    expect(isOrganizationParentRequired("STORE")).toBe(true);
    expect(isOrganizationParentAllowed("STORE", "REGION")).toBe(true);
    expect(isOrganizationParentAllowed("STORE", "COMPANY")).toBe(false);
    expect(isOrganizationParentAllowed("DEPARTMENT", "HEADQUARTERS")).toBe(true);

    const regionalManager = {
      id: "emp-1",
      employeeCode: "NV001",
      fullName: "Quản lý Khu vực",
      departmentId: "dept-ops",
      workUnitId: "region-hcm",
    };
    expect(
      isEligibleOrganizationManager(regionalManager, undefined, "region-hcm"),
    ).toBe(true);
    expect(
      isEligibleOrganizationManager(regionalManager, "dept-ops", "nexasport"),
    ).toBe(true);
    expect(
      isEligibleOrganizationManager(regionalManager, "store-hn", "region-hn"),
    ).toBe(false);
  });
});
