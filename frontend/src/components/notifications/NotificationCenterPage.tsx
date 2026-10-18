import { useCallback, useEffect, useState } from 'react'
import { listNotifications, markAllNotificationsRead, setNotificationRead, toSystemNotification } from '../../services/notifications.service'
import type { NotificationRecord, NotificationType, SystemNotification } from '../../types/notifications'
import { useVisiblePolling } from '../../hooks/useVisiblePolling'
import { ErrorState, LoadingState } from '../DataStates'
import { PageHeader } from '../ui/PageHeader'
import { SurfaceCard } from '../ui/SurfaceCard'
import { TablePagination } from '../ui/TablePagination'

type NotificationTab = 'all' | 'unread' | 'read'

interface NotificationCenterPageProps {
  onOpenNotification: (notification: SystemNotification) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
}

const tabs: Array<{ value: NotificationTab; label: string; isRead?: boolean }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unread', label: 'Chưa đọc', isRead: false },
  { value: 'read', label: 'Đã đọc', isRead: true },
]

const typeLabels: Record<NotificationType, string> = {
  APPROVAL: 'Phê duyệt',
  REVISION: 'Bổ sung',
  DECISION: 'Kết quả',
  SLA: 'Thời hạn',
  SYSTEM: 'Hệ thống',
}

export function NotificationCenterPage({ onOpenNotification, onNotify }: NotificationCenterPageProps) {
  const [items, setItems] = useState<NotificationRecord[]>([])
  const [tab, setTab] = useState<NotificationTab>('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isMarkingAll, setIsMarkingAll] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)

  const load = useCallback(async () => {
    const selectedTab = tabs.find((item) => item.value === tab)
    try {
      const result = await listNotifications({ page, limit, isRead: selectedTab?.isRead })
      setItems(result.data)
      setTotal(result.pagination.total)
      setTotalPages(Math.max(1, result.pagination.totalPages))
      setHasError(false)
      if (page > Math.max(1, result.pagination.totalPages)) setPage(Math.max(1, result.pagination.totalPages))
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }, [limit, page, tab])

  // Data fetching intentionally synchronizes the page with the server-side read filter.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load, reloadVersion])

  const poll = useCallback(() => { void load() }, [load])
  useVisiblePolling(poll, 45_000)

  useEffect(() => {
    const refresh = () => { void load() }
    window.addEventListener('workflow:notifications-refresh', refresh)
    return () => window.removeEventListener('workflow:notifications-refresh', refresh)
  }, [load])

  async function markRead(item: NotificationRecord, openAfter = false) {
    if (busyId) return
    if (item.isRead) {
      if (openAfter) onOpenNotification(toSystemNotification(item))
      return
    }
    setBusyId(item._id)
    try {
      const updated = await setNotificationRead(item._id, true)
      setItems((current) => current.map((entry) => entry._id === updated._id ? updated : entry))
      window.dispatchEvent(new Event('workflow:notifications-refresh'))
      if (openAfter) onOpenNotification(toSystemNotification(updated))
      else if (tab === 'unread') await load()
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể cập nhật thông báo.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function markAllRead() {
    if (isMarkingAll) return
    setIsMarkingAll(true)
    try {
      const result = await markAllNotificationsRead()
      await load()
      window.dispatchEvent(new Event('workflow:notifications-refresh'))
      onNotify(result.updatedCount > 0 ? 'Đã đánh dấu tất cả thông báo là đã đọc.' : 'Không có thông báo chưa đọc.')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể cập nhật thông báo.', 'error')
    } finally {
      setIsMarkingAll(false)
    }
  }

  const rangeStart = total ? (page - 1) * limit + 1 : 0
  const rangeEnd = Math.min(page * limit, total)

  return <>
    <PageHeader title="Thông báo" description="Theo dõi các cập nhật và công việc liên quan đến bạn." actions={<button className="secondary-button compact-button" type="button" disabled={isMarkingAll || total === 0} onClick={() => void markAllRead()}>{isMarkingAll ? 'Đang cập nhật...' : 'Đánh dấu tất cả đã đọc'}</button>} />
    <SurfaceCard className="notification-center">
      <div className="notification-center-tabs" role="tablist" aria-label="Lọc thông báo">{tabs.map((item) => <button className={tab === item.value ? 'is-active' : ''} type="button" role="tab" aria-selected={tab === item.value} key={item.value} onClick={() => { setTab(item.value); setPage(1); setIsLoading(true) }}>{item.label}</button>)}</div>
      {isLoading && !items.length ? <LoadingState /> : hasError ? <ErrorState onRetry={() => { setIsLoading(true); setHasError(false); setReloadVersion((value) => value + 1) }} /> : <>
        <div className="notification-center-list" aria-live="polite">{items.length === 0 ? <section className="notification-center-empty"><strong>Không có thông báo</strong><span>Các cập nhật mới sẽ xuất hiện tại đây.</span></section> : items.map((item) => <article className={item.isRead ? 'notification-center-item' : 'notification-center-item is-unread'} key={item._id}>
          <button className="notification-center-main" type="button" disabled={busyId === item._id} onClick={() => void markRead(item, true)}>
            <span className={`notification-kind notification-kind-${item.type.toLowerCase()}`}>{typeLabels[item.type]}</span>
            <span className="notification-center-copy"><strong>{item.title}</strong><span>{item.description}</span><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time></span>
            {!item.isRead && <span className="notification-unread-marker" aria-label="Chưa đọc" />}
          </button>
          {!item.isRead && <button className="text-action-button notification-read-action" type="button" disabled={busyId === item._id} onClick={() => void markRead(item)}>{busyId === item._id ? 'Đang cập nhật...' : 'Đánh dấu đã đọc'}</button>}
        </article>)}</div>
        <TablePagination currentPage={page} totalPages={totalPages} onPrevious={() => { setPage((value) => Math.max(1, value - 1)); setIsLoading(true) }} onNext={() => { setPage((value) => Math.min(totalPages, value + 1)); setIsLoading(true) }} rangeLabel={`${rangeStart}-${rangeEnd} trên ${total} thông báo`} pageSize={limit} pageSizes={[10, 20, 50]} onPageSizeChange={(value) => { setLimit(value); setPage(1); setIsLoading(true) }} />
      </>}
    </SurfaceCard>
  </>
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
