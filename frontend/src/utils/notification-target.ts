import { notificationResourceTypes, type SystemNotification } from '../types/notifications'

export interface NotificationTarget {
  path: string
  requestId?: string
  taskId?: string
}

function dataString(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = data?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function safeInternalPath(link: string | undefined): string | undefined {
  if (!link?.startsWith('/') || link.startsWith('//')) return undefined
  try {
    const url = new URL(link, window.location.origin)
    return url.origin === window.location.origin ? `${url.pathname}${url.search}` : undefined
  } catch {
    return undefined
  }
}

export function resolveNotificationTarget(notification: SystemNotification): NotificationTarget | null {
  const resource = notification.resource
  if (resource?.type === notificationResourceTypes.request) {
    return { path: `/requests/${resource.id}`, requestId: resource.id }
  }

  if (resource?.type === notificationResourceTypes.approvalTask) {
    const requestId = dataString(notification.data, 'requestId')
    if (requestId) {
      return {
        path: `/requests/${requestId}?from=approval-inbox&taskId=${encodeURIComponent(resource.id)}`,
        requestId,
        taskId: resource.id,
      }
    }
  }

  const path = safeInternalPath(notification.link)
  if (!path) return null
  const url = new URL(path, window.location.origin)
  const requestMatch = /^\/requests\/([^/]+)$/.exec(url.pathname)
  if (requestMatch) {
    return {
      path,
      requestId: requestMatch[1],
      taskId: url.searchParams.get('taskId') ?? undefined,
    }
  }
  return { path }
}
