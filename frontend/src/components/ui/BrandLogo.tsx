import { brandConfig } from '../../config/brand-config'

interface BrandLogoProps {
  className?: string
  priority?: boolean
  variant?: 'mark' | 'wordmark'
}

export function BrandLogo({ className = '', priority = false, variant = 'wordmark' }: BrandLogoProps) {
  return (
    <img
      className={`brand-logo brand-logo-${variant} ${className}`.trim()}
      src={variant === 'mark' ? brandConfig.markPath : brandConfig.wordmarkPath}
      alt={variant === 'mark' ? '' : brandConfig.companyName}
      aria-hidden={variant === 'mark' ? 'true' : undefined}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
    />
  )
}
