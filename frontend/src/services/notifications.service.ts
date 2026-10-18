import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'
import type { CreateNotificationInput, MarkAllNotificationsReadResult, NotificationRecord, NotificationSummary, SystemNotification } from '../types/notifications'
import type { NotificationFilter, PaginatedResponse } from '../types/workflow'
import { withQuery } from './query-params'

function relativeTime(createdAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000))
  if (minutes < 1) return 'Vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  return `${Math.floor(hours / 24)} ngày trước`
}

export function toSystemNotification(item: NotificationRecord): SystemNotification {
  return {
    id: item._id,
    type: item.type,
    title: item.title,
    description: item.description,
    isRead: item.isRead,
    relativeTime: relativeTime(item.createdAt),
    link: item.link,
    resource: item.resource,
    data: item.data,
    createdAt: item.createdAt,
  }
}

export function listNotifications(filter: NotificationFilter = {}): Promise<PaginatedResponse<NotificationRecord>> {
  return apiClient(withQuery('/notifications', filter))
}

export async function getNotification(id: string): Promise<NotificationRecord> {
  return (await apiClient<ApiDataResponse<NotificationRecord>>(`/notifications/${encodeURIComponent(id)}`)).data
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationRecord> {
  return (await apiClient<ApiDataResponse<NotificationRecord>>('/notifications', { method: 'POST', body: JSON.stringify(input) })).data
}

export async function getNotificationSummary(): Promise<NotificationSummary> {
  const [recent, unread] = await Promise.all([
    listNotifications({ page: 1, limit: 5 }),
    listNotifications({ isRead: false, page: 1, limit: 1 }),
  ])
  return {
    items: recent.data.map(toSystemNotification),
    unreadCount: unread.pagination.total,
  }
}

export async function updateNotificationRead(id: string, isRead: boolean): Promise<SystemNotification> {
  const response = await apiClient<ApiDataResponse<NotificationRecord>>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', body: JSON.stringify({ isRead }) })
  return toSystemNotification(response.data)
}

export async function setNotificationRead(id: string, isRead: boolean): Promise<NotificationRecord> {
  return (await apiClient<ApiDataResponse<NotificationRecord>>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', body: JSON.stringify({ isRead }) })).data
}

export async function markAllNotificationsRead(): Promise<MarkAllNotificationsReadResult> {
  return (await apiClient<ApiDataResponse<MarkAllNotificationsReadResult>>('/notifications/read-all', { method: 'PATCH' })).data
}
