'use client'

import { useEffect, useState } from 'react'
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
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Card, CardContent } from '@/components/ui/card'
import { Users, CheckCircle, FileText, TrendingUp, Trophy, AlertCircle } from 'lucide-react'

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--accent))',
  'hsl(38 92% 50%)',
  'hsl(142 71% 45%)',
  'hsl(217 91% 60%)',
]

interface Analytics {
  period: { id: string; name: string; startDate: string; endDate: string }
  summary: {
    totalTeamMembers?: number
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
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
  }, [])

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
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading analytics..." />
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No analytics data available.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statCards = [
    { label: 'Team Members', value: analytics.summary.totalTeamMembers ?? analytics.summary.totalEmployees, icon: Users, color: 'text-primary' },
    { label: 'Evaluated', value: analytics.summary.employeesWithEvaluations, icon: CheckCircle, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Evaluations', value: analytics.summary.totalEvaluations, icon: FileText, color: 'text-purple-600 dark:text-purple-400' },
    { label: 'Avg Score', value: `${analytics.summary.avgOverallScore.toFixed(1)}%`, icon: TrendingUp, color: 'text-amber-600 dark:text-amber-400' },
  ]

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground font-display">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-1">
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
            >
              <Card>
                <CardContent className="p-5">
                  <stat.icon className={`w-6 h-6 ${stat.color} mb-2`} />
                  <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Department Performance</h3>
                {analytics.departmentData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.departmentData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                      <Legend />
                      <Bar dataKey="avgScore" name="Avg Score (%)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completionRate" name="Completion (%)" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">No department data</div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Score Distribution</h3>
                {analytics.scoreDistribution.some(d => d.count > 0) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.scoreDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="range" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                      <Bar dataKey="count" name="Employees" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">No score data</div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Performers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <h3 className="text-lg font-semibold text-foreground">Top Performers</h3>
                </div>
                {analytics.topPerformers.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.topPerformers.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-700' : 'bg-primary'}`}>
                            {i + 1}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.department || 'No department'}</div>
                          </div>
                        </div>
                        <div className="text-emerald-600 dark:text-emerald-400 font-semibold">{p.score.toFixed(1)}%</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">No data available</div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <h3 className="text-lg font-semibold text-foreground">Needs Improvement</h3>
                </div>
                {analytics.bottomPerformers.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.bottomPerformers.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 text-sm font-medium">
                            {i + 1}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.department || 'No department'}</div>
                          </div>
                        </div>
                        <div className="text-red-600 dark:text-red-400 font-semibold">{p.score.toFixed(1)}%</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">No data available</div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

    </div>
  )
}

