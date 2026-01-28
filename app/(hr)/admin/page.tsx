'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
  Compass,
  LogOut,
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
  ArrowUpRight,
  Eye,
  CalendarDays
} from 'lucide-react'
import { PLATFORM_NAME, COMPANY_NAME, LOGO } from '@/lib/config'

const adminTools = [
  { href: '/admin/users', icon: Users, label: 'Users', color: 'from-blue-500 to-cyan-500' },
  { href: '/admin/periods', icon: Calendar, label: 'Periods', color: 'from-green-500 to-emerald-500' },
  { href: '/admin/questions', icon: HelpCircle, label: 'Questions', color: 'from-purple-500 to-pink-500' },
  { href: '/admin/mappings', icon: Link2, label: 'Mappings', color: 'from-amber-500 to-orange-500' },
  { href: '/admin/settings', icon: Sliders, label: 'Weightages', color: 'from-rose-500 to-red-500' },
  { href: '/admin/analytics', icon: BarChart3, label: 'Analytics', color: 'from-indigo-500 to-violet-500' },
  { href: '/admin/leave', icon: CalendarDays, label: 'Leave', color: 'from-teal-500 to-emerald-500' },
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
        if (!data.user || data.user.role !== 'HR') {
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
          <p className="text-muted text-sm">Loading admin dashboard...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <img src={LOGO.company} alt={COMPANY_NAME} className="h-8 w-auto" />
              <div className="h-6 w-px bg-border hidden sm:block" />
              <div className="hidden sm:flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-lg font-semibold text-foreground">{PLATFORM_NAME}</span>
              </div>
              <span className="px-2 py-0.5 text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-md font-medium">
                Admin
              </span>
            </motion.div>
            
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-sm text-muted hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Employee View</span>
              </Link>
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="p-2 text-muted hover:text-foreground transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Admin Dashboard
          </h1>
          {dashboardData?.period && (
            <div className="flex items-center gap-2 text-muted">
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
            <div className="glass rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-sm text-muted">Total Employees</span>
              </div>
              <div className="text-3xl font-bold text-foreground">{dashboardData.summary.totalEmployees}</div>
            </div>
            <div className="glass rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-sm text-muted">Avg Completion</span>
              </div>
              <div className="text-3xl font-bold text-foreground">{dashboardData.summary.averageCompletion}%</div>
            </div>
            <div className="glass rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-sm text-muted">Reports Ready</span>
              </div>
              <div className="text-3xl font-bold text-foreground">
                {dashboardData.summary.employeesWithReports}
                <span className="text-lg font-normal text-muted">/{dashboardData.summary.totalEmployees}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Admin Tools */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-6 border border-border mb-8"
        >
          <h2 className="text-lg font-semibold text-foreground mb-4">Admin Tools</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {adminTools.map((tool, index) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group flex flex-col items-center p-4 rounded-xl bg-surface hover:bg-surface-hover border border-transparent hover:border-indigo-500/20 transition-all duration-200"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  <tool.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-foreground">{tool.label}</span>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap gap-3 mb-8"
        >
          <button
            onClick={handleGenerateReports}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white font-medium hover:opacity-90 disabled:opacity-50 transition-all"
          >
            <FileText className="w-4 h-4" />
            {generating ? 'Generating...' : 'Generate Reports'}
          </button>
          <Link
            href={`/admin/reports?periodId=${dashboardData?.period?.id || ''}`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-border text-foreground font-medium hover:bg-surface-hover hover:border-indigo-500/30 transition-all"
          >
            <Eye className="w-4 h-4" />
            View Reports
          </Link>
          <Link
            href={`/admin/email?periodId=${dashboardData?.period?.id || ''}`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-border text-foreground font-medium hover:bg-surface-hover hover:border-indigo-500/30 transition-all"
          >
            <Mail className="w-4 h-4" />
            Email Distribution
          </Link>
          <a
            href={`/api/reports/export?periodId=${dashboardData?.period?.id || ''}`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-border text-foreground font-medium hover:bg-surface-hover hover:border-indigo-500/30 transition-all"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </a>
        </motion.div>

        {/* Employees Table */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-2xl border border-border overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Employee Progress</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Department</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Completion</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dashboardData?.employees?.map((employee: any, index: number) => (
                  <motion.tr 
                    key={employee.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 + index * 0.02 }}
                    className="hover:bg-surface/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                          {employee.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{employee.name}</div>
                          {employee.position && (
                            <div className="text-sm text-muted">{employee.position}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                      {employee.department || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 bg-surface rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              employee.completionRate === 100 ? 'bg-green-500' : 'gradient-primary'
                            }`}
                            style={{ width: `${employee.completionRate}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-foreground w-10">{employee.completionRate}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {employee.reportGenerated ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 text-xs rounded-md font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface text-muted text-xs rounded-md font-medium">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Footer signature */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-16 flex items-center justify-center gap-2 text-xs text-muted/50"
        >
          <span>Powered by {COMPANY_NAME}</span>
        </motion.div>
      </main>
    </div>
  )
}
