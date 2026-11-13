import type { ReactNode } from 'react'
import { useMotionTokens, useShouldReduceMotion } from '@animate-ui/react/utils/motion'
import { motion } from 'motion/react'
import { brandConfig } from '../../config/brand-config'
import { BrandLogo } from './BrandLogo'

interface AuthLayoutProps {
  title: string
  description: ReactNode
  children: ReactNode
}

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  const shouldReduceMotion = useShouldReduceMotion()
  const { spring } = useMotionTokens()
  return (
    <main className="auth-layout">
      <motion.section
        className="auth-card"
        aria-labelledby="auth-title"
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.985, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : spring.dialog}
      >
        <header className="auth-brand">
          <BrandLogo className="auth-brand-logo" variant="wordmark" priority />
          <strong>{brandConfig.systemName}</strong>
        </header>
        <div className="auth-heading">
          <h1 id="auth-title">{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {children}
      </motion.section>
    </main>
  )
}
