import type { ReactNode } from 'react'

export function ListToolbar({ children }: { children: ReactNode }) {
  return <div className="list-toolbar">{children}</div>
}
