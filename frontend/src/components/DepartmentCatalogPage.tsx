import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  List,
  Network,
  UsersRound,
} from 'lucide-react';
import { getDepartmentsFromApi } from '../services/master-data.service';
import type { DepartmentPreview } from '../types/master-data';
import { normalizeSearchText } from '../utils/formatters';
import {
  buildOrganizationTree,
  filterOrganizationTree,
  getOrganizationSearchExpandedIds,
  type OrganizationTreeNode as OrganizationTreeNodeData,
} from '../utils/organization-tree';
import { ErrorState, LoadingState } from './DataStates';
import { AdvancedFilterPanel } from './ui/AdvancedFilterPanel';
import { DataTable, EmptyTableRow } from './ui/DataTable';
import { FilterSelect } from './ui/FilterSelect';
import { ListToolbar } from './ui/ListToolbar';
import { DepartmentStatusBadge } from './ui/MasterDataStatusBadge';
import { PageHeader } from './ui/PageHeader';
import { SurfaceCard } from './ui/SurfaceCard';
import { SortableTableHeader } from './ui/SortableTableHeader';
import { TablePagination } from './ui/TablePagination';

type ViewMode = 'LIST' | 'TREE';
type PageSize = 10 | 20 | 50;
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const EMPTY_ID_SET: ReadonlySet<string> = new Set<string>();

interface DepartmentCatalogPageProps {
  onOpenDepartment: (departmentId: string) => void;
  onCreateDepartment: () => void;
  canCreateDepartment: boolean;
  initialViewMode?: ViewMode;
  onViewModeChange?: (viewMode: ViewMode) => void;
}

interface OrganizationUnitRowProps {
  node: OrganizationTreeNodeData;
  isExpanded: boolean;
  isSearchMatch: boolean;
  isCompanyRoot?: boolean;
  needsConfiguration?: boolean;
  onToggle: (departmentId: string, expanded: boolean) => void;
  onOpen: (departmentId: string) => void;
}

function OrganizationUnitRow({
  node,
  isExpanded,
  isSearchMatch,
  isCompanyRoot = false,
  needsConfiguration = false,
  onToggle,
  onOpen,
}: OrganizationUnitRowProps) {
  const { department, children } = node;
  const positionCount =
    department.positionCount ?? department.positions?.length ?? 0;
  const employeeCount = department.employeeCount ?? 0;
  const hasChildren = children.length > 0;

  const rowClasses = [
    'organization-vertical-row',
    isCompanyRoot ? 'is-company-root' : '',
    !department.isActive ? 'is-inactive' : '',
    isSearchMatch ? 'is-search-match' : '',
    needsConfiguration ? 'needs-configuration' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClasses}>
      <button
        className="organization-vertical-toggle"
        type="button"
        onClick={() => onToggle(department.id, !isExpanded)}
        disabled={!hasChildren}
        aria-label={
          hasChildren
            ? isExpanded
              ? `Thu gọn nhánh ${department.name}`
              : `Mở rộng nhánh ${department.name}`
            : undefined
        }
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
          )
        ) : (
          <span className="organization-leaf-dot" aria-hidden="true" />
        )}
      </button>
      <button
        className="organization-vertical-main"
        type="button"
        onClick={() => onOpen(department.id)}
        aria-label={`Mở chi tiết ${department.name}`}
      >
        <span className="organization-unit-identity">
          <span className="organization-vertical-primary">
            <span className="organization-unit-title-line">
              <strong>{department.name}</strong>
              <code className="department-code-pill">{department.code}</code>
              {!department.isActive && (
                <DepartmentStatusBadge isActive={false} />
              )}
            </span>
            {hasChildren && (
              <small className="organization-sub-count">
                {children.length} đơn vị trực thuộc
              </small>
            )}
          </span>
        </span>
        <span className="organization-vertical-manager">
          <small>Người quản lý</small>
          <strong className={department.managerName ? '' : 'is-unassigned'}>
            {department.managerName ?? 'Chưa phân công'}
          </strong>
        </span>
        <span className="organization-vertical-metrics">
          <span
            className="organization-employee-count"
            title="Số nhân viên được gán vào đơn vị"
          >
            <UsersRound size={12} strokeWidth={2} aria-hidden="true" />
            {employeeCount} nhân viên
          </span>
          {positionCount > 0 && (
            <span
              className="organization-position-count"
              title="Số chức danh áp dụng"
            >
              {positionCount} chức danh
            </span>
          )}
        </span>
        {needsConfiguration && (
          <span className="organization-configuration-warning">
            Cần bổ sung thông tin phân cấp hợp lệ
          </span>
        )}
      </button>
    </div>
  );
}

