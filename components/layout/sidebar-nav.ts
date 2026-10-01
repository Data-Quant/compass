import type { NavItem, SidebarConfig } from './AppSidebar'

export function withItemAfter(config: SidebarConfig, entry: NavItem, anchorHref: string): SidebarConfig {
  if (config.items.some((item) => item.href === entry.href)) return config
  const anchor = config.items.findIndex((item) => item.href === anchorHref)
  const items =
    anchor >= 0 ? [...config.items.slice(0, anchor + 1), entry, ...config.items.slice(anchor + 1)] : [...config.items, entry]
  return { ...config, items }
}

export function withGroupItem(config: SidebarConfig, groupLabel: string, entry: NavItem): SidebarConfig {
  if (config.groups.some((group) => group.items.some((item) => item.href === entry.href))) return config
  return {
    ...config,
    groups: config.groups.map((group) => (group.label === groupLabel ? { ...group, items: [...group.items, entry] } : group)),
  }
}

/** Changes one top-level item in place (link, badge, highlight); returns the same config when it is missing. */
export function withItemPatched(config: SidebarConfig, href: string, patch: Partial<NavItem>): SidebarConfig {
  if (!config.items.some((item) => item.href === href)) return config
  return { ...config, items: config.items.map((item) => (item.href === href ? { ...item, ...patch } : item)) }
}
