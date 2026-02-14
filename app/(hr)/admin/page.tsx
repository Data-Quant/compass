'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { AppNavbar } from '@/components/layout/AppNavbar'
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
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { HoverEffect } from '@/components/aceternity/card-hover-effect'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import {
  Users,
  Calendar,
  HelpCircle,
  Link2,
  Sliders,
  BarChart3,
  FileText,
  Mail,
  Download,
  CheckCircle2,
  Clock,
  Eye,
  CalendarDays,
  Monitor,
  Wallet,
} from 'lucide-react'
import { COMPANY_NAME } from '@/lib/config'

const adminTools = [
  {
    title: 'Users',
    description: 'Manage users and permissions',
    link: '/admin/users',
    icon: <Users className="w-5 h-5" />,
  },
  {
    title: 'Periods',
    description: 'Configure evaluation periods',
    link: '/admin/periods',
    icon: <Calendar className="w-5 h-5" />,
  },
  {
    title: 'Questions',
    description: 'Manage evaluation questions',
    link: '/admin/questions',
    icon: <HelpCircle className="w-5 h-5" />,
  },
  {
    title: 'Mappings',
    description: 'Manage evaluator mappings',
    link: '/admin/mappings',
    icon: <Link2 className="w-5 h-5" />,
  },
  {
    title: 'Weightages',
    description: 'Configure weight settings',
    link: '/admin/settings',
    icon: <Sliders className="w-5 h-5" />,
  },
  {
    title: 'Analytics',
    description: 'View analytics and insights',
    link: '/admin/analytics',
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    title: 'Leave',
    description: 'Manage leave requests',
    link: '/admin/leave',
    icon: <CalendarDays className="w-5 h-5" />,
  },
  {
    title: 'Device Support',
    description: 'Handle device support tickets',
    link: '/admin/device-tickets',
    icon: <Monitor className="w-5 h-5" />,
  },
  {
    title: 'Payroll Automation',
    description: 'Manage payroll periods, calculations, and receipts',
    link: '/admin/payroll',
    icon: <Wallet className="w-5 h-5" />,
  },
]

export default function AdminDashboardPage() {
  const router = useRouter()
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user || (data.user.role !== 'HR' && data.user.role !== 'OA')) {
          router.push('/login')
          return
        }
        setUser(data.user)
        loadDashboard()
      })
      .catch(() => router.push('/login'))
  }, [])

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/admin/dashboard')
      const data = await response.json()
      setDashboardData(data)
    } catch (error) {
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
            body: JSON.stringify({
              employeeId: employee.id,
              periodId: dashboardData.period.id,
            }),
          })
          successCount++
        } catch (error) {
          errorCount++
        }
      }

      if (errorCount > 0) {
        toast.warning(`Generated ${successCount} reports, ${errorCount} failed`)
      } else {
        toast.success(`Successfully generated ${successCount} reports`)
      }
      loadDashboard()
    } catch (error) {
      toast.error('Failed to generate reports')
    } finally {
      setGenerating(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (loading) {
    return (
      <LoadingScreen message="Loading admin dashboard..." />
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar
        user={user}
        onLogout={handleLogout}
        badge="Admin"
        navLinks={[
          {
            href: '/dashboard',
            label: 'Employee View',
            icon: <Eye className="w-4 h-4" />,
            variant: 'default' as const,
          },
        ]}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-display font-light tracking-tight text-foreground mb-2">
            Admin Dashboard
          </h1>
          {dashboardData?.period && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{dashboardData.period.name}</span>
              <span className="text-border">•</span>
              <span className="text-sm">
                {new Date(dashboardData.period.startDate).toLocaleDateString()} – {new Date(dashboardData.period.endDate).toLocaleDateString()}
              </span>
            </div>
          )}
        </motion.div>

        {/* Stats */}
        {dashboardData?.summary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
          >
            <StatsCard
              title="Team Members"
              value={dashboardData.summary.totalTeamMembers ?? dashboardData.summary.totalEmployees}
              icon={<Users className="w-5 h-5" />}
            />
            <StatsCard
              title="Avg Completion"
              value={dashboardData.summary.averageCompletion}
              suffix="%"
              icon={<Clock className="w-5 h-5" />}
            />
            <StatsCard
              title="Reports Ready"
              value={dashboardData.summary.employeesWithReports}
              suffix={`/${dashboardData.summary.totalTeamMembers ?? dashboardData.summary.totalEmployees}`}
              icon={<FileText className="w-5 h-5" />}
            />
          </motion.div>
        )}

        {/* Admin Tools */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="text-lg font-display font-semibold text-foreground mb-4">Admin Tools</h2>
          <HoverEffect items={adminTools} />
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap gap-3 mb-8"
        >
          <ShimmerButton
            onClick={handleGenerateReports}
            disabled={generating}
            className="flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            {generating ? 'Generating...' : 'Generate Reports'}
          </ShimmerButton>
          <Button variant="outline" asChild>
            <Link
              href={`/admin/reports?periodId=${dashboardData?.period?.id || ''}`}
              className="flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              View Reports
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/admin/email?periodId=${dashboardData?.period?.id || ''}`}
              className="flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Email Distribution
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`/api/reports/export?periodId=${dashboardData?.period?.id || ''}`}
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </a>
          </Button>
        </motion.div>

        {/* Employees Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
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
                  {dashboardData?.employees?.map((employee: any, index: number) => (
                    <TableRow
                      key={employee.id}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={employee.name} size="sm" />
                          <div>
                            <div className="font-medium text-foreground">{employee.name}</div>
                            {employee.position && (
                              <div className="text-sm text-muted-foreground">{employee.position}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {employee.department || '—'}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Progress
                            value={employee.completionRate}
                            className="w-24 h-1.5"
                          />
                          <span className="text-sm font-medium text-foreground w-10">{employee.completionRate}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap">
                        {employee.reportGenerated ? (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Ready
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
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

        {/* Footer signature */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-16 flex items-center justify-center gap-2 text-xs text-muted-foreground/50"
        >
          <span>Powered by {COMPANY_NAME}</span>
        </motion.div>
      </main>
    </div>
  )
}

