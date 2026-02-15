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
} from 'lucide-react'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

export default function AdminDashboardPage() {
  const user = useLayoutUser()
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (user) loadDashboard()
  }, [user])

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/admin/dashboard')
      const data = await response.json()
      setDashboardData(data)
    } catch {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
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
      {dashboardData?.summary && (
        <motion.div
          variants={stagger.container} initial="hidden" animate="visible"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
        >
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
        </motion.div>
      )}

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
