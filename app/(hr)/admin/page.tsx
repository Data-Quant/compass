'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { StatsCard } from '@/components/composed/StatsCard'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  ClipboardList,
  FileText,
  Monitor,
  PackageSearch,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'

interface LeaveRequest {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  status: string
  employee: { id: string; name: string; department: string | null }
}

interface DeviceTicket {
  id: string
  title: string
  status: string
  createdAt: string
  employee: { id: string; name: string; department: string | null }
}

const LEAVE_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  LEAD_APPROVED: { label: 'Lead Approved', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
}

const TICKET_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  UNDER_REVIEW: { label: 'Under Review', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
}

export default function AdminDashboardPage() {
  const user = useLayoutUser()
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [pendingLeave, setPendingLeave] = useState<LeaveRequest[]>([])
  const [openTickets, setOpenTickets] = useState<DeviceTicket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      Promise.all([loadDashboard(), loadPendingLeave(), loadDeviceTickets()]).finally(() =>
        setLoading(false)
      )
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/admin/dashboard')
      const data = await response.json()
      setDashboardData(data)
    } catch {
      toast.error('Failed to load admin dashboard')
    }
  }

  const loadPendingLeave = async () => {
    try {
      const res = await fetch('/api/leave/requests?forApproval=true')
      const data = await res.json()
      if (data.requests) setPendingLeave(data.requests)
    } catch {
      // silent
    }
  }

  const loadDeviceTickets = async () => {
    try {
      const res = await fetch('/api/device-tickets')
      const data = await res.json()
      if (data.tickets) {
        setOpenTickets(
          data.tickets.filter(
            (ticket: DeviceTicket) => ticket.status === 'OPEN' || ticket.status === 'UNDER_REVIEW'
          )
        )
      }
    } catch {
      // silent
    }
  }

  const shortcuts = useMemo(
    () => [
      {
        title: 'People',
        description: 'Manage users, org mappings, and structure.',
        href: '/admin/users',
        icon: Users,
        badge: dashboardData?.summary?.totalTeamMembers
          ? `${dashboardData.summary.totalTeamMembers} team members`
          : null,
      },
      {
        title: 'Performance Overview',
        description: 'Review evaluation progress, reports, and pre-evaluation status.',
        href: '/admin/performance',
        icon: ClipboardList,
        badge: dashboardData?.period?.name || null,
      },
      {
        title: 'Leave',
        description: 'Handle leave approvals and check balances.',
        href: '/admin/leave',
        icon: Calendar,
        badge: pendingLeave.length > 0 ? `${pendingLeave.length} pending` : 'No pending requests',
      },
      {
        title: 'Device Support',
        description: 'Review tickets, assets, and support workload.',
        href: '/admin/device-tickets',
        icon: Monitor,
        badge: openTickets.length > 0 ? `${openTickets.length} open tickets` : 'No open tickets',
      },
      {
        title: 'Subscriptions',
        description: 'Track software ownership, renewals, and cancellations.',
        href: '/admin/subscriptions',
        icon: Wallet,
        badge: 'Execution + HR',
      },
      {
        title: 'Onboarding',
        description: 'Manage positions, new hires, and onboarding content.',
        href: '/admin/onboarding',
        icon: UserPlus,
        badge: 'Hiring workflows',
      },
      {
        title: 'Assets',
        description: 'Review issued equipment and inventory records.',
        href: '/admin/assets',
        icon: PackageSearch,
        badge: null,
      },
      {
        title: 'Reports',
        description: 'Open generated reports and distribution tools.',
        href: '/admin/reports',
        icon: FileText,
        badge: dashboardData?.summary?.employeesWithReports
          ? `${dashboardData.summary.employeesWithReports} ready`
          : 'No reports yet',
      },
    ],
    [dashboardData, openTickets.length, pendingLeave.length]
  )

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading admin hub..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Central hub for people operations, support workload, subscriptions, and performance management.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <StatsCard
          title="Team Members"
          value={dashboardData?.summary?.totalTeamMembers ?? dashboardData?.summary?.totalEmployees ?? 0}
          icon={<Users className="w-5 h-5" />}
        />
        <StatsCard
          title="Pending Leave"
          value={pendingLeave.length}
          icon={<AlertCircle className="w-5 h-5" />}
        />
        <StatsCard
          title="Open Tickets"
          value={openTickets.length}
          icon={<Monitor className="w-5 h-5" />}
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg font-display font-semibold text-foreground">Admin Workspaces</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Jump straight into the part of the admin console you need.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {shortcuts.map((shortcut) => {
                const Icon = shortcut.icon

                return (
                  <Link key={shortcut.href} href={shortcut.href} className="group">
                    <div className="rounded-xl border bg-muted/10 p-5 h-full transition-colors hover:bg-muted/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="rounded-full bg-primary/10 p-2.5">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="mt-4">
                        <p className="font-medium text-foreground">{shortcut.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{shortcut.description}</p>
                      </div>
                      {shortcut.badge && (
                        <Badge variant="secondary" className="mt-4">
                          {shortcut.badge}
                        </Badge>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {(pendingLeave.length > 0 || openTickets.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <Card className="h-full border-amber-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <h2 className="text-lg font-semibold text-foreground">Pending Leave Requests</h2>
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    {pendingLeave.length}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/leave" className="gap-1.5">
                    View All <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
              {pendingLeave.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leave requests need review right now.</p>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                  {pendingLeave.slice(0, 5).map((req) => {
                    const badge = LEAVE_STATUS_BADGE[req.status] || LEAVE_STATUS_BADGE.PENDING
                    return (
                      <Link
                        key={req.id}
                        href="/admin/leave"
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={req.employee.name} size="xs" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{req.employee.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {req.leaveType} · {new Date(req.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              {' - '}
                              {new Date(req.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-full border-sky-500/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-sky-500" />
                  <h2 className="text-lg font-semibold text-foreground">Open Device Tickets</h2>
                  <Badge variant="secondary" className="bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    {openTickets.length}
                  </Badge>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/device-tickets" className="gap-1.5">
                    View All <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
              {openTickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No device tickets are open right now.</p>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                  {openTickets.slice(0, 5).map((ticket) => {
                    const badge = TICKET_STATUS_BADGE[ticket.status] || TICKET_STATUS_BADGE.OPEN
                    return (
                      <Link
                        key={ticket.id}
                        href="/admin/device-tickets"
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={ticket.employee.name} size="xs" />
                          <div>
                            <p className="text-sm font-medium text-foreground truncate max-w-[220px]">
                              {ticket.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {ticket.employee.name} · {new Date(ticket.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
