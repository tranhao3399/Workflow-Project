import { useEffect, useMemo, useState } from 'react'
import { ApprovalPage, OverviewDashboard, RequestsPage } from './Dashboard'
import { EmptyState, ErrorState, LoadingState, PermissionDeniedState } from './DataStates'
import { PermissionPage } from './PermissionPage'
import { RoleDetailPage } from './RoleDetailPage'
import { UserCatalogPage } from './UserCatalogPage'
import { UserDetailPage } from './UserDetailPage'
import { NewUserPage } from './NewUserPage'
import { EmployeeCatalogPage } from './EmployeeCatalogPage'
import { EmployeeDetailPage } from './EmployeeDetailPage'
import { NewEmployeePage } from './NewEmployeePage'
import { OrganizationPage } from './OrganizationPage'
import { DepartmentCatalogPage } from './DepartmentCatalogPage'
import { DepartmentCreatePage } from './DepartmentCreatePage'
import { DepartmentDetailPage } from './DepartmentDetailPage'
import { JobTitleCatalogPage } from './JobTitleCatalogPage'
import { JobTitleForm } from './JobTitleForm'
import { WorkspaceModulesPage } from './WorkspaceModulesPage'
import { WorkflowBuilderPage } from './WorkflowBuilderPage'
import { AppShell } from './ui/AppShell'
import { PageHeader } from './ui/PageHeader'
import { TopBar } from './ui/TopBar'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { getDashboard } from '../services/dashboard.service'
import { getMyWorkspaceModules } from '../services/workspace-modules.service'
import type { AuthUser, UserRole } from '../types/auth'
import type { DashboardData, DashboardRole, NavigationItem, NavigationKey } from '../types/erp'
import type { WorkspaceModule } from '../types/workspace-modules'
import { normalizeSearchText } from '../utils/formatters'

interface WorkspaceProps {
  user: AuthUser
  onLogout: () => Promise<void>
  isLoggingOut: boolean
}

const navigationKeyByPath: Record<string, NavigationKey> = {
  '/overview': 'overview',
  '/my-requests': 'my-requests',
  '/approval-inbox': 'approval-inbox',
  '/form-builder': 'form-builder',
  '/workflow-builder': 'workflow-builder',
  '/employees': 'employees',
  '/employees/new': 'new-employee',
  '/organization': 'organization',
  '/departments': 'departments',
  '/departments/new': 'new-department',
  '/job-titles': 'job-titles',
  '/job-titles/new': 'new-job-title',
  '/users': 'users',
  '/users/new': 'new-user',
  '/permissions': 'permissions',
  '/permissions/new': 'new-role',
  '/audit-logs': 'audit-logs',
  '/workspace-modules': 'workspace-modules',
}

function getRouteKey(pathname: string): NavigationKey {
  const direct = navigationKeyByPath[pathname]
  if (direct) return direct
  if (/^\/employees\/[^/]+$/.test(pathname)) return 'employee-detail'
  if (/^\/departments\/[^/]+$/.test(pathname)) return 'department-detail'
  if (/^\/job-titles\/[^/]+\/edit$/.test(pathname)) return 'edit-job-title'
  if (/^\/users\/[^/]+$/.test(pathname)) return 'user-detail'
  if (/^\/permissions\/[^/]+$/.test(pathname)) return 'role-detail'
  return 'overview'
}

function getRouteId(pathname: string, prefix: '/employees/' | '/users/'): string | null {
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) || null : null
}

function getDepartmentId(pathname: string): string | null {
  return pathname.startsWith('/departments/') ? pathname.slice('/departments/'.length) || null : null
}

function getJobTitleId(pathname: string): string | null {
  const match = /^\/job-titles\/([^/]+)\/edit$/.exec(pathname)
  return match?.[1] ?? null
}

function getRoleId(pathname: string): string | null {
  const match = /^\/permissions\/([^/]+)$/.exec(pathname)
  return match?.[1] ?? null
}

