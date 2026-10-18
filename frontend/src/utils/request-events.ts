export function notifyRequestMutation(requestId: string): void {
  window.dispatchEvent(new CustomEvent('workflow:request-mutated', { detail: { requestId } }))
  window.dispatchEvent(new Event('workflow:approval-tasks-refresh'))
  window.dispatchEvent(new Event('workflow:notifications-refresh'))
}
