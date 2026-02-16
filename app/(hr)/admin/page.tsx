'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatsCard } from '@/components/composed/StatsCard'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import {
  Users,
  Calendar,
  FileText,
  Mail,
  Download,
  CheckCircle2,
  Clock,
  Eye,
  AlertCircle,
  Monitor,
  ArrowRight,
} from 'lucide-react'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

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
  priority: string
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
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (user) {
      Promise.all([loadDashboard(), loadPendingLeave(), loadDeviceTickets()])
        .finally(() => setLoading(false))
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/admin/dashboard')
      const data = await response.json()
      setDashboardData(data)
    } catch {
      toast.error('Failed to load dashboard')
    }
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

  const handleGenerateReports = async () => {
    if (!dashboardData?.period) return
    setGenerating(true)
    try {
      const employees = dashboardData.employees || []
      let successCount = 0
      let errorCount = 0
      for (const employee of employees) {
        try {
          await fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId: employee.id, periodId: dashboardData.period.id }),
          })
          successCount++
        } catch { errorCount++ }
      }
      if (errorCount > 0) toast.warning(`Generated ${successCount} reports, ${errorCount} failed`)
      else toast.success(`Generated ${successCount} reports`)
      loadDashboard()
    } catch { toast.error('Failed to generate reports') }
    finally { setGenerating(false) }
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Admin Dashboard
        </h1>
        {dashboardData?.period && (
          <div className="flex items-center gap-2 text-muted-foreground mt-1">
            <Calendar className="w-4 h-4" />
            <span>{dashboardData.period.name}</span>
            <span className="text-border">|</span>
            <span className="text-sm">
              {new Date(dashboardData.period.startDate).toLocaleDateString()} – {new Date(dashboardData.period.endDate).toLocaleDateString()}
            </span>
          </div>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={stagger.container} initial="hidden" animate="visible"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8"
      >
        {dashboardData?.summary && (
          <>
            <motion.div variants={stagger.item}>
              <StatsCard
                title="Team Members"
                value={dashboardData.summary.totalTeamMembers ?? dashboardData.summary.totalEmployees}
                icon={<Users className="w-5 h-5" />}
              />
            </motion.div>
            <motion.div variants={stagger.item}>
              <StatsCard
                title="Avg Completion"
                value={dashboardData.summary.averageCompletion}
                suffix="%"
                icon={<Clock className="w-5 h-5" />}
              />
            </motion.div>
            <motion.div variants={stagger.item}>
              <StatsCard
                title="Reports Ready"
                value={dashboardData.summary.employeesWithReports}
                suffix={`/${dashboardData.summary.totalTeamMembers ?? dashboardData.summary.totalEmployees}`}
                icon={<FileText className="w-5 h-5" />}
              />
            </motion.div>
          </>
        )}
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Pending Leave"
            value={pendingLeave.length}
            icon={<AlertCircle className="w-5 h-5" />}
          />
        </motion.div>
        <motion.div variants={stagger.item}>
          <StatsCard
            title="Open Tickets"
            value={openTickets.length}
            icon={<Monitor className="w-5 h-5" />}
          />
        </motion.div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="flex flex-wrap gap-3 mb-8"
      >
        <ShimmerButton onClick={handleGenerateReports} disabled={generating} className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          {generating ? 'Generating...' : 'Generate Reports'}
        </ShimmerButton>
        <Button variant="outline" asChild>
          <Link href={`/admin/reports?periodId=${dashboardData?.period?.id || ''}`} className="flex items-center gap-2">
            <Eye className="w-4 h-4" /> View Reports
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/admin/email?periodId=${dashboardData?.period?.id || ''}`} className="flex items-center gap-2">
            <Mail className="w-4 h-4" /> Email Distribution
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <a href={`/api/reports/export?periodId=${dashboardData?.period?.id || ''}`} className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Export Excel
          </a>
        </Button>
      </motion.div>

      {/* Pending Leave + Open Tickets cards */}
      {(pendingLeave.length > 0 || openTickets.length > 0) && (
        <motion.div
          variants={stagger.container} initial="hidden" animate="visible"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
        >
          {/* Pending Leave Requests */}
          {pendingLeave.length > 0 && (
            <motion.div variants={stagger.item}>
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
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
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

          {/* Open Device Tickets */}
          {openTickets.length > 0 && (
            <motion.div variants={stagger.item}>
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
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
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
        </motion.div>
      )}

      {/* Employee Progress Table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-display font-semibold text-foreground">Employee Progress</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">Employee</TableHead>
                  <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">Department</TableHead>
                  <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">Completion</TableHead>
                  <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboardData?.employees?.map((employee: any) => (
                  <TableRow key={employee.id} className="border-b transition-colors hover:bg-muted/50">
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={employee.name} size="sm" />
                        <div>
                          <div className="font-medium text-foreground">{employee.name}</div>
                          {employee.position && <div className="text-sm text-muted-foreground">{employee.position}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {employee.department || '\u2014'}
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <Progress value={employee.completionRate} className="w-24 h-1.5" />
                        <span className="text-sm font-medium text-foreground w-10">{employee.completionRate}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      {employee.reportGenerated ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          <Clock className="w-3 h-3 mr-1" /> Pending
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