const pathByNavigationKey: Record<NavigationKey, string> = {
  overview: '/overview',
  'my-requests': '/my-requests',
  'approval-inbox': '/approval-inbox',
  'form-builder': '/form-builder',
  'workflow-builder': '/workflow-builder',
  employees: '/employees',
  organization: '/organization',
  departments: '/departments',
  'new-department': '/departments/new',
  'department-detail': '/departments',
  'job-titles': '/job-titles',
  'new-job-title': '/job-titles/new',
  'edit-job-title': '/job-titles',
  'new-employee': '/employees/new',
  'employee-detail': '/employees',
  users: '/users',
  'new-user': '/users/new',
  'user-detail': '/users',
  permissions: '/permissions',
  'new-role': '/permissions/new',
  'role-detail': '/permissions',
  'audit-logs': '/audit-logs',
  'workspace-modules': '/workspace-modules',
}

const parentNavigationKeyByPage: Partial<Record<NavigationKey, NavigationKey>> = {
  'new-employee': 'employees',
  'employee-detail': 'employees',
  'new-department': 'departments',
  'department-detail': 'departments',
  'new-job-title': 'job-titles',
  'edit-job-title': 'job-titles',
  'new-user': 'users',
  'user-detail': 'users',
  'new-role': 'permissions',
  'role-detail': 'permissions',
}

const pageMeta: Record<NavigationKey, { title: string; description?: string }> = {
  overview: { title: 'Tổng quan', description: 'Theo dõi công việc, phiếu và trạng thái vận hành cần ưu tiên.' },
  'my-requests': { title: 'Phiếu của tôi', description: 'Theo dõi các phiếu bạn đã tạo và tiến độ xử lý hiện tại.' },
  'approval-inbox': { title: 'Chờ phê duyệt', description: 'Ưu tiên các yêu cầu theo hạn xử lý và mức độ cần chú ý.' },
  'form-builder': { title: 'Form Builder', description: 'Thiết kế biểu mẫu chuẩn cho tổ chức.' },
  'workflow-builder': { title: 'Workflow Builder', description: 'Thiết lập luồng xử lý và người phê duyệt.' },
  employees: { title: 'Nhân viên', description: 'Quản lý hồ sơ nhân sự trong tổ chức.' },
  organization: { title: 'Cơ cấu tổ chức', description: 'Danh mục phòng ban và chức danh dùng chung.' },
  departments: { title: 'Phòng ban', description: 'Quản lý danh mục phòng ban và cơ cấu nhân sự trong tổ chức.' },
  'new-department': { title: 'Tạo phòng ban' },
  'department-detail': { title: 'Chi tiết phòng ban' },
  'job-titles': { title: 'Chức danh', description: 'Quản lý danh mục chức danh dùng chung cho nhân viên và quy trình phê duyệt.' },
  'new-job-title': { title: 'Tạo chức danh' },
  'edit-job-title': { title: 'Chức danh' },
  'new-employee': { title: 'Thêm nhân viên' },
  'employee-detail': { title: 'Chi tiết nhân viên' },
  users: { title: 'Người dùng', description: 'Theo dõi tài khoản, vai trò và trạng thái truy cập.' },
  'new-user': { title: 'Thêm người dùng' },
  'user-detail': { title: 'Chi tiết người dùng' },
  permissions: { title: 'Vai trò & phân quyền', description: 'Quản lý vai trò và quyền truy cập của tài khoản trong hệ thống.' },
  'new-role': { title: 'Tạo vai trò' },
  'role-detail': { title: 'Chi tiết vai trò' },
  'audit-logs': { title: 'Nhật ký hệ thống', description: 'Theo dõi các sự kiện nghiệp vụ và bảo mật.' },
  'workspace-modules': { title: 'Quản lý không gian làm việc', description: 'Cấu hình menu hiển thị theo vai trò.' },
}

