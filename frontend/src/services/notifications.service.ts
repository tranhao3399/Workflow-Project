import { apiClient } from './api-client'
import type { ApiDataResponse } from './api-client'
import type { NotificationType, SystemNotification } from '../types/notifications'

interface NotificationApiRecord {
  _id: string
  type: NotificationType
  title: string
  description: string
  isRead: boolean
  createdAt: string
}

function relativeTime(createdAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000))
  if (minutes < 1) return 'Vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  return `${Math.floor(hours / 24)} ngày trước`
}

function fromApi(item: NotificationApiRecord): SystemNotification {
  return { id: item._id, type: item.type, title: item.title, description: item.description, isRead: item.isRead, relativeTime: relativeTime(item.createdAt) }
}

export async function getNotifications(): Promise<SystemNotification[]> {
  const response = await apiClient<{ data: NotificationApiRecord[] }>('/notifications?page=1&limit=5')
  return response.data.map(fromApi)
}

export async function updateNotificationRead(id: string, isRead: boolean): Promise<SystemNotification> {
  const response = await apiClient<ApiDataResponse<NotificationApiRecord>>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', body: JSON.stringify({ isRead }) })
  return fromApi(response.data)
}
