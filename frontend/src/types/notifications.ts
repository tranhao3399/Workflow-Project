export const notificationTypes = ['APPROVAL', 'REVISION', 'DECISION', 'SLA', 'SYSTEM'] as const

export type NotificationType = (typeof notificationTypes)[number]

export interface SystemNotification {
  id: string
  type: NotificationType
  title: string
  description: string
  relativeTime: string
  isRead: boolean
}
