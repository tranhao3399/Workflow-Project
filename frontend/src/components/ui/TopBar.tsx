import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useVisiblePolling } from '../../hooks/useVisiblePolling'
import { resolveApiAssetUrl } from '../../services/api-client'
import { getNotificationSummary, markAllNotificationsRead, updateNotificationRead } from '../../services/notifications.service'
import type { AuthUser } from '../../types/auth'
import type { NavigationItem } from '../../types/erp'
import type { SystemNotification } from '../../types/notifications'

interface TopBarProps {
  user: AuthUser
  isLoggingOut: boolean
  onLogout: () => Promise<void>
  onOpenMyAccount: () => void
  canViewNotifications: boolean
  onOpenNotifications: () => void
  onOpenNotification: (notification: SystemNotification) => void
  onNotify: (message: string, tone?: 'success' | 'error') => void
  searchQuery: string
  onSearchChange: (value: string) => void
  searchResults: NavigationItem[]
  onSearchSelect: (item: NavigationItem) => void
  isMobileSearchActive: boolean
  onMobileSearchOpen: () => void
  onMobileSearchClose: () => void
}

function firstInitial(fullName: string): string {
  return fullName.trim().charAt(0).toUpperCase() || 'U'
}

export function TopBar({
  user,
  isLoggingOut,
  onLogout,
  onOpenMyAccount,
  canViewNotifications,
  onOpenNotifications,
  onOpenNotification,
  onNotify,
  searchQuery,
  onSearchChange,
  searchResults,
  onSearchSelect,
  isMobileSearchActive,
  onMobileSearchOpen,
  onMobileSearchClose,
}: TopBarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<SystemNotification[]>([])
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(canViewNotifications)
  const [hasNotificationError, setHasNotificationError] = useState(false)
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null)
  const [isMarkingAll, setIsMarkingAll] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const notificationMenuRef = useRef<HTMLDivElement>(null)
  const showSearchResults = isSearchFocused && Boolean(searchQuery.trim())

  const loadNotifications = useCallback(async () => {
    if (!canViewNotifications) return
    try {
      const summary = await getNotificationSummary()
      setNotifications(summary.items)
      setUnreadNotificationCount(summary.unreadCount)
      setHasNotificationError(false)
    } catch {
      setHasNotificationError(true)
    } finally {
      setIsNotificationsLoading(false)
    }
  }, [canViewNotifications])

  // The header synchronizes its badge with the current notification summary.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadNotifications() }, [loadNotifications])
  useVisiblePolling(loadNotifications, 45_000, canViewNotifications)

  useEffect(() => {
    window.addEventListener('workflow:notifications-refresh', loadNotifications)
    return () => window.removeEventListener('workflow:notifications-refresh', loadNotifications)
  }, [loadNotifications])

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        onMobileSearchOpen()
        window.requestAnimationFrame(() => searchInputRef.current?.focus())
        return
      }
      if (event.key === 'Escape') {
        onSearchChange('')
        onMobileSearchClose()
        setIsAccountOpen(false)
        setIsNotificationsOpen(false)
      }
    }

    document.addEventListener('keydown', onGlobalKeyDown)
    return () => document.removeEventListener('keydown', onGlobalKeyDown)
  }, [onMobileSearchClose, onMobileSearchOpen, onSearchChange])

  useEffect(() => {
    function closeAccountMenu(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) setIsAccountOpen(false)
    }
    document.addEventListener('mousedown', closeAccountMenu)
    return () => document.removeEventListener('mousedown', closeAccountMenu)
  }, [])

  useEffect(() => {
    function closeNotificationMenu(event: MouseEvent) {
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target as Node)) setIsNotificationsOpen(false)
    }
    document.addEventListener('mousedown', closeNotificationMenu)
    return () => document.removeEventListener('mousedown', closeNotificationMenu)
  }, [])

  useEffect(() => {
    function closeSearchResults(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) setIsSearchFocused(false)
    }
    document.addEventListener('mousedown', closeSearchResults)
    return () => document.removeEventListener('mousedown', closeSearchResults)
  }, [])

  function selectSearchResult(item: NavigationItem) {
    setIsSearchFocused(false)
    onSearchSelect(item)
  }

  async function openNotification(notification: SystemNotification) {
    if (busyNotificationId) return
    setBusyNotificationId(notification.id)
    try {
      const current = notification.isRead ? notification : await updateNotificationRead(notification.id, true)
      if (!notification.isRead) {
        setNotifications((items) => items.map((item) => item.id === current.id ? current : item))
        setUnreadNotificationCount((count) => Math.max(0, count - 1))
      }
      setIsNotificationsOpen(false)
      onOpenNotification(current)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể mở thông báo.', 'error')
    } finally {
      setBusyNotificationId(null)
    }
  }

  async function markAllRead() {
    if (isMarkingAll || unreadNotificationCount === 0) return
    setIsMarkingAll(true)
    try {
      await markAllNotificationsRead()
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })))
      setUnreadNotificationCount(0)
      window.dispatchEvent(new Event('workflow:notifications-refresh'))
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Không thể cập nhật thông báo.', 'error')
    } finally {
      setIsMarkingAll(false)
    }
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && searchResults.length > 0) {
      event.preventDefault()
      setIsSearchFocused(true)
      setActiveResultIndex((current) => (current + 1) % searchResults.length)
      return
    }
    if (event.key === 'ArrowUp' && searchResults.length > 0) {
      event.preventDefault()
      setIsSearchFocused(true)
      setActiveResultIndex((current) => (current - 1 + searchResults.length) % searchResults.length)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onSearchChange('')
      onMobileSearchClose()
      setIsSearchFocused(false)
      return
    }
    if (event.key === 'Enter' && searchResults.length > 0) {
      event.preventDefault()
      selectSearchResult(searchResults[activeResultIndex] ?? searchResults[0])
    }
  }

  return (
    <header className={isMobileSearchActive ? 'topbar search-active' : 'topbar'}>
      <div className="search-container" ref={searchContainerRef}>
        <div className="header-search"><span className="search-icon" aria-hidden="true" /><input ref={searchInputRef} aria-label="Tìm chức năng" value={searchQuery} onChange={(event) => { setActiveResultIndex(0); onSearchChange(event.target.value) }} onFocus={() => setIsSearchFocused(true)} onKeyDown={handleSearchKeyDown} placeholder="Tìm chức năng..." /></div>
        {showSearchResults && <div className="search-suggestions" role="listbox" aria-label="Màn hình phù hợp">{searchResults.length > 0 ? searchResults.map((item, index) => <button className={index === activeResultIndex ? 'search-suggestion active' : 'search-suggestion'} type="button" role="option" aria-selected={index === activeResultIndex} key={item.key} onClick={() => selectSearchResult(item)}><span>{item.label}</span><small>{item.section === 'administration' ? 'Quản trị' : 'Không gian làm việc'}</small></button>) : <p className="search-no-results">Không tìm thấy màn hình phù hợp.</p>}</div>}
      </div>
      <button className="search-trigger" type="button" onClick={() => { onMobileSearchOpen(); window.requestAnimationFrame(() => searchInputRef.current?.focus()) }} aria-label="Tìm màn hình hoặc chức năng" title="Tìm màn hình hoặc chức năng"><span className="search-icon" aria-hidden="true" /></button>
      <div className="topbar-actions">
        {canViewNotifications && <div className="notification-menu" ref={notificationMenuRef}>
          <button className="notification-trigger" type="button" aria-label="Thông báo" aria-haspopup="menu" aria-expanded={isNotificationsOpen} aria-controls="notification-popover" onClick={() => setIsNotificationsOpen((current) => !current)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>{unreadNotificationCount > 0 && <span className="notification-badge" aria-label={`${unreadNotificationCount} thông báo chưa đọc`}>{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}</button>
          {isNotificationsOpen && <section className="notification-popover" id="notification-popover" role="menu" aria-label="Thông báo">
            <header className="notification-popover-header"><div><h2>Thông báo</h2><span>{unreadNotificationCount} chưa đọc</span></div>{unreadNotificationCount > 0 && <button className="text-action-button" type="button" disabled={isMarkingAll} onClick={() => void markAllRead()}>{isMarkingAll ? 'Đang cập nhật...' : 'Đọc tất cả'}</button>}</header>
            <div className="notification-list">{isNotificationsLoading ? <p className="search-no-results">Đang tải thông báo...</p> : hasNotificationError ? <button className="notification-retry" type="button" onClick={() => { setIsNotificationsLoading(true); void loadNotifications() }}>Không thể tải thông báo. Thử lại</button> : notifications.length === 0 ? <p className="search-no-results">Chưa có thông báo.</p> : notifications.map((notification) => <button className={notification.isRead ? `notification-item notification-${notification.type.toLowerCase()}` : `notification-item notification-${notification.type.toLowerCase()} is-unread`} type="button" role="menuitem" disabled={busyNotificationId === notification.id} key={notification.id} onClick={() => void openNotification(notification)}><span className="notification-dot" aria-hidden="true" /><span className="notification-content"><strong>{notification.title}</strong><span>{notification.description}</span><time dateTime={notification.createdAt}>{notification.relativeTime}</time></span></button>)}</div>
            <footer className="notification-popover-footer"><button type="button" onClick={() => { setIsNotificationsOpen(false); onOpenNotifications() }}>Xem tất cả thông báo</button></footer>
          </section>}
        </div>}
        <div className="account-menu" ref={accountMenuRef}>
          <button className="account-trigger" type="button" aria-haspopup="menu" aria-expanded={isAccountOpen} aria-controls="account-popover" onClick={() => setIsAccountOpen((current) => !current)}><span className="header-avatar" aria-hidden="true">{user.avatarUrl ? <img src={resolveApiAssetUrl(user.avatarUrl)} alt="" /> : firstInitial(user.fullName)}</span><span className="account-summary"><strong>{user.fullName}</strong></span><span className="account-chevron" aria-hidden="true" /></button>
          {isAccountOpen && <section className="account-popover" id="account-popover" role="menu" aria-label="Tài khoản đang đăng nhập"><div className="account-popover-info"><strong>{user.fullName}</strong><span>{user.email}</span></div><div className="account-divider" /><button className="account-menu-action" type="button" role="menuitem" onClick={() => { setIsAccountOpen(false); onOpenMyAccount() }}>Tài khoản của tôi</button><button className="account-logout" type="button" role="menuitem" disabled={isLoggingOut} onClick={() => void onLogout()}>{isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}</button></section>}
        </div>
      </div>
    </header>
  )
}
