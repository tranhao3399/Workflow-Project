import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileText,
  Inbox,
  LayoutDashboard,
  ShieldAlert,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { EmptyState } from './DataStates'
import { RequestStatusBadge } from './StatusBadge'
import { SurfaceCard } from './ui/SurfaceCard'
import type {
  DashboardAnalytics,
  DashboardData,
  DashboardEmployee,
  DashboardMetric,
  DashboardView,
  NavigationItem,
  NavigationKey,
} from '../types/erp'
import { formatDateTime } from '../utils/formatters'

const viewLabels: Record<DashboardView, string> = {
  MY_WORK: 'Cá nhân & phê duyệt',
  HR: 'Quản trị nhân sự',
  SYSTEM: 'Hệ thống',
}

const metricIcons: Record<string, LucideIcon> = {
  'pending-approvals': Inbox,
  'overdue-approvals': Clock3,
  'in-progress-requests': ClipboardList,
  'revision-requests': AlertTriangle,
  'approved-requests': CheckCircle2,
  'attention-requests': AlertTriangle,
  'draft-requests': FileText,
  'active-employees': UsersRound,
  'new-employees': UserRoundCheck,
  'unlinked-employees': UserRoundX,
  'running-requests': ClipboardList,
  'active-departments': Building2,
  'active-positions': UserRoundCheck,
  'active-users': UserRoundCheck,
  'unlinked-users': UserRoundX,
  'enabled-modules': LayoutDashboard,
  'failed-logins': ShieldAlert,
}

interface OverviewDashboardProps {
  data: DashboardData
  navigationItems: NavigationItem[]
  onNavigate: (item: NavigationItem) => void
  onViewChange: (view: DashboardView) => void
  onCreateRequest: (formId?: string, formCode?: string) => void
  onOpenRequest: (requestId: string) => void
  onOpenApproval: (requestId: string, taskId: string) => void
  onOpenEmployee: (employeeId: string) => void
}

function timeGreeting() {
  const hour = new Date().getHours()
  if (hour < 11) return 'Chào buổi sáng'
  if (hour < 14) return 'Chào buổi trưa'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

function MetricCard({ metric, onClick }: { metric: DashboardMetric; onClick?: () => void }) {
  const Icon = metricIcons[metric.key] ?? ClipboardList
  const content = <>
    <span className={`dashboard-metric-icon dashboard-metric-icon-${metric.tone}`}><Icon size={18} aria-hidden="true" /></span>
    <span className="dashboard-metric-copy"><span>{metric.label}</span><strong>{metric.value.toLocaleString('vi-VN')}</strong><small>{metric.description}</small></span>
    {onClick && <ArrowRight className="dashboard-metric-arrow" size={17} aria-hidden="true" />}
  </>
  return onClick
    ? <button className={`dashboard-metric-card dashboard-metric-${metric.tone}`} type="button" onClick={onClick}>{content}</button>
    : <article className={`dashboard-metric-card dashboard-metric-${metric.tone}`}>{content}</article>
}

function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="dashboard-section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>
}

function EmployeeList({ items, onOpen }: { items: DashboardEmployee[]; onOpen: (id: string) => void }) {
  if (!items.length) return <EmptyState title="Chưa có dữ liệu nhân sự" description="Dữ liệu phù hợp sẽ xuất hiện tại đây." />
  return <div className="dashboard-compact-list">{items.map((employee) => <button className="dashboard-person-row" type="button" key={employee.id} onClick={() => onOpen(employee.id)}>
    <span className="dashboard-avatar" aria-hidden="true">{employee.fullName.trim().charAt(0).toLocaleUpperCase('vi-VN')}</span>
    <span className="dashboard-row-copy"><strong>{employee.fullName}</strong><small>{employee.employeeCode} · {employee.position}</small><small>{employee.department}</small></span>
    <ArrowRight size={16} aria-hidden="true" />
  </button>)}</div>
}

function AnalyticsCard({ analytics }: { analytics: DashboardAnalytics }) {
  const maximum = Math.max(...analytics.items.map((item) => item.value), 1)
  return <SurfaceCard className="dashboard-analytics-card">
    <SectionHeader title={analytics.label} />
    {analytics.items.length === 0 ? <EmptyState title="Chưa có dữ liệu thống kê" description="Dữ liệu sẽ xuất hiện khi có phát sinh phù hợp." /> : <div className="dashboard-bars">{analytics.items.map((item) => <div className="dashboard-bar-row" key={item.key}>
      <div><span>{item.label}</span><strong>{item.value.toLocaleString('vi-VN')}</strong></div>
      <span className="dashboard-bar-track"><span style={{ width: `${Math.max((item.value / maximum) * 100, 3)}%` }} /></span>
    </div>)}</div>}
  </SurfaceCard>
}

