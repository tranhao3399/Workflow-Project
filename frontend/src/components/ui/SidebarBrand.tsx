import { brandConfig } from '../../config/brand-config'
import { BrandLogo } from './BrandLogo'

interface SidebarBrandProps {
  isCollapsed: boolean
  onToggle: () => void
}

export function SidebarBrand({ isCollapsed, onToggle }: SidebarBrandProps) {
  const toggleLabel = isCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'

  return (
    <div className="sidebar-brand">
      <div className="sidebar-brand-identity" title={`${brandConfig.companyName} · ${brandConfig.sidebarSystemName}`}>
        <BrandLogo className="sidebar-brand-logo" variant="mark" />
        <div className="sidebar-brand-copy" aria-hidden={isCollapsed}>
          <strong>{brandConfig.sidebarSystemName}</strong>
          <span>{brandConfig.companyName}</span>
        </div>
      </div>
      <button className="sidebar-collapse-toggle" type="button" aria-label={toggleLabel} title={toggleLabel} onClick={onToggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg>
      </button>
    </div>
  )
}
