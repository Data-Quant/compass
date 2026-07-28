/**
 * Dependency-free source of truth for links in the admin Insights sidebar.
 * Presentation concerns such as icons stay in AppSidebar.
 */
export const ADMIN_INSIGHTS_NAV_ITEMS = [
  { label: 'Analytics', href: '/admin/analytics' },
  { label: 'Employee 360', href: '/admin/employee-360' },
] as const

export type AdminInsightsHref = (typeof ADMIN_INSIGHTS_NAV_ITEMS)[number]['href']