interface OrganizationBranchProps {
  node: OrganizationTreeNodeData;
  depth?: number;
  expandedOverrides: Readonly<Record<string, boolean>>;
  forcedExpandedIds: ReadonlySet<string>;
  matchingIds: ReadonlySet<string>;
  needsConfiguration?: boolean;
  onToggle: (departmentId: string, expanded: boolean) => void;
  onOpen: (departmentId: string) => void;
}

function OrganizationBranch({
  node,
  depth = 0,
  expandedOverrides,
  forcedExpandedIds,
  matchingIds,
  needsConfiguration = false,
  onToggle,
  onOpen,
}: OrganizationBranchProps) {
  const defaultExpanded = !needsConfiguration && depth < 1;
  const isExpanded =
    forcedExpandedIds.has(node.department.id) ||
    (expandedOverrides[node.department.id] ?? defaultExpanded);
  return (
    <div className="organization-vertical-branch">
      <OrganizationUnitRow
        node={node}
        isExpanded={isExpanded}
        isSearchMatch={matchingIds.has(node.department.id)}
        needsConfiguration={needsConfiguration}
        onToggle={onToggle}
        onOpen={onOpen}
      />
      {isExpanded && node.children.length > 0 && (
        <div className="organization-vertical-children">
          {node.children.map((child) => (
            <OrganizationBranch
              key={child.department.id}
              node={child}
              depth={depth + 1}
              expandedOverrides={expandedOverrides}
              forcedExpandedIds={forcedExpandedIds}
              matchingIds={matchingIds}
              needsConfiguration={needsConfiguration}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface OrganizationCompanyTreeProps
  extends Omit<
    OrganizationBranchProps,
    'node' | 'depth' | 'needsConfiguration'
  > {
  node: OrganizationTreeNodeData;
}

function OrganizationCompanyTree({
  node,
  expandedOverrides,
  forcedExpandedIds,
  matchingIds,
  onToggle,
  onOpen,
}: OrganizationCompanyTreeProps) {
  const isRootExpanded =
    forcedExpandedIds.has(node.department.id) ||
    expandedOverrides[node.department.id] !== false;
  const branchProps = {
    expandedOverrides,
    forcedExpandedIds,
    matchingIds,
    onToggle,
    onOpen,
  };
  return (
    <div className="organization-company-tree">
      <OrganizationUnitRow
        node={node}
        isCompanyRoot
        isExpanded={isRootExpanded}
        isSearchMatch={matchingIds.has(node.department.id)}
        onToggle={onToggle}
        onOpen={onOpen}
      />
      {isRootExpanded && node.children.length > 0 && (
        <div className="organization-vertical-children">
          {node.children.map((child) => (
            <OrganizationBranch
              key={child.department.id}
              node={child}
              depth={0}
              {...branchProps}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DepartmentCatalogPage({
  onOpenDepartment,
  onCreateDepartment,
  canCreateDepartment,
  initialViewMode = 'LIST',
  onViewModeChange,
}: DepartmentCatalogPageProps) {
  const [departments, setDepartments] = useState<DepartmentPreview[] | null>(
    null,
  );
  const [hasError, setHasError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<'status' | null>(null);
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'status'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [hasUserSorted, setHasUserSorted] = useState(false);
  const [expandedOverrides, setExpandedOverrides] = useState<
    Record<string, boolean>
  >({});
  const treeViewRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  async function load(showRefresh = false) {
    if (showRefresh) setIsRefreshing(true);
    try {
      setDepartments(await getDepartmentsFromApi());
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setIsRefreshing(false);
    }
  }

  // Initial server synchronization for this catalog.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const normalized = normalizeSearchText(search);
    return (departments ?? []).filter((item) => {
      const matchesSearch =
        !normalized ||
        [
          item.code,
          item.name,
          item.parentName ?? '',
          item.managerName ?? '',
        ].some((value) => normalizeSearchText(value).includes(normalized));
      const matchesStatus =
        status === 'ALL' ||
        (status === 'ACTIVE' ? item.isActive : !item.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [departments, search, status]);

  const sorted = useMemo(() => [...filtered].sort((left, right) => {
    const comparison = sortBy === 'code'
      ? left.code.localeCompare(right.code, 'vi')
      : sortBy === 'name'
        ? left.name.localeCompare(right.name, 'vi')
        : Number(left.isActive) - Number(right.isActive);
    return sortOrder === 'asc' ? comparison : -comparison;
  }), [filtered, sortBy, sortOrder]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const organizationTree = useMemo(
    () => buildOrganizationTree(departments ?? []),
    [departments],
  );

  const hasTreeCriteria = Boolean(search.trim()) || status !== 'ALL';
  const shouldHighlightMatches = Boolean(search.trim());

  const treeMatchingIds = useMemo(
    () => new Set(filtered.map((item) => item.id)),
    [filtered],
  );

  const highlightedIds = useMemo(
    () => (shouldHighlightMatches ? treeMatchingIds : EMPTY_ID_SET),
    [shouldHighlightMatches, treeMatchingIds],
  );

  const visibleCompanyRoots = useMemo(
    () =>
      hasTreeCriteria
        ? treeMatchingIds.size
          ? filterOrganizationTree(
              organizationTree.companyRoots,
              treeMatchingIds,
            )
          : []
        : organizationTree.companyRoots,
    [hasTreeCriteria, organizationTree.companyRoots, treeMatchingIds],
  );

  const visibleUnsortedRoots = useMemo(
    () =>
      hasTreeCriteria
        ? treeMatchingIds.size
          ? filterOrganizationTree(
              organizationTree.unsortedRoots,
              treeMatchingIds,
            )
          : []
        : organizationTree.unsortedRoots,
    [hasTreeCriteria, organizationTree.unsortedRoots, treeMatchingIds],
  );

  const searchExpandedIds = useMemo(
    () =>
      hasTreeCriteria
        ? new Set([
            ...getOrganizationSearchExpandedIds(
              visibleCompanyRoots,
              treeMatchingIds,
            ),
            ...getOrganizationSearchExpandedIds(
              visibleUnsortedRoots,
              treeMatchingIds,
            ),
          ])
        : EMPTY_ID_SET,
    [
      hasTreeCriteria,
      treeMatchingIds,
      visibleCompanyRoots,
      visibleUnsortedRoots,
    ],
  );

  const activeFilterCount = Number(status !== 'ALL');

  useEffect(() => {
    if (viewMode !== 'TREE') return;
    const frame = window.requestAnimationFrame(() => {
      const treeView = treeViewRef.current;
      if (!treeView) return;
      if (search.trim()) {
        treeView
          .querySelector<HTMLElement>(
            '.organization-vertical-row.is-search-match',
          )
          ?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
          });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [departments, search, status, viewMode]);

  function toggleTreeNode(departmentId: string, expanded: boolean) {
    setExpandedOverrides((current) => ({
      ...current,
      [departmentId]: expanded,
    }));
  }

  function changeViewMode(nextViewMode: ViewMode) {
    setViewMode(nextViewMode);
    onViewModeChange?.(nextViewMode);
  }

  function clearSearch() {
    setSearch('');
    setPage(1);
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }

  function resetFilters() {
    setStatus('ALL');
    setOpenSelect(null);
    setPage(1);
  }

  function refresh() {
    setSearch('');
    setStatus('ALL');
    setIsFilterOpen(false);
    setOpenSelect(null);
    setPage(1);
    setPageSize(10);
    setSortBy('name');
    setSortOrder('asc');
    setHasUserSorted(false);
    setExpandedOverrides({});
    void load(true);
  }

  function changeSort(column: string) {
    const nextColumn = column as 'code' | 'name' | 'status';
    setSortOrder((current) => sortBy === nextColumn ? (current === 'asc' ? 'desc' : 'asc') : 'asc');
    setSortBy(nextColumn);
    setHasUserSorted(true);
    setPage(1);
  }

  if (hasError) return <ErrorState onRetry={() => void load(true)} />;
  if (departments === null) return <LoadingState />;

  return (
    <>
      <PageHeader
        className="catalog-page-header"
        title="Phòng ban"
        actions={
          canCreateDepartment ? (
            <button
              className="primary-button compact-button"
              type="button"
              onClick={onCreateDepartment}
            >
              Thêm phòng ban
            </button>
          ) : undefined
        }
      />
      <SurfaceCard className="master-data-section organization-catalog">
        <ListToolbar>
          <div className="catalog-toolbar-main organization-toolbar-main">
            <div className="catalog-search-row organization-catalog-controls">
              <label className="catalog-search">
                <span>Tìm kiếm</span>
                <span className="catalog-search-input">
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Tên, mã, cấp trên hoặc người quản lý"
                  />
                  {search && (
                    <button
                      className="clear-search-button"
                      type="button"
                      onClick={clearSearch}
                      aria-label="Xóa nội dung tìm kiếm"
                    >
                      ×
                    </button>
                  )}
                </span>
              </label>
              <button
                className={
                  isFilterOpen
                    ? 'secondary-button filter-trigger is-active'
                    : 'secondary-button filter-trigger'
                }
                type="button"
                aria-expanded={isFilterOpen}
                onClick={() => {
                  setIsFilterOpen((open) => !open);
                  setOpenSelect(null);
                }}
              >
                <svg
                  className="filter-trigger-icon"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d={
                      isFilterOpen
                        ? 'm4 10 4-4 4 4'
                        : 'M2.5 3.25h11L9.25 8v3.5L6.75 13V8L2.5 3.25Z'
                    }
                  />
                </svg>
                <span>{isFilterOpen ? 'Ẩn bộ lọc' : 'Bộ lọc'}</span>
                {activeFilterCount > 0 && (
                  <span className="filter-count-badge">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                className="secondary-button catalog-refresh-button"
                type="button"
                onClick={refresh}
                disabled={isRefreshing}
              >
                <span
                  className={
                    isRefreshing ? 'refresh-icon is-spinning' : 'refresh-icon'
                  }
                >
                  ↻
                </span>
                {isRefreshing ? 'Đang làm mới...' : 'Làm mới'}
              </button>
              <div
                className="organization-view-switch"
                role="group"
                aria-label="Kiểu hiển thị phòng ban"
              >
                <button
                  className={viewMode === 'LIST' ? 'is-active' : ''}
                  type="button"
                  onClick={() => changeViewMode('LIST')}
                >
                  <List size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Danh sách</span>
                </button>
                <button
                  className={viewMode === 'TREE' ? 'is-active' : ''}
                  type="button"
                  onClick={() => changeViewMode('TREE')}
                >
                  <Network size={14} strokeWidth={2} aria-hidden="true" />
                  <span>Sơ đồ phân cấp</span>
                </button>
              </div>
            </div>
            <AdvancedFilterPanel
              id="organization-filters"
              label="Bộ lọc phòng ban"
              isOpen={isFilterOpen}
            >
              <div className="advanced-filter-content master-filter-content organization-filter-content">
                <label>
                  <span>Trạng thái</span>
                  <FilterSelect
                    ariaLabel="Lọc theo trạng thái đơn vị"
                    value={status}
                    options={[
                      { value: 'ALL', label: 'Tất cả trạng thái' },
                      { value: 'ACTIVE', label: 'Hoạt động' },
                      { value: 'INACTIVE', label: 'Ngưng hoạt động' },
                    ]}
                    isOpen={openSelect === 'status'}
                    onOpenChange={(open) =>
                      setOpenSelect(open ? 'status' : null)
                    }
                    onChange={(value) => {
                      setStatus(value as StatusFilter);
                      setPage(1);
                    }}
                  />
                </label>
                {activeFilterCount > 0 && (
                  <button
                    className="secondary-button compact-button organization-reset-filter-btn"
                    type="button"
                    onClick={resetFilters}
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>
            </AdvancedFilterPanel>
          </div>
        </ListToolbar>
        {viewMode === 'LIST' ? (
          <>
            <DataTable
              className="admin-table master-data-table organization-list-table"
              fixedLayout
            >
              <thead>
                <tr>
                  <SortableTableHeader column="code" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Mã</SortableTableHeader>
                  <SortableTableHeader column="name" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Tên phòng ban</SortableTableHeader>
                  <th>Phòng ban cấp trên</th>
                  <th>Người quản lý</th>
                  <SortableTableHeader column="status" sortBy={sortBy} sortOrder={sortOrder} showIndicator={hasUserSorted} onSort={changeSort}>Trạng thái</SortableTableHeader>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyTableRow
                    colSpan={5}
                    message="Không tìm thấy phòng ban phù hợp."
                  />
                ) : (
                  rows.map((department) => (
                    <tr key={department.id}>
                      <td>
                        <button
                          className="master-code-link"
                          type="button"
                          onClick={() => onOpenDepartment(department.id)}
                        >
                          {department.code}
                        </button>
                      </td>
                      <td>
                        <strong>{department.name}</strong>
                      </td>
                      <td>{department.parentName ?? '—'}</td>
                      <td>
                        {department.managerName ?? (
                          <span className="organization-unassigned-text">
                            Chưa phân công
                          </span>
                        )}
                      </td>
                      <td>
                        <DepartmentStatusBadge isActive={department.isActive} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </DataTable>
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPrevious={() => setPage(currentPage - 1)}
              onNext={() => setPage(currentPage + 1)}
              rangeLabel={`${filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–${Math.min(currentPage * pageSize, filtered.length)} trên ${filtered.length} phòng ban`}
              pageSize={pageSize}
              pageSizes={[10, 20, 50]}
              onPageSizeChange={(value) => {
                setPageSize(value as PageSize);
                setPage(1);
              }}
            />
          </>
        ) : (
          <div className="organization-tree-shell">
            <div className="organization-tree-view" ref={treeViewRef}>
              {visibleCompanyRoots.length === 0 &&
              visibleUnsortedRoots.length === 0 ? (
                <p className="empty-state-message">
                  {hasTreeCriteria
                    ? 'Không tìm thấy đơn vị phù hợp với điều kiện tìm kiếm hoặc bộ lọc.'
                    : 'Chưa có đơn vị được sắp xếp trong sơ đồ.'}
                </p>
              ) : (
                <div className="organization-vertical-tree">
                  {visibleCompanyRoots.length > 0 && (
                    <div className="organization-company-list">
                      {visibleCompanyRoots.map((root) => (
                        <OrganizationCompanyTree
                          key={root.department.id}
                          node={root}
                          expandedOverrides={expandedOverrides}
                          forcedExpandedIds={searchExpandedIds}
                          matchingIds={highlightedIds}
                          onToggle={toggleTreeNode}
                          onOpen={onOpenDepartment}
                        />
                      ))}
                    </div>
                  )}
                  {visibleUnsortedRoots.length > 0 && (
                    <section className="organization-unsorted-group">
                      <div className="organization-unsorted-heading">
                        <h3>Chưa sắp xếp</h3>
                        <p>
                          Các phòng ban dưới đây cần bổ sung thông tin phân cấp
                          hợp lệ.
                        </p>
                      </div>
                      <div className="organization-unsorted-list">
                        {visibleUnsortedRoots.map((root) => (
                          <OrganizationBranch
                            key={root.department.id}
                            node={root}
                            expandedOverrides={expandedOverrides}
                            forcedExpandedIds={searchExpandedIds}
                            matchingIds={highlightedIds}
                            needsConfiguration
                            onToggle={toggleTreeNode}
                            onOpen={onOpenDepartment}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </SurfaceCard>
    </>
  );
}
