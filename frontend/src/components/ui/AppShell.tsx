import type { ReactNode } from 'react'

interface AppShellProps {
  sidebar: ReactNode
  topBar: ReactNode
  children: ReactNode
  isSidebarCollapsed?: boolean
  hasUnsavedChanges?: boolean
}

export function AppShell({ sidebar, topBar, children, isSidebarCollapsed = false, hasUnsavedChanges = false }: AppShellProps) {
  return (
    <div className={isSidebarCollapsed ? 'erp-shell sidebar-collapsed' : 'erp-shell'}>
      <aside className={isSidebarCollapsed ? 'sidebar is-collapsed' : 'sidebar'}>{sidebar}</aside>
      <div className="workspace-main">
        {topBar}
        <main className={hasUnsavedChanges ? 'page-content has-unsaved-changes' : 'page-content'}>{children}</main>
      </div>
    </div>
  )
}
