import type { NavItem, SidebarConfig } from './AppSidebar'

export function withItemAfter(config: SidebarConfig, entry: NavItem, anchorHref: string): SidebarConfig {
  if (config.items.some((item) => item.href === entry.href)) return config
  const anchor = config.items.findIndex((item) => item.href === anchorHref)
  const items =
    anchor >= 0 ? [...config.items.slice(0, anchor + 1), entry, ...config.items.slice(anchor + 1)] : [...config.items, entry]
  return { ...config, items }
}

export interface SecurityChecksNavAccess {
  enabled: boolean
  console: boolean
}

/** Replaces the item at `href` with `entry` in place; returns the config unchanged if `href` is absent. */
export function withItemReplaced(config: SidebarConfig, href: string, entry: NavItem): SidebarConfig {
  if (!config.items.some((item) => item.href === href)) return config
  const items = config.items.filter((item) => item.href !== entry.href).map((item) => (item.href === href ? entry : item))
  return { ...config, items }
}

/**
 * One "Security" entry (checks, console and device support live there as tabs).
 * It takes the place of Device Support (employee sidebar) or Device Tickets
 * (Security sidebar). HR's admin console gets it under Operations.
 */
export function withSecurityChecksNav(config: SidebarConfig, access: SecurityChecksNavAccess, icon: NavItem['icon']): SidebarConfig {
  if (!access.enabled) return config
  const entry: NavItem = { label: 'Security', href: '/security-checks', icon }
  if (config.items.some((item) => item.href === '/admin')) {
    return access.console ? withGroupItem(config, 'Operations', entry) : config
  }
  for (const moved of ['/device-support', '/security/device-tickets']) {
    if (config.items.some((item) => item.href === moved)) return withItemReplaced(config, moved, entry)
  }
  return withItemAfter(config, entry, '/my-tasks')
}

export function withGroupItem(config: SidebarConfig, groupLabel: string, entry: NavItem): SidebarConfig {
  if (config.groups.some((group) => group.items.some((item) => item.href === entry.href))) return config
  return {
    ...config,
    groups: config.groups.map((group) => (group.label === groupLabel ? { ...group, items: [...group.items, entry] } : group)),
  }
}
