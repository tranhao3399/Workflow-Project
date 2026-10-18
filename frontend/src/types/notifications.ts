export const notificationTypes = ['APPROVAL', 'REVISION', 'DECISION', 'SLA', 'SYSTEM'] as const

export type NotificationType = (typeof notificationTypes)[number]
export const notificationTargetTypes = ['PERSONAL', 'BROADCAST'] as const
export type NotificationTargetType = (typeof notificationTargetTypes)[number]

export interface NotificationResource {
  type: string
  id: string
}

export const notificationResourceTypes = {
  request: 'REQUEST',
  approvalTask: 'APPROVAL_TASK',
} as const

export interface NotificationRecord {
  _id: string
  targetType: NotificationTargetType
  userId?: string
  type: NotificationType
  title: string
  description: string
  isRead: boolean
  readAt?: string
  link?: string
  resource?: NotificationResource
  data?: Record<string, unknown>
  createdByUserId?: string
  expiresAt?: string
  dedupeKey?: string
  createdAt: string
  updatedAt: string
}

export interface CreateNotificationInput {
  userId?: string
  type: NotificationType
  title: string
  description: string
  link?: string
  dedupeKey?: string
}

export interface SystemNotification {
  id: string
  type: NotificationType
  title: string
  description: string
  relativeTime: string
  isRead: boolean
  link?: string
  resource?: NotificationResource
  data?: Record<string, unknown>
  createdAt: string
}

export interface NotificationSummary {
  items: SystemNotification[]
  unreadCount: number
}

export interface MarkAllNotificationsReadResult {
  updatedCount: number
}
