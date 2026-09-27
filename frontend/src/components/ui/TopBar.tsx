import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AuthUser } from '../../types/auth'
import type { NavigationItem } from '../../types/erp'
import type { SystemNotification } from '../../types/notifications'
import { formatRole } from '../../utils/formatters'
import { getNotifications, updateNotificationRead } from '../../services/notifications.service'

interface TopBarProps {
  breadcrumb: string
  user: AuthUser
  isLoggingOut: boolean
  onLogout: () => Promise<void>
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

export function TopBar({ breadcrumb, user, isLoggingOut, onLogout, searchQuery, onSearchChange, searchResults, onSearchSelect, isMobileSearchActive, onMobileSearchOpen, onMobileSearchClose }: TopBarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<SystemNotification[]>([])
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const notificationMenuRef = useRef<HTMLDivElement>(null)
  const showSearchResults = isSearchFocused && Boolean(searchQuery.trim())
  const unreadNotificationCount = notifications.filter((notification) => !notification.isRead).length

  useEffect(() => {
    let isCurrent = true
    void getNotifications().then((items) => { if (isCurrent) setNotifications(items) }).catch(() => { if (isCurrent) setNotifications([]) })
    return () => { isCurrent = false }
  }, [])

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

  function markNotificationRead(notificationId: string) {
    void updateNotificationRead(notificationId, true).then((updated) => setNotifications((current) => current.map((notification) => notification.id === updated.id ? updated : notification))).catch(() => undefined)
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
      <div className="breadcrumb"><span>WorkFlow ERP</span><span className="breadcrumb-separator">/</span><strong>{breadcrumb}</strong></div>
      <div className="search-container" ref={searchContainerRef}><div className="header-search"><span className="search-icon" aria-hidden="true" /><input ref={searchInputRef} aria-label="Nhập để tìm kiếm màn hình" value={searchQuery} onChange={(event) => { setActiveResultIndex(0); onSearchChange(event.target.value) }} onFocus={() => setIsSearchFocused(true)} onKeyDown={handleSearchKeyDown} placeholder="Nhập để tìm kiếm màn hình" /></div>{showSearchResults && <div className="search-suggestions" role="listbox" aria-label="Màn hình phù hợp">{searchResults.length > 0 ? searchResults.map((item, index) => <button className={index === activeResultIndex ? 'search-suggestion active' : 'search-suggestion'} type="button" role="option" aria-selected={index === activeResultIndex} key={item.key} onClick={() => selectSearchResult(item)}><span>{item.label}</span><small>{item.section === 'administration' ? 'Quản trị' : 'Không gian làm việc'}</small></button>) : <p className="search-no-results">Không tìm thấy màn hình phù hợp.</p>}</div>}</div>
      <button className="search-trigger" type="button" onClick={() => { onMobileSearchOpen(); window.requestAnimationFrame(() => searchInputRef.current?.focus()) }} aria-label="Tìm màn hình hoặc chức năng" title="Tìm màn hình hoặc chức năng"><span className="search-icon" aria-hidden="true" /></button>
      <div className="topbar-actions">
        <div className="notification-menu" ref={notificationMenuRef}>
          <button className="notification-trigger" type="button" aria-label="Thông báo" aria-haspopup="menu" aria-expanded={isNotificationsOpen} aria-controls="notification-popover" onClick={() => setIsNotificationsOpen((current) => !current)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>{unreadNotificationCount > 0 && <span className="notification-badge" aria-label={`${unreadNotificationCount} thông báo chưa đọc`}>{unreadNotificationCount}</span>}</button>
          {isNotificationsOpen && <section className="notification-popover" id="notification-popover" role="menu" aria-label="Thông báo"><header className="notification-popover-header"><div><h2>Thông báo</h2></div></header><div className="notification-list">{notifications.length === 0 ? <p className="search-no-results">Chưa có thông báo.</p> : notifications.slice(0, 5).map((notification) => <button className={notification.isRead ? `notification-item notification-${notification.type.toLowerCase()}` : `notification-item notification-${notification.type.toLowerCase()} is-unread`} type="button" role="menuitem" key={notification.id} onClick={() => markNotificationRead(notification.id)}><span className="notification-dot" aria-hidden="true" /><span className="notification-content"><strong>{notification.title}</strong><span>{notification.description}</span><time>{notification.relativeTime}</time></span></button>)}</div></section>}
        </div>
        <div className="account-menu" ref={accountMenuRef}>
          <button className="account-trigger" type="button" aria-haspopup="menu" aria-expanded={isAccountOpen} aria-controls="account-popover" onClick={() => setIsAccountOpen((current) => !current)}><span className="header-avatar" aria-hidden="true">{firstInitial(user.fullName)}</span><span className="account-summary"><strong>{user.fullName}</strong><span>{formatRole(user.role)}</span></span><span className="account-chevron" aria-hidden="true" /></button>
          {isAccountOpen && <section className="account-popover" id="account-popover" role="menu" aria-label="Tài khoản đang đăng nhập"><div className="account-popover-info"><strong>{user.fullName}</strong><span>{user.email}</span><span className="account-role-badge">{formatRole(user.role)}</span></div><div className="account-divider" /><button className="account-logout" type="button" role="menuitem" disabled={isLoggingOut} onClick={() => void onLogout()}>{isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}</button></section>}
        </div>
      </div>
    </header>
  )
}
