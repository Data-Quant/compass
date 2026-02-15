'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Plutus21Logo } from '@/components/brand/Plutus21Logo'
import { PLATFORM_NAME } from '@/lib/config'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Home,
  ClipboardCheck,
  Calendar,
  FolderKanban,
  Monitor,
  User,
  Users,
  Network,
  CalendarDays,
  HelpCircle,
  Link2,
  Sliders,
  BarChart3,
  FileText,
  Mail,
  Wallet,
  Settings,
  Shield,
  Eye,
  CheckSquare,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string | number
}

export interface NavGroup {
  label: string
  items: NavItem[]
  defaultOpen?: boolean
}

export type SidebarConfig = {
  items: NavItem[]
  groups: NavGroup[]
}

// ─── Employee sidebar config ─────────────────────────────────────────────────

export const EMPLOYEE_SIDEBAR: SidebarConfig = {
  items: [
    { label: 'Home', href: '/dashboard', icon: Home },
    { label: 'My Tasks', href: '/my-tasks', icon: CheckSquare },
    { label: 'Evaluations', href: '/evaluations', icon: ClipboardCheck },
    { label: 'Leave', href: '/leave', icon: Calendar },
    { label: 'Projects', href: '/projects', icon: FolderKanban },
    { label: 'Device Support', href: '/device-support', icon: Monitor },
    { label: 'Profile', href: '/profile', icon: User },
  ],
  groups: [],
}

// ─── Admin sidebar config ────────────────────────────────────────────────────

export const ADMIN_SIDEBAR: SidebarConfig = {
  items: [
    { label: 'Dashboard', href: '/admin', icon: Home },
  ],
  groups: [
    {
      label: 'People',
      defaultOpen: true,
      items: [
        { label: 'Users', href: '/admin/users', icon: Users },
        { label: 'Org Chart', href: '/admin/org-chart', icon: Network },
      ],
    },
    {
      label: 'Performance',
      defaultOpen: true,
      items: [
        { label: 'Periods', href: '/admin/periods', icon: CalendarDays },
        { label: 'Questions', href: '/admin/questions', icon: HelpCircle },
        { label: 'Mappings', href: '/admin/mappings', icon: Link2 },
        { label: 'Weightages', href: '/admin/settings', icon: Sliders },
        { label: 'Reports', href: '/admin/reports', icon: FileText },
        { label: 'Email', href: '/admin/email', icon: Mail },
      ],
    },
    {
      label: 'Operations',
      defaultOpen: false,
      items: [
        { label: 'Leave', href: '/admin/leave', icon: Calendar },
        { label: 'Device Tickets', href: '/admin/device-tickets', icon: Monitor },
        { label: 'Payroll', href: '/admin/payroll', icon: Wallet },
      ],
    },
    {
      label: 'Insights',
      defaultOpen: false,
      items: [
        { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
      ],
    },
  ],
}

// ─── NavItem Component ───────────────────────────────────────────────────────

function SidebarNavItem({
  item,
  collapsed,
  pathname,
}: {
  item: NavItem
  collapsed: boolean
  pathname: string
}) {
  const isActive =
    item.href === '/admin'
      ? pathname === '/admin'
      : item.href === '/dashboard'
        ? pathname === '/dashboard'
        : pathname.startsWith(item.href)

  const Icon = item.icon

  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
        collapsed && 'justify-center px-2',
        isActive
          ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-primary')} />
      {!collapsed && (
        <span className="truncate">{item.label}</span>
      )}
      {!collapsed && item.badge != null && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
          {item.badge}
        </span>
      )}
    </Link>
  )
}

// ─── NavGroup Component ──────────────────────────────────────────────────────

function SidebarNavGroup({
  group,
  collapsed,
  pathname,
}: {
  group: NavGroup
  collapsed: boolean
  pathname: string
}) {
  const [open, setOpen] = useState(group.defaultOpen ?? false)

  // Auto-open if any child is active
  const anyActive = group.items.some(i => pathname.startsWith(i.href))
  const isOpen = collapsed ? false : open || anyActive

  return (
    <div>
      {!collapsed && (
        <button
          onClick={() => setOpen(!isOpen)}
          className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <span>{group.label}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      )}
      {collapsed && (
        <div className="mx-auto my-1 h-px w-6 bg-border" />
      )}
      <AnimatePresence initial={false}>
        {(isOpen || collapsed) && (
          <motion.div
            initial={collapsed ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 py-0.5">
              {group.items.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Sidebar ────────────────────────────────────────────────────────────

interface AppSidebarProps {
  config: SidebarConfig
  collapsed: boolean
  onToggle: () => void
  userRole?: string
  className?: string
}

export function AppSidebar({ config, collapsed, onToggle, userRole, className }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-card transition-all duration-200 ease-in-out',
        collapsed ? 'w-[60px]' : 'w-[240px]',
        className
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex h-14 shrink-0 items-center border-b border-border px-3',
        collapsed ? 'justify-center' : 'gap-3'
      )}>
        <Plutus21Logo size={22} className="text-foreground shrink-0" />
        {!collapsed && (
          <span className="text-base font-display tracking-tight text-foreground">
            {PLATFORM_NAME}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Top-level items */}
        {config.items.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            collapsed={collapsed}
            pathname={pathname}
          />
        ))}

        {/* Grouped items */}
        {config.groups.map((group) => (
          <SidebarNavGroup
            key={group.label}
            group={group}
            collapsed={collapsed}
            pathname={pathname}
          />
        ))}
      </nav>

      {/* Footer: role switcher + collapse toggle */}
      <div className="shrink-0 border-t border-border p-2 space-y-1">
        {/* Employee ↔ Admin switcher */}
        {userRole === 'HR' && (
          <Link
            href={pathname.startsWith('/admin') ? '/dashboard' : '/admin'}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={collapsed ? (pathname.startsWith('/admin') ? 'Employee View' : 'Admin') : undefined}
          >
            {pathname.startsWith('/admin') ? (
              <>
                <Eye className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>Employee View</span>}
              </>
            ) : (
              <>
                <Shield className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>Admin Console</span>}
              </>
            )}
          </Link>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-[18px] w-[18px] shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
