'use client'

import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Users, CheckCircle, FileText, TrendingUp, Trophy, AlertCircle } from 'lucide-react'
import type { Analytics } from '@/components/analytics/types'

interface OverviewTabProps {
  analytics: Analytics
}

export function OverviewTab({ analytics }: OverviewTabProps) {
  const statCards = [
    {
      label: 'Team Members',
      value: analytics.summary.totalTeamMembers ?? analytics.summary.totalEmployees,
      icon: Users,
      color: 'text-primary',
    },
    {
      label: 'Complete',
      value: `${analytics.summary.employeesComplete ?? analytics.summary.employeesWithEvaluations}/${
        analytics.summary.totalTeamMembers ?? analytics.summary.totalEmployees
      }`,
      icon: CheckCircle,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Avg Completion',
      value: `${analytics.summary.completionRate.toFixed(1)}%`,
      icon: FileText,
      color: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Avg Score',
      value: `${analytics.summary.avgOverallScore.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-amber-600 dark:text-amber-400',
    },
  ]

  return (
    <div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Department Performance</h3>
              {analytics.departmentData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.departmentData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="avgScore"
                      name="Avg Score (%)"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="completionRate"
                      name="Completion (%)"
                      fill="hsl(142 71% 45%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No department data
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Score Distribution</h3>
              {analytics.scoreDistribution.some((entry) => entry.count > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.scoreDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="range" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Employees"
                      fill="hsl(var(--secondary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No score data
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold text-foreground">Top Performers</h3>
              </div>
              {analytics.topPerformers.length > 0 ? (
                <div className="space-y-3">
                  {analytics.topPerformers.map((performer, index) => (
                    <div
                      key={`${performer.name}-${index}`}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                            index === 0
                              ? 'bg-amber-500'
                              : index === 1
                                ? 'bg-gray-400'
                                : index === 2
                                  ? 'bg-amber-700'
                                  : 'bg-primary'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{performer.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {performer.department || 'No department'}
                          </div>
                        </div>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {performer.score.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">No data available</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-semibold text-foreground">Needs Improvement</h3>
              </div>
              {analytics.bottomPerformers.length > 0 ? (
                <div className="space-y-3">
                  {analytics.bottomPerformers.map((performer, index) => (
                    <div
                      key={`${performer.name}-${index}`}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{performer.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {performer.department || 'No department'}
                          </div>
                        </div>
                      </div>
                      <div className="text-red-600 dark:text-red-400 font-semibold">
                        {performer.score.toFixed(1)}%
                      </div>
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
