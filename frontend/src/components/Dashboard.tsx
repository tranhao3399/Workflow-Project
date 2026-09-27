import { EmptyState } from './DataStates'
import { RequestStatusBadge } from './StatusBadge'
import { DataTable } from './ui/DataTable'
import { SurfaceCard } from './ui/SurfaceCard'
import type { ApprovalTask, DashboardData, NavigationItem, WorkflowRequest } from '../types/erp'
import { formatCurrency, formatDate } from '../utils/formatters'

function RequestTable({ requests }: { requests: WorkflowRequest[] }) {
  if (requests.length === 0) return <EmptyState title="Chưa có phiếu" description="Các phiếu phát sinh sẽ xuất hiện tại đây." />
  return <DataTable><thead><tr><th>Mã phiếu</th><th>Nội dung</th><th>Người tạo</th><th>Ngày gửi</th><th>Trạng thái</th><th className="align-right">Giá trị</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td className="request-code">{request.code}</td><td><strong>{request.title}</strong><span className="cell-subtitle">{request.formName} · {request.department}</span></td><td>{request.requester}</td><td>{request.submittedAt ? formatDate(request.submittedAt) : 'Chưa gửi'}</td><td><RequestStatusBadge status={request.status} /></td><td className="align-right">{request.amount ? formatCurrency(request.amount) : '—'}</td></tr>)}</tbody></DataTable>
}

function ApprovalList({ approvals }: { approvals: ApprovalTask[] }) {
  if (approvals.length === 0) return <EmptyState title="Hộp thư phê duyệt trống" description="Hiện không có phiếu nào chờ bạn xử lý." />
  return <div className="approval-list">{approvals.map((task) => <article className="approval-row" key={task.id}><div className="approval-main"><div className="approval-title-line"><span className="request-code">{task.request.code}</span><RequestStatusBadge status={task.request.status} /></div><strong>{task.request.title}</strong><p>{task.request.requester} · {task.request.department} · {task.currentStep}</p></div><div className="approval-meta"><span className={task.ageInHours >= 48 ? 'sla overdue' : 'sla'}>{task.ageInHours} giờ chờ</span><span>Hạn xử lý {formatDate(task.dueAt)}</span></div></article>)}</div>
}

interface OverviewDashboardProps { data: DashboardData; navigationItems: NavigationItem[]; onNavigate: (item: NavigationItem) => void }

export function OverviewDashboard({ data, navigationItems, onNavigate }: OverviewDashboardProps) {
  const isEmployee = data.role === 'EMPLOYEE'
  const isAdmin = data.role === 'ADMIN'
  const shortcutKeys = isEmployee ? ['my-requests', 'form-builder', 'workflow-builder'] : ['approval-inbox', 'my-requests', 'form-builder', 'workflow-builder']
  const shortcuts = navigationItems.filter((item) => shortcutKeys.includes(item.key))

  return <><section className="metric-grid" aria-label="Chỉ số tổng quan">{data.metrics.map((metric) => <article className={`metric metric-${metric.tone}`} key={metric.label}><p>{metric.label}</p><strong>{metric.value}</strong><span>{metric.description}</span></article>)}</section>{shortcuts.length > 0 && <SurfaceCard className="dashboard-shortcuts"><div className="section-heading"><div><h2>Truy cập nhanh</h2><p>Đi tới các công việc bạn có quyền thực hiện.</p></div></div><div className="shortcut-list">{shortcuts.map((item) => <button className="secondary-button shortcut-button" type="button" key={item.key} onClick={() => onNavigate(item)}>{item.label}</button>)}</div></SurfaceCard>}<SurfaceCard><div className="section-heading"><div><h2>{isEmployee ? 'Phiếu cần theo dõi' : isAdmin ? 'Phiếu mới phát sinh' : 'Ưu tiên phê duyệt'}</h2><p>{isEmployee ? 'Các phiếu bạn đang tạo hoặc cần cập nhật.' : isAdmin ? 'Các phiếu mới trong toàn hệ thống.' : 'Sắp xếp theo thời gian chờ và hạn xử lý.'}</p></div></div>{isEmployee ? <RequestTable requests={data.requests} /> : <ApprovalList approvals={data.approvals} />}</SurfaceCard><SurfaceCard className="summary-section"><div className="section-heading"><div><h2>{isAdmin ? 'Mức độ vận hành' : 'Hiệu quả xử lý'}</h2><p>Tóm tắt chỉ số gần nhất.</p></div></div><div className="summary-grid">{data.activitySummary.map((item) => <div className="summary-item" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><p>{item.description}</p></div>)}</div></SurfaceCard></>
}

export function RequestsPage({ requests }: { requests: WorkflowRequest[] }) { return <SurfaceCard className="list-page-surface"><RequestTable requests={requests} /></SurfaceCard> }

export function ApprovalPage({ approvals }: { approvals: ApprovalTask[] }) { return <SurfaceCard className="list-page-surface"><ApprovalList approvals={approvals} /></SurfaceCard> }
