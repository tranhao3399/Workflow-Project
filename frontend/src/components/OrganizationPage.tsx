import { useEffect, useState } from 'react'
import { getReferenceData } from '../services/reference-data.service'
import type { ReferenceData } from '../types/reference-data'
import { ErrorState, LoadingState } from './DataStates'
import { DataTable } from './ui/DataTable'
import { PageHeader } from './ui/PageHeader'
import { SurfaceCard } from './ui/SurfaceCard'
export function OrganizationPage() {
  const [data, setData] = useState<ReferenceData | null>(null); const [tab, setTab] = useState<'DEPARTMENTS' | 'POSITIONS'>('DEPARTMENTS'); const [error, setError] = useState(false)
  useEffect(() => { void getReferenceData().then((result) => setData(result.data)).catch(() => setError(true)) }, [])
  if (error) return <ErrorState onRetry={() => window.location.reload()} />
  if (!data) return <LoadingState />
  return <><PageHeader title="Cơ cấu tổ chức" description="Danh mục phòng ban và chức danh dùng chung cho hồ sơ nhân viên." /><SurfaceCard className="admin-section"><div className="detail-tabs"><button className={tab === 'DEPARTMENTS' ? 'active' : ''} type="button" onClick={() => setTab('DEPARTMENTS')}>Phòng ban</button><button className={tab === 'POSITIONS' ? 'active' : ''} type="button" onClick={() => setTab('POSITIONS')}>Chức danh</button></div>{tab === 'DEPARTMENTS' ? <DataTable className="admin-table"><thead><tr><th>Mã</th><th>Phòng ban</th><th>Thứ tự</th><th>Trạng thái</th></tr></thead><tbody>{data.departments.map((item) => <tr key={item._id}><td>{item.code}</td><td>{item.name}</td><td>{item.sortOrder}</td><td>{item.isActive ? 'Hoạt động' : 'Ngưng hoạt động'}</td></tr>)}</tbody></DataTable> : <DataTable className="admin-table"><thead><tr><th>Mã</th><th>Chức danh</th><th>Phòng ban</th><th>Thứ tự</th></tr></thead><tbody>{data.positions.map((item) => <tr key={item._id}><td>{item.code}</td><td>{item.name}</td><td>{typeof item.departmentId === 'object' ? item.departmentId.name : 'Dùng chung'}</td><td>{item.sortOrder}</td></tr>)}</tbody></DataTable>}</SurfaceCard></>
}
