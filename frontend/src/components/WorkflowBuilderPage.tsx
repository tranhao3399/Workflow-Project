import { useState } from 'react'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
import { FilterSelect } from './ui/FilterSelect'

type ApproverTarget = 'REQUESTER_DIRECT_MANAGER' | 'ASSIGNED_ROLE'

export function WorkflowBuilderPage() {
  const [target, setTarget] = useState<ApproverTarget>('REQUESTER_DIRECT_MANAGER')
  return <><PageHeader title="Workflow Builder" description="Thiết lập bước xử lý và cách xác định người phê duyệt." /><SurfaceCard className="workflow-rule-card"><div className="section-heading"><div><h2>Người phê duyệt bước 1</h2><p>Target được resolve khi phiếu mới được tạo, không lưu cứng tên nhân sự.</p></div></div><label className="employee-profile-field"><span>Target người duyệt</span><FilterSelect ariaLabel="Chọn target người duyệt" value={target} options={[{ value: 'REQUESTER_DIRECT_MANAGER', label: 'Quản lý trực tiếp của người gửi' }, { value: 'ASSIGNED_ROLE', label: 'Vai trò được gán theo workflow' }]} onChange={(value) => setTarget(value as ApproverTarget)} /></label><p className="workflow-rule-note">{target === 'REQUESTER_DIRECT_MANAGER' ? 'Hệ thống dùng managerId hiện tại của nhân viên gửi phiếu. Khi quản lý trực tiếp thay đổi, các phiếu tạo sau sẽ dùng người duyệt mới.' : 'Hệ thống dùng vai trò được cấu hình tại bước workflow này.'}</p></SurfaceCard></>
}
