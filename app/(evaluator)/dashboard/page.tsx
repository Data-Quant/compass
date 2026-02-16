'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RELATIONSHIP_TYPE_LABELS } from '@/types'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { StatsCard } from '@/components/composed/StatsCard'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { EmptyState } from '@/components/composed/EmptyState'
import {
  ClipboardCheck,
  Calendar,
  FolderKanban,
  Monitor,
  ArrowRight,
  CheckCircle2,
  Clock,
  Target,
  Sun,
  Thermometer,
  Palmtree,
  AlertCircle,
  Shield,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Mapping {
  id: string
  evaluatee: { id: string; name: string; department: string | null; position: string | null }
  relationshipType: string
  questionsCount: number
  completedCount: number
  isComplete: boolean
}

interface LeaveBalance {
  casualDays: number; casualUsed: number
  sickDays: number; sickUsed: number
  annualDays: number; annualUsed: number
}

interface ProjectSummary {
  id: string; name: string; taskCount: number; completedTasks: number
}

interface LeaveRequest {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  status: string
  reason: string
  employee: { id: string; name: string; department: string | null }
}

interface DeviceTicket {
  id: string
  title: string
  status: string
  priority: string
  createdAt: string
  employee: { id: string; name: string; department: string | null }
}

// ─── Animation helpers ───────────────────────────────────────────────────────

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

const LEAVE_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  LEAD_APPROVED: { label: 'Lead Approved', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  HR_APPROVED: { label: 'HR Approved', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  REJECTED: { label: 'Rejected', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
}

const TICKET_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  UNDER_REVIEW: { label: 'Under Review', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  SOLUTION: { label: 'Solution', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  RESOLVED: { label: 'Resolved', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
}

// ─── Dashboard Page ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useLayoutUser()
  const [mappings, setMappings] = useState<Record<string, Mapping[]>>({})
  const [period, setPeriod] = useState<any>(null)
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [pendingLeave, setPendingLeave] = useState<LeaveRequest[]>([])
  const [openTickets, setOpenTickets] = useState<DeviceTicket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const tasks: Promise<void>[] = [
      loadEvaluations(),
      loadLeaveBalance(),
      loadProjects(),
    ]
    // Role-specific data
    if (user.role === 'HR' || user.role === 'SECURITY') {
      tasks.push(loadDeviceTickets())
    }
    if (user.role === 'HR') {
      tasks.push(loadPendingLeave())
    }
    // Team leads (any role) may have leave requests to review
    if (user.role !== 'HR') {
      tasks.push(loadPendingLeave())
    }
    Promise.all(tasks).finally(() => setLoading(false))
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadEvaluations = async () => {
    try {
      const res = await fetch('/api/evaluations/dashboard?periodId=active')
      const data = await res.json()
      if (data.mappings) { setMappings(data.mappings); setPeriod(data.period) }
    } catch { /* silent */ }
  }

  const loadLeaveBalance = async () => {
    try {
      const res = await fetch('/api/leave/balance')
      const data = await res.json()
      if (data.balance) setLeaveBalance(data.balance)
    } catch { /* silent */ }
  }

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (data.projects) setProjects(data.projects.slice(0, 3))
    } catch { /* silent */ }
  }

  const loadPendingLeave = async () => {
    try {
      const res = await fetch('/api/leave/requests?forApproval=true')
      const data = await res.json()
      if (data.requests) setPendingLeave(data.requests)
    } catch { /* silent */ }
  }

  const loadDeviceTickets = async () => {
    try {
      const res = await fetch('/api/device-tickets')
      const data = await res.json()
      if (data.tickets) {
        setOpenTickets(data.tickets.filter((t: DeviceTicket) => t.status === 'OPEN' || t.status === 'UNDER_REVIEW'))
      }
    } catch { /* silent */ }
  }

  // ─── Computed stats ──────────────────────────────────────────────────────

  const allMappings = Object.values(mappings).flat()
  const totalEvaluations = allMappings.length
  const completedEvaluations = allMappings.filter(m => m.isComplete).length
  const evaluationPercent = totalEvaluations > 0
    ? Math.round((completedEvaluations / totalEvaluations) * 100)
    : 0

  const totalLeaveRemaining = leaveBalance
    ? (leaveBalance.casualDays - leaveBalance.casualUsed)
      + (leaveBalance.sickDays - leaveBalance.sickUsed)
      + (leaveBalance.annualDays - leaveBalance.annualUsed)
    : 0

  const activeProjects = projects.length

  const isHR = user?.role === 'HR'
  const isSecurity = user?.role === 'SECURITY'
  const leaveManageHref = isHR ? '/admin/leave' : '/leave'
  const ticketManageHref = isSecurity ? '/security/device-tickets' : '/admin/device-tickets'

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      {/* Welcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Welcome back, <span className="gradient-text">{user?.name?.split(' ')[0] || 'there'}</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          {period ? `${period.name} evaluation period` : 'Here\u2019s your overview'}
        </p>
      </motion.div>

      {/* Quick stats */}
      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Evaluations"
            value={completedEvaluations}
            suffix={`/${totalEvaluations}`}
            icon={<ClipboardCheck className="w-5 h-5" />}
          />
        </motion.div>
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Leave Remaining"
            value={totalLeaveRemaining}
            suffix=" days"
            icon={<Calendar className="w-5 h-5" />}
          />
        </motion.div>
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Active Projects"
            value={activeProjects}
            icon={<FolderKanban className="w-5 h-5" />}
          />
        </motion.div>
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Completion"
            value={evaluationPercent}
            suffix="%"
            icon={<Target className="w-5 h-5" />}
          />
        </motion.div>
      </motion.div>

      {/* Section cards */}
      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* ── Pending Leave Requests (for team leads / HR) ───────────────── */}
        {pendingLeave.length > 0 && (
          <motion.div variants={stagger.item}>
            <Card className="h-full border-amber-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    <h2 className="text-lg font-semibold text-foreground">Leave Requests</h2>
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      {pendingLeave.length}
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={leaveManageHref} className="gap-1.5">
                      Review <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {pendingLeave.slice(0, 5).map((req) => {
                    const badge = LEAVE_STATUS_BADGE[req.status] || LEAVE_STATUS_BADGE.PENDING
                    return (
                      <Link
                        key={req.id}
                        href={leaveManageHref}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={req.employee.name} size="xs" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{req.employee.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {req.leaveType} &middot; {new Date(req.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              {' \u2013 '}
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

                {pendingLeave.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    +{pendingLeave.length - 5} more requests
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Open Device Tickets (for HR / Security) ────────────────────── */}
        {(isHR || isSecurity) && openTickets.length > 0 && (
          <motion.div variants={stagger.item}>
            <Card className="h-full border-sky-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-sky-500" />
                    <h2 className="text-lg font-semibold text-foreground">Open Tickets</h2>
                    <Badge variant="secondary" className="bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      {openTickets.length}
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={ticketManageHref} className="gap-1.5">
                      Manage <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {openTickets.slice(0, 5).map((ticket) => {
                    const badge = TICKET_STATUS_BADGE[ticket.status] || TICKET_STATUS_BADGE.OPEN
                    return (
                      <Link
                        key={ticket.id}
                        href={ticketManageHref}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={ticket.employee.name} size="xs" />
                          <div>
                            <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{ticket.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {ticket.employee.name} &middot; {new Date(ticket.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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

                {openTickets.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    +{openTickets.length - 5} more tickets
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Evaluations Card ─────────────────────────────────────────── */}
        <motion.div variants={stagger.item} id="evaluations">
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Performance Evaluations</h2>
                </div>
                <Badge variant="secondary">{period?.name || 'No period'}</Badge>
              </div>

              {totalEvaluations === 0 ? (
                <p className="text-sm text-muted-foreground">No evaluations assigned yet.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Progress value={evaluationPercent} className="flex-1 h-2" />
                    <span className="text-sm font-medium text-foreground w-12 text-right">
                      {evaluationPercent}%
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {allMappings.slice(0, 6).map((m) => (
                      <Link
                        key={m.id}
                        href={`/evaluate/${m.evaluatee.id}`}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors group"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={m.evaluatee.name} size="xs" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{m.evaluatee.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {RELATIONSHIP_TYPE_LABELS[m.relationshipType as keyof typeof RELATIONSHIP_TYPE_LABELS] || m.relationshipType}
                            </p>
                          </div>
                        </div>
                        {m.isComplete ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                        )}
                      </Link>
                    ))}
                  </div>

                  {totalEvaluations > 6 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{totalEvaluations - 6} more evaluations
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Leave Card ───────────────────────────────────────────────── */}
        <motion.div variants={stagger.item}>
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-500" />
                  <h2 className="text-lg font-semibold text-foreground">Leave Balance</h2>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/leave" className="gap-1.5">
                    Manage <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              {leaveBalance ? (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Casual', total: leaveBalance.casualDays, used: leaveBalance.casualUsed, icon: Sun, color: 'text-amber-500' },
                    { label: 'Sick', total: leaveBalance.sickDays, used: leaveBalance.sickUsed, icon: Thermometer, color: 'text-red-500' },
                    { label: 'Annual', total: leaveBalance.annualDays, used: leaveBalance.annualUsed, icon: Palmtree, color: 'text-emerald-500' },
                  ].map((item) => (
                    <div key={item.label} className="text-center p-3 rounded-lg bg-muted/50">
                      <item.icon className={`h-5 w-5 mx-auto mb-1.5 ${item.color}`} />
                      <p className="text-xl font-semibold text-foreground">{item.total - item.used}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground/60">{item.used}/{item.total} used</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No leave balance data.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Projects Card ────────────────────────────────────────────── */}
        <motion.div variants={stagger.item}>
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-violet-500" />
                  <h2 className="text-lg font-semibold text-foreground">Projects</h2>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/projects" className="gap-1.5">
                    View All <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              {projects.length === 0 ? (
                <EmptyState
                  icon={<FolderKanban className="h-10 w-10" />}
                  title="No projects yet"
                  description="Projects will appear here once created."
                />
              ) : (
                <div className="space-y-3">
                  {projects.map((p) => {
                    const pct = p.taskCount > 0 ? Math.round((p.completedTasks / p.taskCount) * 100) : 0
                    return (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="block p-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-foreground">{p.name}</p>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.completedTasks}/{p.taskCount} tasks
                        </p>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Device Support Card ──────────────────────────────────────── */}
        <motion.div variants={stagger.item}>
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-sky-500" />
                  <h2 className="text-lg font-semibold text-foreground">Device Support</h2>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/device-support" className="gap-1.5">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                Submit and track device support tickets for hardware, software, or access issues.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}
