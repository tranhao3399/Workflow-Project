import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Inbox,
  LayoutTemplate,
  UserRoundCog,
  UsersRound,
  Workflow as WorkflowIcon,
  type LucideIcon,
} from 'lucide-react'
import { EmptyState } from './DataStates'
import { RequestStatusBadge } from './StatusBadge'
import { DataTable } from './ui/DataTable'
import { SurfaceCard } from './ui/SurfaceCard'
import type { ApprovalTask, DashboardData, NavigationItem, NavigationKey, WorkflowRequest } from '../types/erp'
import { formatCurrency, formatDate } from '../utils/formatters'
import { hasPermission } from '../utils/permissions'

const metricPermissionByLabel: Record<string, string> = {
  'Nhân viên đang làm việc': 'EMPLOYEE.VIEW',
  'Tài khoản hoạt động': 'USER.VIEW',
  'Phòng ban hoạt động': 'DEPARTMENT.VIEW',
  'Chức danh hoạt động': 'JOB_TITLE.VIEW',
}

const summaryPermissionByLabel: Record<string, string> = {
  'Nhân viên': 'EMPLOYEE.VIEW',
  'Tài khoản': 'USER.VIEW',
}

const metricIconByPermission: Record<string, LucideIcon> = {
  'EMPLOYEE.VIEW': UsersRound,
  'USER.VIEW': UserRoundCog,
  'DEPARTMENT.VIEW': Building2,
  'JOB_TITLE.VIEW': BriefcaseBusiness,
}

const shortcutIconByKey: Partial<Record<NavigationKey, LucideIcon>> = {
  'my-requests': ClipboardList,
  'approval-inbox': Inbox,
  'form-builder': LayoutTemplate,
  'workflow-builder': WorkflowIcon,
}

function RequestTable({ requests }: { requests: WorkflowRequest[] }) {
  if (requests.length === 0) return <EmptyState title="Chưa có phiếu" description="Các phiếu phát sinh sẽ xuất hiện tại đây." />
  return <DataTable><thead><tr><th>Mã phiếu</th><th>Nội dung</th><th>Người tạo</th><th>Ngày gửi</th><th>Trạng thái</th><th className="align-right">Giá trị</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td className="request-code">{request.code}</td><td><strong>{request.title}</strong><span className="cell-subtitle">{request.formName} · {request.department}</span></td><td>{request.requester}</td><td>{request.submittedAt ? formatDate(request.submittedAt) : 'Chưa gửi'}</td><td><RequestStatusBadge status={request.status} /></td><td className="align-right">{request.amount ? formatCurrency(request.amount) : '—'}</td></tr>)}</tbody></DataTable>
}

function ApprovalList({ approvals }: { approvals: ApprovalTask[] }) {
  if (approvals.length === 0) return <EmptyState title="Hộp thư phê duyệt trống" description="Hiện không có phiếu nào chờ bạn xử lý." />
  return <div className="approval-list">{approvals.map((task) => <article className="approval-row" key={task.id}><div className="approval-main"><div className="approval-title-line"><span className="request-code">{task.request.code}</span><RequestStatusBadge status={task.request.status} /></div><strong>{task.request.title}</strong><p>{task.request.requester} · {task.request.department} · {task.currentStep}</p></div><div className="approval-meta"><span className={task.ageInHours >= 48 ? 'sla overdue' : 'sla'}>{task.ageInHours} giờ chờ</span><span>Hạn xử lý {formatDate(task.dueAt)}</span></div></article>)}</div>
}

interface OverviewDashboardProps {
  data: DashboardData
  navigationItems: NavigationItem[]
  permissionKeys: readonly string[]
  onNavigate: (item: NavigationItem) => void
}

export function OverviewDashboard({ data, navigationItems, permissionKeys, onNavigate }: OverviewDashboardProps) {
  const canViewApprovals = hasPermission(permissionKeys, 'APPROVALS.VIEW_ASSIGNED')
  const canViewAllRequests = hasPermission(permissionKeys, 'REQUESTS.VIEW_ALL')
  const shortcutKeys = ['approval-inbox', 'my-requests', 'form-builder', 'workflow-builder']
  const shortcuts = navigationItems.filter((item) => shortcutKeys.includes(item.key))
  const metrics = data.metrics.filter((metric) => {
    const requiredPermission = metricPermissionByLabel[metric.label]
    return !requiredPermission || hasPermission(permissionKeys, requiredPermission)
  })
  const activitySummary = data.activitySummary.filter((item) => {
    const requiredPermission = summaryPermissionByLabel[item.label]
    return !requiredPermission || hasPermission(permissionKeys, requiredPermission)
  })

  return <div className="dashboard-overview">
    {metrics.length > 0 && <section className={`metric-grid metric-grid-${Math.min(metrics.length, 4)}`} aria-label="Chỉ số tổng quan">
      {metrics.map((metric) => {
        const requiredPermission = metricPermissionByLabel[metric.label]
        const MetricIcon = metricIconByPermission[requiredPermission] ?? ClipboardList
        return <article className={`metric metric-${metric.tone}`} key={metric.label}>
          <div className="metric-heading"><span className="metric-icon"><MetricIcon aria-hidden="true" /></span><p>{metric.label}</p></div>
          <strong>{metric.value}</strong>
          <span>{metric.description}</span>
        </article>
      })}
    </section>}
    {shortcuts.length > 0 && <SurfaceCard className="dashboard-shortcuts"><div className="section-heading"><div><h2>Truy cập nhanh</h2><p>Đi tới các chức năng bạn có quyền thực hiện.</p></div></div><div className="shortcut-list">{shortcuts.map((item) => {
      const ShortcutIcon = shortcutIconByKey[item.key]
      return <button className="secondary-button shortcut-button" type="button" key={item.key} onClick={() => onNavigate(item)}>
        {ShortcutIcon && <ShortcutIcon size={16} aria-hidden="true" />}
        <span>{item.label}</span>
        <ArrowRight className="shortcut-arrow" size={15} aria-hidden="true" />
      </button>
    })}</div></SurfaceCard>}
    <SurfaceCard><div className="section-heading"><div><h2>{canViewApprovals ? 'Ưu tiên phê duyệt' : canViewAllRequests ? 'Phiếu mới phát sinh' : 'Phiếu cần theo dõi'}</h2><p>{canViewApprovals ? 'Các phiếu đang chờ bạn xem xét và xử lý.' : canViewAllRequests ? 'Các phiếu mới trong toàn hệ thống.' : 'Các phiếu bạn đang tạo hoặc cần cập nhật.'}</p></div></div>{canViewApprovals ? <ApprovalList approvals={data.approvals} /> : <RequestTable requests={data.requests} />}</SurfaceCard>
    {activitySummary.length > 0 && <SurfaceCard className="summary-section"><div className="section-heading"><div><h2>Mức độ vận hành</h2><p>Tóm tắt các chỉ số bạn có quyền theo dõi.</p></div></div><div className={`summary-grid summary-grid-${Math.min(activitySummary.length, 3)}`}>{activitySummary.map((item) => <div className="summary-item" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><p>{item.description}</p></div>)}</div></SurfaceCard>}
  </div>
}

export function RequestsPage({ requests }: { requests: WorkflowRequest[] }) { return <SurfaceCard className="list-page-surface"><RequestTable requests={requests} /></SurfaceCard> }

export function ApprovalPage({ approvals }: { approvals: ApprovalTask[] }) { return <SurfaceCard className="list-page-surface"><ApprovalList approvals={approvals} /></SurfaceCard> }
