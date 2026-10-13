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

/**
 * Security Checks entries: everyone gets their own tasks when the module is on;
 * Security Admins and Console Admins also get the console. On the Security
 * sidebar both slot in after Onboarding.
 */
export function withSecurityChecksNav(
  config: SidebarConfig,
  access: SecurityChecksNavAccess,
  icons: { tasks: NavItem['icon']; console: NavItem['icon'] },
): SidebarConfig {
  if (!access.enabled) return config
  const consoleEntry = { label: 'Security Console', href: '/security-checks/console', icon: icons.console }
  // HR's admin console: console link only, under Operations (employee task links stay off it).
  if (config.items.some((item) => item.href === '/admin')) {
    return access.console ? withGroupItem(config, 'Operations', consoleEntry) : config
  }
  const securitySidebar = config.items.some((item) => item.href === '/security')
  const withTasks = withItemAfter(
    config,
    { label: 'Security Checks', href: '/security-checks', icon: icons.tasks },
    securitySidebar ? '/security/onboarding' : '/my-tasks',
  )
  if (!access.console) return withTasks
  return withItemAfter(
    withTasks,
    { label: 'Security Console', href: '/security-checks/console', icon: icons.console },
    securitySidebar ? '/security/onboarding' : '/security-checks',
  )
}

export function withGroupItem(config: SidebarConfig, groupLabel: string, entry: NavItem): SidebarConfig {
  if (config.groups.some((group) => group.items.some((item) => item.href === entry.href))) return config
  return {
    ...config,
    groups: config.groups.map((group) => (group.label === groupLabel ? { ...group, items: [...group.items, entry] } : group)),
  }
}
