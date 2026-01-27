'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { Users, CheckCircle, FileText, TrendingUp, Trophy, AlertCircle } from 'lucide-react'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']

interface Analytics {
  period: { id: string; name: string; startDate: string; endDate: string }
  summary: {
    totalEmployees: number
    employeesWithEvaluations: number
    totalEvaluations: number
    totalReports: number
    avgOverallScore: number
    completionRate: number
  }
  departmentData: Array<{ name: string; employees: number; completed: number; completionRate: number; avgScore: number }>
  scoreDistribution: Array<{ range: string; count: number }>
  relationshipData: Array<{ type: string; count: number }>
  topPerformers: Array<{ name: string; department: string | null; score: number }>
  bottomPerformers: Array<{ name: string; department: string | null; score: number }>
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (!data.user || data.user.role !== 'HR') {
        router.push('/login')
        return
      }
      loadAnalytics()
    } catch (error) {
      router.push('/login')
    }
  }

  const loadAnalytics = async () => {
    try {
      const res = await fetch('/api/admin/analytics')
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        setAnalytics(data)
      }
    } catch (error) {
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  const relationshipLabels: Record<string, string> = {
    C_LEVEL: 'C-Level',
    TEAM_LEAD: 'Team Lead',
    DIRECT_REPORT: 'Direct Report',
    PEER: 'Peer',
    HR: 'HR',
    SELF: 'Self',
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="min-h-screen flex items-center justify-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
            <p className="text-muted text-sm">Loading analytics...</p>
          </motion.div>
        </div>
      </PageContainer>
    )
  }

  if (!analytics) {
    return (
      <PageContainer>
        <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Analytics" />
        <PageContent>
          <div className="glass rounded-xl p-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-muted">No analytics data available.</p>
          </div>
        </PageContent>
      </PageContainer>
    )
  }

  const statCards = [
    { label: 'Employees', value: analytics.summary.totalEmployees, icon: Users, color: 'text-indigo-600 dark:text-indigo-400' },
    { label: 'Evaluated', value: analytics.summary.employeesWithEvaluations, icon: CheckCircle, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Evaluations', value: analytics.summary.totalEvaluations, icon: FileText, color: 'text-purple-600 dark:text-purple-400' },
    { label: 'Avg Score', value: `${analytics.summary.avgOverallScore.toFixed(1)}%`, icon: TrendingUp, color: 'text-amber-600 dark:text-amber-400' },
  ]

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Analytics" />
      
      <PageContent>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
          <p className="text-muted mt-1">
            {analytics.period.name} • {new Date(analytics.period.startDate).toLocaleDateString()} - {new Date(analytics.period.endDate).toLocaleDateString()}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
              className="glass rounded-xl p-5"
            >
              <stat.icon className={`w-6 h-6 ${stat.color} mb-2`} />
              <div className="text-3xl font-bold text-foreground">{stat.value}</div>
              <div className="text-sm text-muted">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Department Performance</h3>
            {analytics.departmentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.departmentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--muted)' }} />
                  <YAxis tick={{ fill: 'var(--muted)' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }} />
                  <Legend />
                  <Bar dataKey="avgScore" name="Avg Score (%)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completionRate" name="Completion (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted">No department data</div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Score Distribution</h3>
            {analytics.scoreDistribution.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analytics.scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="range" tick={{ fill: 'var(--muted)' }} />
                  <YAxis tick={{ fill: 'var(--muted)' }} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }} />
                  <Bar dataKey="count" name="Employees" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted">No score data</div>
            )}
          </motion.div>
        </div>

        {/* Performers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-foreground">Top Performers</h3>
            </div>
            {analytics.topPerformers.length > 0 ? (
              <div className="space-y-3">
                {analytics.topPerformers.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-700' : 'bg-indigo-500'}`}>
                        {i + 1}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted">{p.department || 'No department'}</div>
                      </div>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-semibold">{p.score.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted py-8">No data available</div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h3 className="text-lg font-semibold text-foreground">Needs Improvement</h3>
            </div>
            {analytics.bottomPerformers.length > 0 ? (
              <div className="space-y-3">
                {analytics.bottomPerformers.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 text-sm font-medium">
                        {i + 1}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{p.name}</div>
                        <div className="text-xs text-muted">{p.department || 'No department'}</div>
                      </div>
                    </div>
                    <div className="text-red-600 dark:text-red-400 font-semibold">{p.score.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted py-8">No data available</div>
            )}
          </motion.div>
        </div>

        <PageFooter />
      </PageContent>
    </PageContainer>
  )
}