export function OverviewDashboard({
  data,
  navigationItems,
  onNavigate,
  onViewChange,
  onCreateRequest,
  onOpenRequest,
  onOpenApproval,
  onOpenEmployee,
}: OverviewDashboardProps) {
  const navigateToKey = (key?: NavigationKey) => {
    if (!key) return
    const item = navigationItems.find((candidate) => candidate.key === key)
    if (item) onNavigate(item)
  }
  const canNavigateTo = (key?: NavigationKey) => Boolean(key && navigationItems.some((item) => item.key === key))
  const profileDetails = [data.profile.position, data.profile.department, data.profile.employeeCode].filter(Boolean).join(' · ')
  const showApprovalQueue = data.activeView === 'MY_WORK' && data.approvalQueue.length > 0

  return <div className="dashboard-page">
    <header className="dashboard-hero">
      <div>
        <p className="dashboard-eyebrow">Bàn làm việc hôm nay</p>
        <h1>{timeGreeting()}, {data.profile.fullName}</h1>
        <p>{profileDetails || 'Theo dõi công việc và thông tin cần ưu tiên trong ngày.'}</p>
      </div>
      <div className="dashboard-hero-actions">
        {data.availableViews.length > 1 && <div className="dashboard-view-switcher" role="tablist" aria-label="Góc nhìn dashboard">
          {data.availableViews.map((view) => <button role="tab" aria-selected={view === data.activeView} className={view === data.activeView ? 'active' : ''} type="button" key={view} onClick={() => onViewChange(view)}>{viewLabels[view]}</button>)}
        </div>}
        {data.canCreateRequest && <button className="primary-button dashboard-create-button" type="button" onClick={() => onCreateRequest()}><FilePlus2 size={16} /> Tạo phiếu đề xuất</button>}
      </div>
    </header>

    <div className="dashboard-context-line"><span>{viewLabels[data.activeView]}</span><span>{data.scopeLabel}</span></div>

    <section className={`dashboard-metric-grid dashboard-metric-grid-${Math.min(data.metrics.length, 4)}`} aria-label="Chỉ số cần theo dõi">
      {data.metrics.map((metric) => <MetricCard key={metric.key} metric={metric} onClick={canNavigateTo(metric.target) ? () => navigateToKey(metric.target) : undefined} />)}
    </section>

    {data.activeView === 'MY_WORK' && <div className="dashboard-work-grid">
      <SurfaceCard className="dashboard-main-card">
        <SectionHeader
          title={showApprovalQueue ? 'Cần xử lý ngay' : 'Đề xuất gần đây của tôi'}
          description={showApprovalQueue ? 'Các task đang chờ bạn xem xét, ưu tiên task đã quá hạn.' : 'Theo dõi nhanh trạng thái các phiếu bạn vừa cập nhật.'}
          action={<button className="dashboard-text-action" type="button" onClick={() => navigateToKey(showApprovalQueue ? 'approval-inbox' : 'my-requests')}>Xem tất cả <ArrowRight size={14} /></button>}
        />
        {showApprovalQueue ? <div className="dashboard-action-list">{data.approvalQueue.map((task) => <button className="dashboard-action-row" type="button" key={task.id} onClick={() => onOpenApproval(task.requestId, task.id)}>
          <span className="dashboard-row-copy"><span className="dashboard-code-line"><strong>{task.requestNo}</strong>{task.isOverdue && <span className="dashboard-overdue-badge">Quá hạn</span>}</span><b>{task.title}</b><small>{task.requester} · {task.department}</small><small>Bước hiện tại: {task.stepName}</small></span>
          <span className="dashboard-row-meta">{task.dueAt ? <>Hạn {formatDateTime(task.dueAt, 'date-first')}</> : 'Không đặt hạn'}<ArrowRight size={16} /></span>
        </button>)}</div> : data.recentRequests.length ? <div className="dashboard-action-list">{data.recentRequests.map((request) => <button className="dashboard-action-row" type="button" key={request.id} onClick={() => onOpenRequest(request.id)}>
          <span className="dashboard-row-copy"><strong>{request.requestNo}</strong><b>{request.title}</b><small>Cập nhật {formatDateTime(request.updatedAt, 'date-first')}</small></span>
          <span className="dashboard-row-meta"><RequestStatusBadge status={request.status} /><ArrowRight size={16} /></span>
        </button>)}</div> : <EmptyState title="Chưa có đề xuất gần đây" description="Tạo phiếu mới để bắt đầu một quy trình nội bộ." />}
      </SurfaceCard>

      <div className="dashboard-side-stack">
        <SurfaceCard className="dashboard-side-card">
          <SectionHeader title="Biểu mẫu tạo nhanh" description="Các biểu mẫu đang được phát hành." />
          {data.quickForms.length ? <div className="dashboard-quick-forms">{data.quickForms.map((form) => <button type="button" key={form.id} onClick={() => onCreateRequest(form.id, form.code)}><span><strong>{form.name}</strong><small>{form.code}</small></span><ArrowRight size={15} /></button>)}</div> : <EmptyState title="Chưa có biểu mẫu khả dụng" description="Chưa có gói biểu mẫu và quy trình nào đang phát hành." />}
        </SurfaceCard>
        {data.directReports.length > 0 && <SurfaceCard className="dashboard-side-card"><SectionHeader title="Nhân viên trực tiếp" description="Nhân sự đang báo cáo trực tiếp cho bạn." /><EmployeeList items={data.directReports} onOpen={onOpenEmployee} /></SurfaceCard>}
      </div>
    </div>}

    {data.activeView === 'HR' && <>
      <div className="dashboard-work-grid dashboard-hr-grid">
        <SurfaceCard className="dashboard-main-card"><SectionHeader title="Biến động nhân sự gần đây" description="Các hồ sơ nhân viên mới được cập nhật trong phạm vi của bạn." />{data.recentEmployees.length ? <EmployeeList items={data.recentEmployees} onOpen={onOpenEmployee} /> : <EmptyState title="Chưa có biến động nhân sự" description="Chưa có hồ sơ mới trong phạm vi hiển thị." />}</SurfaceCard>
        <SurfaceCard className="dashboard-side-card dashboard-guidance-card"><SectionHeader title="Tác nghiệp nhân sự" description="Đi thẳng đến dữ liệu cần quản lý." /><div className="dashboard-navigation-list">
          <button type="button" onClick={() => navigateToKey('employees')}><UsersRound size={18} /><span><strong>Danh sách nhân viên</strong><small>Hồ sơ và cây phân cấp nhân sự</small></span><ArrowRight size={15} /></button>
          <button type="button" onClick={() => navigateToKey('departments')}><Building2 size={18} /><span><strong>Cơ cấu tổ chức</strong><small>Đơn vị, phòng ban và nhân sự</small></span><ArrowRight size={15} /></button>
        </div></SurfaceCard>
      </div>
      {data.analytics.length > 0 && <div className="dashboard-analytics-grid">{data.analytics.map((analytics) => <AnalyticsCard analytics={analytics} key={analytics.key} />)}</div>}
    </>}

    {data.activeView === 'SYSTEM' && <>
      <div className="dashboard-work-grid">
        <SurfaceCard className="dashboard-main-card">
          <SectionHeader title="Cảnh báo bảo mật gần đây" description="Các sự kiện xác thực cần quản trị viên chú ý." action={<button className="dashboard-text-action" type="button" onClick={() => navigateToKey('audit-logs')}>Mở nhật ký <ArrowRight size={14} /></button>} />
          {data.securityEvents.length ? <div className="dashboard-action-list">{data.securityEvents.map((event) => <button className="dashboard-action-row" type="button" key={event.id} onClick={() => navigateToKey('audit-logs')}>
            <span className="dashboard-security-icon"><ShieldAlert size={17} /></span><span className="dashboard-row-copy"><strong>{event.actor}</strong><b>{event.description}</b><small>{event.action}{event.ipAddress ? ` · ${event.ipAddress}` : ''}</small></span><span className="dashboard-row-meta">{formatDateTime(event.occurredAt, 'date-first')}<ArrowRight size={16} /></span>
          </button>)}</div> : <EmptyState title="Không có cảnh báo bảo mật gần đây" description="Chưa ghi nhận sự kiện đăng nhập bất thường trong phạm vi hiển thị." />}
        </SurfaceCard>
        <SurfaceCard className="dashboard-side-card"><SectionHeader title="Trạng thái phân hệ" description="Tình trạng bật/tắt trong không gian làm việc." action={<button className="dashboard-text-action" type="button" onClick={() => navigateToKey('workspace-modules')}>Quản lý</button>} />
          {data.workspaceModules.length ? <div className="dashboard-module-list">{data.workspaceModules.slice(0, 8).map((module) => <div key={module.key}><span><strong>{module.name}</strong><small>{module.key}</small></span><span className={module.isEnabled ? 'dashboard-module-status enabled' : 'dashboard-module-status'}>{module.isEnabled ? 'Đang bật' : 'Đang tắt'}</span></div>)}</div> : <EmptyState title="Chưa có dữ liệu phân hệ" description="Bạn chưa có quyền xem hoặc chưa có phân hệ được cấu hình." />}
        </SurfaceCard>
      </div>
      {data.analytics.length > 0 && <div className="dashboard-analytics-grid dashboard-analytics-grid-single">{data.analytics.map((analytics) => <AnalyticsCard analytics={analytics} key={analytics.key} />)}</div>}
    </>}
  </div>
}
