import type { ReactNode } from 'react'

interface AppShellProps {
  sidebar: ReactNode
  topBar: ReactNode
  children: ReactNode
  isSidebarCollapsed?: boolean
}

export function AppShell({ sidebar, topBar, children, isSidebarCollapsed = false }: AppShellProps) {
  return (
    <div className={isSidebarCollapsed ? 'erp-shell sidebar-collapsed' : 'erp-shell'}>
      <aside className={isSidebarCollapsed ? 'sidebar is-collapsed' : 'sidebar'}>{sidebar}</aside>
      <div className="workspace-main">
        {topBar}
        <main className="page-content">{children}</main>
      </div>
    </div>
  )
}
