import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, UsersRound } from 'lucide-react';
import { resolveApiAssetUrl } from '../services/api-client';
import type { Employee } from '../types/employees';
import {
  buildEmployeeHierarchy,
  collectExpandedEmployeeIds,
  filterEmployeeHierarchy,
  type EmployeeHierarchyNode,
} from '../utils/employee-hierarchy';
import { normalizeSearchText } from '../utils/formatters';
import { EmployeeStatusBadge } from './StatusBadge';

interface EmployeeHierarchyViewProps {
  employees: readonly Employee[];
  search: string;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  onOpenEmployee: (employeeId: string) => void;
}

interface EmployeeBranchProps {
  node: EmployeeHierarchyNode;
  depth: number;
  expandedOverrides: Readonly<Record<string, boolean>>;
  forcedExpandedIds: ReadonlySet<string>;
  matchingIds: ReadonlySet<string>;
  onToggle: (employeeId: string, expanded: boolean) => void;
  onOpenEmployee: (employeeId: string) => void;
}

function EmployeeBranch({
  node,
  depth,
  expandedOverrides,
  forcedExpandedIds,
  matchingIds,
  onToggle,
  onOpenEmployee,
}: EmployeeBranchProps) {
  const { employee, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = forcedExpandedIds.has(employee.id)
    || (expandedOverrides[employee.id] ?? depth === 0);

  return (
    <div className="employee-hierarchy-branch">
      <div className={`employee-hierarchy-row${matchingIds.has(employee.id) ? ' is-search-match' : ''}${employee.isActive ? '' : ' is-inactive'}`}>
        {hasChildren ? (
          <button
            className="employee-hierarchy-toggle"
            type="button"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Thu gọn' : 'Mở rộng'} nhánh ${employee.fullName}`}
            onClick={() => onToggle(employee.id, !isExpanded)}
          >
            {isExpanded
              ? <ChevronDown size={15} aria-hidden="true" />
              : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        ) : (
          <span className="employee-hierarchy-toggle-spacer" aria-hidden="true" />
        )}
        <button
          className="employee-hierarchy-main"
          type="button"
          onClick={() => onOpenEmployee(employee.id)}
        >
          <span className="employee-hierarchy-identity">
            <span className="employee-hierarchy-avatar" aria-hidden="true">
              <span>{employee.fullName.trim().charAt(0).toUpperCase() || 'N'}</span>
              {employee.avatarUrl && (
                <img
                  src={resolveApiAssetUrl(employee.avatarUrl)}
                  alt=""
                  onError={(event) => { event.currentTarget.hidden = true; }}
                />
              )}
            </span>
            <span className="employee-hierarchy-identity-copy">
              <span className="employee-hierarchy-name-line">
                <strong>{employee.fullName}</strong>
                <code>{employee.employeeCode}</code>
                {!employee.isActive && <EmployeeStatusBadge isActive={false} />}
              </span>
              <small>{employee.position || 'Chưa thiết lập chức danh'}</small>
            </span>
          </span>
          <span className="employee-hierarchy-department">
            <small>Phòng ban</small>
            <strong>{employee.department || 'Chưa thiết lập'}</strong>
          </span>
          <span className="employee-hierarchy-report-count">
            <UsersRound size={13} aria-hidden="true" />
            {children.length} nhân viên
          </span>
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div className="employee-hierarchy-children">
          {children.map((child) => (
            <EmployeeBranch
              key={child.employee.id}
              node={child}
              depth={depth + 1}
              expandedOverrides={expandedOverrides}
              forcedExpandedIds={forcedExpandedIds}
              matchingIds={matchingIds}
              onToggle={onToggle}
              onOpenEmployee={onOpenEmployee}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function EmployeeHierarchyView({
  employees,
  search,
  isLoading,
  hasError,
  onRetry,
  onOpenEmployee,
}: EmployeeHierarchyViewProps) {
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});
  const forest = useMemo(() => buildEmployeeHierarchy(employees), [employees]);
  const normalizedSearch = normalizeSearchText(search.trim());
  const matchingIds = useMemo(() => new Set(
    normalizedSearch
      ? employees
          .filter((employee) => [
            employee.employeeCode,
            employee.fullName,
            employee.department,
            employee.position,
          ].some((value) => normalizeSearchText(value).includes(normalizedSearch)))
          .map((employee) => employee.id)
      : [],
  ), [employees, normalizedSearch]);
  const visibleRoots = useMemo(
    () => normalizedSearch ? filterEmployeeHierarchy(forest.roots, matchingIds) : forest.roots,
    [forest.roots, matchingIds, normalizedSearch],
  );
  const visibleDetachedRoots = useMemo(
    () => normalizedSearch ? filterEmployeeHierarchy(forest.detachedRoots, matchingIds) : forest.detachedRoots,
    [forest.detachedRoots, matchingIds, normalizedSearch],
  );
  const forcedExpandedIds = useMemo(
    () => normalizedSearch
      ? collectExpandedEmployeeIds([...visibleRoots, ...visibleDetachedRoots])
      : new Set<string>(),
    [normalizedSearch, visibleDetachedRoots, visibleRoots],
  );

  if (isLoading) {
    return <div className="employee-hierarchy-message">Đang tải sơ đồ nhân sự...</div>;
  }
  if (hasError) {
    return <div className="employee-hierarchy-message"><p>Không thể tải sơ đồ nhân sự.</p><button className="secondary-button compact-button" type="button" onClick={onRetry}>Thử lại</button></div>;
  }
  if (visibleRoots.length === 0 && visibleDetachedRoots.length === 0) {
    return <div className="employee-hierarchy-message">{normalizedSearch ? 'Không tìm thấy nhân viên phù hợp.' : 'Chưa có dữ liệu nhân viên để hiển thị.'}</div>;
  }

  const branchProps = {
    expandedOverrides,
    forcedExpandedIds,
    matchingIds,
    onToggle: (employeeId: string, expanded: boolean) => setExpandedOverrides((current) => ({ ...current, [employeeId]: expanded })),
    onOpenEmployee,
  };

  return (
    <div className="employee-hierarchy-shell">
      {visibleRoots.length > 0 && (
        <section className="employee-hierarchy-group">
          <div className="employee-hierarchy-tree">
            {visibleRoots.map((node) => <EmployeeBranch key={node.employee.id} node={node} depth={0} {...branchProps} />)}
          </div>
        </section>
      )}
      {visibleDetachedRoots.length > 0 && (
        <section className="employee-hierarchy-group is-detached">
          <div className="employee-hierarchy-group-heading">
            <h3>Chưa xác định tuyến quản lý</h3>
            <p>Quản lý trực tiếp nằm ngoài phạm vi hiển thị hoặc dữ liệu phân cấp cần được kiểm tra.</p>
          </div>
          <div className="employee-hierarchy-tree">
            {visibleDetachedRoots.map((node) => <EmployeeBranch key={node.employee.id} node={node} depth={0} {...branchProps} />)}
          </div>
        </section>
      )}
    </div>
  );
}
