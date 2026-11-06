import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import type {
  DepartmentPreview,
  OrganizationUnitType,
} from '../../types/master-data';
import { normalizeSearchText } from '../../utils/formatters';
import {
  allowedOrganizationParentTypes,
  buildOrganizationTree,
  filterOrganizationTree,
  getDescendantDepartmentIds,
  isOrganizationParentAllowed,
  isOrganizationParentRequired,
  ORGANIZATION_UNIT_TYPE_LABELS,
  type OrganizationTreeNode,
} from '../../utils/organization-tree';

interface OrganizationParentSelectProps {
  ariaLabel: string;
  departments: readonly DepartmentPreview[];
  unitType: OrganizationUnitType;
  value: string;
  excludeUnitId?: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (parentId: string) => void;
  onInvalidSelection?: (department: DepartmentPreview) => void;
  onBlur?: () => void;
}

export function OrganizationParentSelect({
  ariaLabel,
  departments,
  unitType,
  value,
  excludeUnitId,
  disabled = false,
  invalid = false,
  onChange,
  onInvalidSelection,
  onBlur,
}: OrganizationParentSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [opensUpward, setOpensUpward] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverId = useId();

  const isControlDisabled = disabled;
  const isRequired = isOrganizationParentRequired(unitType);
  const allowedTypes = allowedOrganizationParentTypes(unitType);

  const activeDepartments = useMemo(
    () => departments.filter((unit) => unit.isActive || unit.id === value),
    [departments, value],
  );

  const descendantIds = useMemo(
    () =>
      excludeUnitId
        ? getDescendantDepartmentIds(activeDepartments, excludeUnitId)
        : new Set<string>(),
    [activeDepartments, excludeUnitId],
  );

  const selectedUnit = useMemo(
    () => activeDepartments.find((unit) => unit.id === value),
    [activeDepartments, value],
  );

  const { prunedCompanyRoots, prunedUnsortedRoots, selectableCount } =
    useMemo(() => {
      const { companyRoots, unsortedRoots } =
        buildOrganizationTree(activeDepartments);

      const canSelectUnit = (unit: DepartmentPreview) =>
        unit.id !== excludeUnitId &&
        !descendantIds.has(unit.id) &&
        isOrganizationParentAllowed(unitType, unit.unitType);

      const pruneNodes = (nodes: OrganizationTreeNode[]): OrganizationTreeNode[] =>
        nodes.flatMap((node) => {
        const nextChildren = pruneNodes(node.children);
        if (node.department.id === excludeUnitId) return nextChildren;
        const canSelect = canSelectUnit(node.department);
        const isInvalidDescendant = descendantIds.has(node.department.id);

        if (
          canSelect ||
          (onInvalidSelection && isInvalidDescendant) ||
          nextChildren.length > 0
        ) {
          return [{ department: node.department, children: nextChildren }];
        }
        return [];
      });

      return {
        prunedCompanyRoots: pruneNodes(companyRoots),
        prunedUnsortedRoots: pruneNodes(unsortedRoots),
        selectableCount: activeDepartments.filter(
          (unit) =>
            canSelectUnit(unit) ||
            Boolean(onInvalidSelection && descendantIds.has(unit.id)),
        ).length,
      };
    }, [
      activeDepartments,
      descendantIds,
      excludeUnitId,
      onInvalidSelection,
      unitType,
    ]);

  const normalizedQuery = normalizeSearchText(search);
  const searchMatches = useMemo(() => {
    if (!normalizedQuery) return new Set<string>();
    return new Set(
      activeDepartments
        .filter((unit) =>
          [unit.name, unit.code].some((text) =>
            normalizeSearchText(text).includes(normalizedQuery),
          ),
        )
        .map((unit) => unit.id),
    );
  }, [activeDepartments, normalizedQuery]);

  const visibleCompanyRoots = useMemo(
    () =>
      normalizedQuery
        ? filterOrganizationTree(prunedCompanyRoots, searchMatches)
        : prunedCompanyRoots,
    [normalizedQuery, prunedCompanyRoots, searchMatches],
  );

  const visibleUnsortedRoots = useMemo(
    () =>
      normalizedQuery
        ? filterOrganizationTree(prunedUnsortedRoots, searchMatches)
        : prunedUnsortedRoots,
    [normalizedQuery, prunedUnsortedRoots, searchMatches],
  );

  useEffect(() => {
    if (!isOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
        onBlur?.();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        setSearch('');
        triggerRef.current?.focus();
        onBlur?.();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onBlur]);

  function togglePopover() {
    if (isControlDisabled) return;
    if (isOpen) {
      setIsOpen(false);
      setSearch('');
      onBlur?.();
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    setOpensUpward(
      Boolean(rect && window.innerHeight - rect.bottom < 320 && rect.top > 320),
    );
    setCollapsedIds(new Set());
    setSearch('');
    setIsOpen(true);
  }

  function toggleCollapse(unitId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  function handleSelect(nextParentId: string) {
    onChange(nextParentId);
    setIsOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  }

  function renderTreeNode(node: OrganizationTreeNode, depth: number) {
    const { department } = node;
    const hasChildren = node.children.length > 0;
    const isExpanded =
      Boolean(normalizedQuery) || !collapsedIds.has(department.id);

    const isDescendant = descendantIds.has(department.id);
    const isAllowed = isOrganizationParentAllowed(
      unitType,
      department.unitType,
    );
    const isSelectable = isAllowed || Boolean(onInvalidSelection && isDescendant);
    const isSelected = department.id === value;
    const isSearchHit =
      Boolean(normalizedQuery) && searchMatches.has(department.id);

    return (
      <div
        className="org-parent-tree-branch"
        key={department.id}
        data-depth={depth}
      >
        <div
          className={`org-parent-tree-row${isSelected ? ' is-selected' : ''}${!isSelectable ? ' is-disabled' : ''}${isSearchHit ? ' is-search-match' : ''}`}
          style={{ paddingLeft: `${6 + depth * 18}px` }}
        >
          {hasChildren ? (
            <button
              className="org-parent-tree-chevron"
              type="button"
              aria-label={
                isExpanded
                  ? `Thu gọn ${department.name}`
                  : `Mở rộng ${department.name}`
              }
              onClick={() => toggleCollapse(department.id)}
            >
              {isExpanded ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronRight size={14} aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="org-parent-tree-leaf-spacer" aria-hidden="true">
              <span className="org-parent-tree-leaf-dot" />
            </span>
          )}

          <button
            className="org-parent-tree-option"
            type="button"
            disabled={!isSelectable}
            title={department.name}
            onClick={() => {
              if (isDescendant && onInvalidSelection) {
                onInvalidSelection(department);
                setIsOpen(false);
                setSearch('');
                triggerRef.current?.focus();
                return;
              }
              handleSelect(department.id);
            }}
          >
            <span className="org-parent-tree-copy">
              <span className="org-parent-tree-title">
                <strong>{department.name}</strong>
              </span>
            </span>
            {isSelected && (
              <Check
                className="org-parent-tree-check"
                size={15}
                aria-hidden="true"
              />
            )}
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="org-parent-tree-children">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  const hasVisibleNodes =
    visibleCompanyRoots.length > 0 || visibleUnsortedRoots.length > 0;

  return (
    <div
      className={`org-parent-select${isOpen ? ' is-open' : ''}${opensUpward ? ' opens-upward' : ''}${invalid ? ' is-invalid' : ''}`}
      ref={rootRef}
    >
      <button
        className="org-parent-select-trigger"
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={popoverId}
        aria-invalid={invalid}
        disabled={isControlDisabled}
        onClick={togglePopover}
      >
        {selectedUnit ? (
          <span className="org-parent-select-value" title={selectedUnit.name}>
            <span className="org-parent-trigger-text">
              <strong>{selectedUnit.name}</strong>
            </span>
          </span>
        ) : (
          <span className="org-parent-select-placeholder">
            {isRequired ? 'Chọn phòng ban cấp trên...' : 'Không có'}
          </span>
        )}
        <ChevronDown
          className="org-parent-trigger-chevron"
          size={16}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="org-parent-select-popover"
          id={popoverId}
          role="dialog"
          aria-label={ariaLabel}
        >
          <div className="org-parent-select-header">
            <div className="org-parent-search-box">
              <Search size={14} aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên hoặc mã phòng ban..."
                aria-label="Tìm phòng ban cấp trên"
              />
              {search && (
                <button
                  className="org-parent-search-clear"
                  type="button"
                  aria-label="Xóa từ khóa tìm kiếm"
                  onClick={() => {
                    setSearch('');
                    searchInputRef.current?.focus();
                  }}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <div className="org-parent-select-body">
            {!isRequired && !normalizedQuery && (
              <button
                className={`org-parent-none-option${value === '' ? ' is-selected' : ''}`}
                type="button"
                onClick={() => handleSelect('')}
              >
                <span>Không có</span>
                {value === '' && <Check size={15} aria-hidden="true" />}
              </button>
            )}

            {selectableCount === 0 ? (
              <div className="org-parent-empty-state">
                <strong>Chưa có phòng ban cấp trên phù hợp</strong>
                <span>
                  {allowedTypes && allowedTypes.length > 0
                    ? `Cần có ít nhất một phòng ban đang hoạt động thuộc loại ${allowedTypes
                        .map((type) => ORGANIZATION_UNIT_TYPE_LABELS[type])
                        .join(' hoặc ')}.`
                    : 'Chưa có phòng ban nào đang hoạt động để lựa chọn.'}
                </span>
              </div>
            ) : !hasVisibleNodes ? (
              <div className="org-parent-empty-state">
                <strong>Không tìm thấy phòng ban phù hợp</strong>
                <span>Thử tìm bằng tên khác hoặc mã phòng ban viết tắt.</span>
              </div>
            ) : (
              <div className="org-parent-tree-list">
                {visibleCompanyRoots.map((root) => renderTreeNode(root, 0))}
                {visibleUnsortedRoots.length > 0 && (
                  <div className="org-parent-unsorted-section">
                    {visibleCompanyRoots.length > 0 && (
                      <div className="org-parent-section-divider">
                        Phòng ban khác
                      </div>
                    )}
                    {visibleUnsortedRoots.map((root) => renderTreeNode(root, 0))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