const selfManagedHeaderPages: NavigationKey[] = ['employees', 'organization', 'departments', 'new-department', 'department-detail', 'job-titles', 'new-job-title', 'edit-job-title', 'new-employee', 'employee-detail', 'users', 'new-user', 'permissions', 'new-role', 'role-detail', 'workspace-modules', 'workflow-builder', 'user-detail']
const requiredPermissionsByPage: Partial<Record<NavigationKey, readonly string[]>> = {
  overview: ['DASHBOARD.VIEW'],
  'my-requests': ['REQUESTS.VIEW_OWN'],
  'approval-inbox': ['APPROVALS.APPROVE_ASSIGNED'],
  'form-builder': ['FORM_BUILDER.VIEW'],
  'workflow-builder': ['WORKFLOW_BUILDER.VIEW'],
  employees: ['EMPLOYEE.VIEW'],
  'new-employee': ['EMPLOYEE.CREATE'],
  'employee-detail': ['EMPLOYEE.VIEW'],
  departments: ['DEPARTMENT.VIEW'],
  'new-department': ['DEPARTMENT.CREATE'],
  'department-detail': ['DEPARTMENT.VIEW'],
  'job-titles': ['JOB_TITLE.VIEW'],
  'new-job-title': ['JOB_TITLE.CREATE'],
  'edit-job-title': ['JOB_TITLE.VIEW'],
  users: ['USER.VIEW'],
  'new-user': ['USER.CREATE'],
  'user-detail': ['USER.VIEW'],
  permissions: ['ROLE.VIEW'],
  'new-role': ['ROLE.CREATE'],
  'role-detail': ['ROLE.VIEW'],
  'audit-logs': ['AUDIT_LOG.VIEW'],
  'workspace-modules': ['WORKSPACE_MODULE.VIEW'],
}

function canAccessPage(page: NavigationKey, permissionKeys: readonly string[]): boolean {
  const required = requiredPermissionsByPage[page]
  if (!required?.length) return true
  return required.every((permission) => permissionKeys.includes(permission))
}
function toDashboardRole(role: UserRole): DashboardRole {
  if (role === 'ADMIN') return 'ADMIN'
  if (role === 'MANAGER' || role === 'ACCOUNTANT' || role === 'DIRECTOR') return 'MANAGER'
  return 'EMPLOYEE'
}

function toNavigationItems(modules: WorkspaceModule[]): NavigationItem[] {
  return modules.flatMap((module) => {
    const key = navigationKeyByPath[module.path]
    if (!key) return []
    const section = module.group === 'ADMIN' ? 'administration' : 'workspace'
    if (module.moduleKey === 'ORGANIZATION' || module.path === '/organization') {
      return [
        { key: 'departments', label: 'Phòng ban', roles: module.visibleToRoles, section },
        { key: 'job-titles', label: 'Chức danh', roles: module.visibleToRoles, section },
      ] satisfies NavigationItem[]
    }
    const label = module.moduleKey === 'USERS' ? 'Tài khoản người dùng' : module.name
    return [{ key, label, roles: module.visibleToRoles, section } satisfies NavigationItem]
  })
}

