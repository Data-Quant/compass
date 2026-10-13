import type { NavItem, SidebarConfig } from './AppSidebar'

export function withGroupItem(config: SidebarConfig, groupLabel: string, entry: NavItem, position: 'start' | 'end' = 'end'): SidebarConfig {
  if (config.groups.some((group) => group.items.some((item) => item.href === entry.href))) return config
  return {
    ...config,
    groups: config.groups.map((group) => (group.label === groupLabel ? { ...group, items: position === 'start' ? [entry, ...group.items] : [...group.items, entry] } : group)),
  }
}

/** Changes one top-level item in place (link, badge, highlight); returns the same config when it is missing. */
export function withItemPatched(config: SidebarConfig, href: string, patch: Partial<NavItem>): SidebarConfig {
  if (!config.items.some((item) => item.href === href)) return config
  return { ...config, items: config.items.map((item) => (item.href === href ? { ...item, ...patch } : item)) }
}
