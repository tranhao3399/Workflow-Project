import { useEffect } from 'react'

export function useVisiblePolling(callback: () => void, intervalMs: number, enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined

    const runWhenVisible = () => {
      if (document.visibilityState === 'visible') callback()
    }
    const intervalId = window.setInterval(runWhenVisible, intervalMs)
    document.addEventListener('visibilitychange', runWhenVisible)
    window.addEventListener('focus', runWhenVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', runWhenVisible)
      window.removeEventListener('focus', runWhenVisible)
    }
  }, [callback, enabled, intervalMs])
}