const navigationIconPaths: Record<NavigationKey, string[]> = {
  overview: ['M3 3h7v7H3z', 'M14 3h7v5h-7z', 'M14 12h7v9h-7z', 'M3 14h7v7H3z'],
  'my-requests': ['M5 2h9l4 4v16H5z', 'M14 2v5h5', 'M8 11h7', 'M8 15h7'],
  'approval-inbox': ['M12 2 4 5v6c0 4.7 3.3 8.6 8 10 4.7-1.4 8-5.3 8-10V5z', 'm8.5 11.5 2.2 2.2 4.8-4.8'],
  'form-builder': ['M4 3h16v18H4z', 'M4 8h16', 'M8 12h8', 'M8 16h5'],
  'workflow-builder': ['M5 5h4v4H5z', 'M15 15h4v4h-4z', 'M9 7h5a2 2 0 0 1 2 2v6'],
  employees: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0', 'M19 8v6', 'M16 11h6'],
  organization: ['M4 4h16v16H4z', 'M4 10h16', 'M10 4v16'],
  departments: ['M4 4h16v16H4z', 'M4 10h16', 'M10 4v16'],
  'new-department': ['M4 4h16v16H4z', 'M4 10h16', 'M10 4v16'],
  'department-detail': ['M4 4h16v16H4z', 'M4 10h16', 'M10 4v16'],
  'job-titles': ['M5 4h14v16H5z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
  'new-job-title': ['M5 4h14v16H5z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
  'edit-job-title': ['M5 4h14v16H5z', 'M8 8h8', 'M8 12h8', 'M8 16h5'],
  'new-employee': ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0', 'M19 8v6', 'M16 11h6'],
  'employee-detail': ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  users: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  'new-user': ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0', 'M19 8v6', 'M16 11h6'],
  'user-detail': ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  permissions: ['M12 2 4 5v6c0 4.7 3.3 8.6 8 10 4.7-1.4 8-5.3 8-10V5z', 'M9 12h6', 'M12 9v6'],
  'new-role': ['M12 2 4 5v6c0 4.7 3.3 8.6 8 10 4.7-1.4 8-5.3 8-10V5z', 'M9 12h6', 'M12 9v6'],
  'role-detail': ['M12 2 4 5v6c0 4.7 3.3 8.6 8 10 4.7-1.4 8-5.3 8-10V5z', 'M9 12h6', 'M12 9v6'],
  'audit-logs': ['M5 3h11l3 3v15H5z', 'M16 3v4h4', 'M8 11h8', 'M8 15h8', 'M8 19h5'],
  'workspace-modules': ['M3 4h18v5H3z', 'M3 13h18v7H3z', 'M7 6.5h.01', 'M7 16.5h.01'],
}

function NavigationIcon({ navigationKey }: { navigationKey: NavigationKey }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{navigationIconPaths[navigationKey].map((path) => <path d={path} key={path} />)}</svg>
}

export function Workspace({ user, onLogout, isLoggingOut }: WorkspaceProps) {
  const [activePage, setActivePage] = useState<NavigationKey>(() => getRouteKey(window.location.pathname))
  const [selectedUserId, setSelectedUserId] = useState<string | null>(() => getRouteId(window.location.pathname, '/users/'))
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(() => getRouteId(window.location.pathname, '/employees/'))
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(() => getDepartmentId(window.location.pathname))
  const [selectedJobTitleId, setSelectedJobTitleId] = useState<string | null>(() => getJobTitleId(window.location.pathname))
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(() => getRoleId(window.location.pathname))
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [pendingNavigationItem, setPendingNavigationItem] = useState<NavigationItem | null>(null)
  const [pendingNavigationAction, setPendingNavigationAction] = useState<(() => void) | null>(null)
  const [accountEmployeeId, setAccountEmployeeId] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [menuModules, setMenuModules] = useState<WorkspaceModule[]>([])
  const [isMenuLoading, setIsMenuLoading] = useState(true)
  const [hasMenuError, setHasMenuError] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false)
  const [toast, setToast] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.localStorage.getItem('workflow:sidebar-collapsed') === 'true')

  const dashboardRole = toDashboardRole(user.role)
  const permissionKeys = useMemo(() => user.permissionKeys ?? [], [user.permissionKeys])
  const navigationItems = useMemo(
    () => toNavigationItems(menuModules).filter((item) => canAccessPage(item.key, permissionKeys)),
    [menuModules, permissionKeys],
  )
  const globalSearchMatches = useMemo(() => {
    const query = normalizeSearchText(searchQuery.trim())
    return navigationItems.filter((item) => {
      if (!query) return false
      return normalizeSearchText(item.label).includes(query)
    })
  }, [navigationItems, searchQuery])
  const workspaceNavigation = navigationItems.filter((item) => item.section === 'workspace')
  const administrationNavigation = navigationItems.filter((item) => item.section === 'administration')
  const meta = pageMeta[activePage]
  const activeNavigationKey = parentNavigationKeyByPage[activePage] ?? activePage

  useEffect(() => {
    window.localStorage.setItem('workflow:sidebar-collapsed', String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  useEffect(() => {
    let isCurrent = true
    async function loadMenu() {
      try {
        const modules = await getMyWorkspaceModules()
        if (!isCurrent) return
        setMenuModules(modules)
        setHasMenuError(false)
      } catch {
        if (!isCurrent) return
        setMenuModules([])
        setHasMenuError(true)
      } finally {
        if (isCurrent) setIsMenuLoading(false)
      }
    }
    void loadMenu()
    return () => { isCurrent = false }
  }, [user.role])

  useEffect(() => {
    let isCurrent = true
    async function loadDashboard() {
      try {
        const dashboard = await getDashboard(dashboardRole)
        if (!isCurrent) return
        setData(dashboard)
        setHasError(false)
      } catch {
        if (isCurrent) setHasError(true)
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }
    void loadDashboard()
    return () => { isCurrent = false }
  }, [dashboardRole, reloadVersion])

  useEffect(() => {
    function handlePopState() {
      setActivePage(getRouteKey(window.location.pathname))
      setSelectedUserId(getRouteId(window.location.pathname, '/users/'))
      setSelectedEmployeeId(getRouteId(window.location.pathname, '/employees/'))
      setSelectedDepartmentId(getDepartmentId(window.location.pathname))
      setSelectedJobTitleId(getJobTitleId(window.location.pathname))
      setSelectedRoleId(getRoleId(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const handleNavigationRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ onConfirm?: () => void }>).detail
      if (detail?.onConfirm) setPendingNavigationAction(() => detail.onConfirm)
    }
    window.addEventListener('workflow:navigate-request', handleNavigationRequest)
    return () => window.removeEventListener('workflow:navigate-request', handleNavigationRequest)
  }, [])

  useEffect(() => {
    const handleUnsavedChange = (event: Event) => {
      setHasUnsavedChanges(Boolean((event as CustomEvent<boolean>).detail))
    }
    window.addEventListener('workflow:unsaved-change', handleUnsavedChange)
    return () => window.removeEventListener('workflow:unsaved-change', handleUnsavedChange)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeoutId = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timeoutId)
  }, [toast])

  function updatePath(key: NavigationKey) {
    const path = pathByNavigationKey[key]
    if (window.location.pathname !== path) window.history.pushState(null, '', path)
  }

  function navigateTo(item: NavigationItem) {
    if (hasUnsavedChanges) {
      setPendingNavigationItem(item)
      return
    }
    performNavigation(item)
  }

  function performNavigation(item: NavigationItem) {
    setHasUnsavedChanges(false)
    setPendingNavigationItem(null)
    setPendingNavigationAction(null)
    setActivePage(item.key)
    setSelectedUserId(null)
    setSelectedEmployeeId(null)
    setSelectedRoleId(null)
    setSearchQuery('')
    setIsMobileSearchActive(false)
    updatePath(item.key)
  }

  function openNewUserPage(employeeId?: string) {
    setSelectedUserId(null)
    setAccountEmployeeId(employeeId ?? null)
    setActivePage('new-user')
    updatePath('new-user')
  }

  function returnToUsers() {
    setSelectedUserId(null)
    setActivePage('users')
    updatePath('users')
  }

  function openNewEmployeePage() {
    setSelectedEmployeeId(null)
    setActivePage('new-employee')
    updatePath('new-employee')
  }

  function openNewDepartmentPage() {
    setSelectedDepartmentId(null)
    setActivePage('new-department')
    updatePath('new-department')
  }

  function returnToEmployees() {
    setSelectedEmployeeId(null)
    setActivePage('employees')
    updatePath('employees')
  }

  function openEmployee(employeeId: string) {
    setSelectedEmployeeId(employeeId)
    setActivePage('employee-detail')
    window.history.pushState(null, '', `/employees/${employeeId}`)
  }

  function openDepartment(departmentId: string) {
    setSelectedDepartmentId(departmentId)
    setActivePage('department-detail')
    window.history.pushState(null, '', `/departments/${departmentId}`)
  }

  function returnToDepartments() {
    setSelectedDepartmentId(null)
    setActivePage('departments')
    updatePath('departments')
  }

  function openNewJobTitlePage() {
    setSelectedJobTitleId(null)
    setActivePage('new-job-title')
    updatePath('new-job-title')
  }

  function openJobTitleEditor(jobTitleId: string) {
    setSelectedJobTitleId(jobTitleId)
    setActivePage('edit-job-title')
    window.history.pushState(null, '', `/job-titles/${jobTitleId}/edit`)
  }

  function returnToJobTitles() {
    setSelectedJobTitleId(null)
    setActivePage('job-titles')
    updatePath('job-titles')
  }

  function handleDepartmentDeleted() {
    setToast('Xóa phòng ban thành công.')
    returnToDepartments()
  }

  function handleJobTitleDeleted() {
    setToast('Xóa chức danh thành công.')
    returnToJobTitles()
  }

  function openNewRolePage() {
    setSelectedRoleId(null)
    setActivePage('new-role')
    updatePath('new-role')
  }

  function openRole(roleId: string) {
    setSelectedRoleId(roleId)
    setActivePage('role-detail')
    window.history.pushState(null, '', `/permissions/${roleId}`)
  }

  function returnToRoles() {
    setSelectedRoleId(null)
    setActivePage('permissions')
    updatePath('permissions')
  }

  function retryDashboard() {
    setIsLoading(true)
    setHasError(false)
    setReloadVersion((version) => version + 1)
  }

  function renderContent() {
    if (!canAccessPage(activePage, permissionKeys)) return <PermissionDeniedState />
    if (activePage === 'employees') return <EmployeeCatalogPage onOpenEmployee={openEmployee} onCreateEmployee={openNewEmployeePage} canCreateEmployee={permissionKeys.includes('EMPLOYEE.CREATE')} />
    if (activePage === 'departments') return <DepartmentCatalogPage onOpenDepartment={openDepartment} onCreateDepartment={openNewDepartmentPage} canCreateDepartment={permissionKeys.includes('DEPARTMENT.CREATE')} />
    if (activePage === 'new-department') return <DepartmentCreatePage onBack={returnToDepartments} onCreated={returnToDepartments} />
    if (activePage === 'department-detail' && selectedDepartmentId) return <DepartmentDetailPage departmentId={selectedDepartmentId} onBack={returnToDepartments} onDeleted={handleDepartmentDeleted} />
    if (activePage === 'job-titles') return <JobTitleCatalogPage onCreateJobTitle={openNewJobTitlePage} onEditJobTitle={openJobTitleEditor} canCreateJobTitle={permissionKeys.includes('JOB_TITLE.CREATE')} />
    if (activePage === 'new-job-title') return <JobTitleForm onBack={returnToJobTitles} onSaved={returnToJobTitles} />
    if (activePage === 'edit-job-title' && selectedJobTitleId) return <JobTitleForm jobTitleId={selectedJobTitleId} onBack={returnToJobTitles} onSaved={returnToJobTitles} onDeleted={handleJobTitleDeleted} />
    if (activePage === 'organization') return <OrganizationPage />
    if (activePage === 'new-employee') return <NewEmployeePage onBack={returnToEmployees} onCreated={returnToEmployees} />
    if (activePage === 'employee-detail' && selectedEmployeeId) return <EmployeeDetailPage employeeId={selectedEmployeeId} onBack={returnToEmployees} onCreateAccount={openNewUserPage} onOpenUser={(userId) => { setSelectedUserId(userId); setActivePage('user-detail'); window.history.pushState(null, '', `/users/${userId}`) }} />
    if (activePage === 'users') return <UserCatalogPage onOpenUser={(userId) => { setSelectedUserId(userId); setActivePage('user-detail'); window.history.pushState(null, '', `/users/${userId}`) }} onCreateUser={() => openNewUserPage()} canCreateUser={permissionKeys.includes('USER.CREATE')} />
    if (activePage === 'new-user') return <NewUserPage initialEmployeeId={accountEmployeeId ?? undefined} onBack={returnToUsers} onCreated={returnToUsers} />
    if (activePage === 'user-detail' && selectedUserId) return <UserDetailPage userId={selectedUserId} onBack={returnToUsers} onOpenEmployee={openEmployee} />
    if (activePage === 'permissions') return <PermissionPage onCreateRole={openNewRolePage} onOpenRole={openRole} canCreateRole={permissionKeys.includes('ROLE.CREATE')} />
    if (activePage === 'new-role') return <RoleDetailPage onBack={returnToRoles} onSaved={returnToRoles} canUpdateRole={permissionKeys.includes('ROLE.UPDATE')} />
    if (activePage === 'role-detail' && selectedRoleId) return <RoleDetailPage roleId={selectedRoleId} onBack={returnToRoles} onSaved={returnToRoles} canUpdateRole={permissionKeys.includes('ROLE.UPDATE')} />
    if (activePage === 'workspace-modules') return <WorkspaceModulesPage />
    if (activePage === 'workflow-builder') return <WorkflowBuilderPage />
    if (isLoading) return <LoadingState />
    if (hasError || !data) return <ErrorState onRetry={retryDashboard} />
    if (activePage === 'overview') return <OverviewDashboard data={data} onNavigate={navigateTo} navigationItems={navigationItems} />
    if (activePage === 'my-requests') return <RequestsPage requests={data.requests} />
    if (activePage === 'approval-inbox') return <ApprovalPage approvals={data.approvals} />
    return <EmptyState title={`${meta.title} chưa được kết nối`} description="Màn hình đã sẵn vị trí trong hệ thống; dữ liệu sẽ hiển thị khi NestJS API tương ứng được xây dựng." />
  }

  const sidebar = <>
    <div className="sidebar-brand"><span className="logo-mark">W</span><span className="sidebar-brand-name">WorkFlow ERP</span><button className="sidebar-collapse-toggle" type="button" aria-label={isSidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'} title={isSidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'} onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg></button></div>
    <nav aria-label="Điều hướng chính">
      {isMenuLoading && <p className="sidebar-menu-note">Đang tải menu...</p>}
      {!isMenuLoading && hasMenuError && <p className="sidebar-menu-note sidebar-menu-warning">Không thể tải cấu hình menu.</p>}
      {workspaceNavigation.length > 0 && <><p className="nav-heading">KHÔNG GIAN LÀM VIỆC</p>{workspaceNavigation.map((item) => <button className={activeNavigationKey === item.key ? 'nav-item active' : 'nav-item'} type="button" key={item.key} title={item.label} onClick={() => navigateTo(item)}><NavigationIcon navigationKey={item.key} /><span className="nav-label">{item.label}</span></button>)}</>}
      {administrationNavigation.length > 0 && <><p className="nav-heading administration-heading">QUẢN TRỊ</p>{administrationNavigation.map((item) => <button className={activeNavigationKey === item.key ? 'nav-item active' : 'nav-item'} type="button" key={item.key} title={item.label} onClick={() => navigateTo(item)}><NavigationIcon navigationKey={item.key} /><span className="nav-label">{item.label}</span></button>)}</>}
      {!isMenuLoading && navigationItems.length === 0 && <p className="sidebar-menu-note">Không có module nào được cấu hình cho vai trò này.</p>}
    </nav>
  </>

  return <><AppShell sidebar={sidebar} isSidebarCollapsed={isSidebarCollapsed} topBar={<TopBar breadcrumb={meta.title} user={user} isLoggingOut={isLoggingOut} onLogout={onLogout} searchQuery={searchQuery} onSearchChange={setSearchQuery} searchResults={globalSearchMatches} onSearchSelect={navigateTo} isMobileSearchActive={isMobileSearchActive} onMobileSearchOpen={() => setIsMobileSearchActive(true)} onMobileSearchClose={() => setIsMobileSearchActive(false)} />}>{!selfManagedHeaderPages.includes(activePage) && <PageHeader title={meta.title} description={activePage === 'overview' && data ? data.greeting : meta.description} />}{renderContent()}</AppShell>{toast && <div className="toast-message" role="status">{toast}</div>}{(pendingNavigationItem || pendingNavigationAction) && <ConfirmDialog title="Chưa lưu thay đổi" description="Bạn đang có thay đổi chưa lưu. Nếu rời trang, các thay đổi này sẽ bị hủy." confirmLabel="Rời khỏi trang" tone="danger" onCancel={() => { setPendingNavigationItem(null); setPendingNavigationAction(null); window.dispatchEvent(new CustomEvent('workflow:navigate-cancel')) }} onConfirm={() => { if (pendingNavigationItem) performNavigation(pendingNavigationItem); else { const action = pendingNavigationAction; setPendingNavigationAction(null); action?.() } }} />}</>
}
