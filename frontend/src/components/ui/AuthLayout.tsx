import type { ReactNode } from 'react'
import { brandConfig } from '../../config/brand-config'
import { BrandLogo } from './BrandLogo'

interface AuthLayoutProps {
  title: string
  description: ReactNode
  children: ReactNode
}

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-brand">
          <BrandLogo className="auth-brand-logo" variant="wordmark" priority />
          <strong>{brandConfig.systemName}</strong>
        </header>
        <div className="auth-heading">
          <h1 id="auth-title">{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {children}
      </section>
    </main>
  )
}
