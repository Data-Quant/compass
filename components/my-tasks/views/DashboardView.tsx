'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CheckCircle2, Clock3, ListChecks, TriangleAlert } from 'lucide-react'

interface DashboardData {
  totalCompletedTasks: number
  totalIncompleteTasks: number
  totalOverdueTasks: number
  totalTasks: number
  tasksBySmartSection: Array<{ bucket: string; label: string; count: number }>
  tasksByCompletionStatusThisMonth: Array<{ status: string; count: number }>
  tasksByProject: Array<{ projectId: string; projectName: string; count: number }>
  taskCompletionOverTime: Array<{ date: string; completed: number; active: number }>
}

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444']

interface MyTasksDashboardViewProps {
  projectId?: string | null
}

export function MyTasksDashboardView({ projectId }: MyTasksDashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [window, setWindow] = useState<'14d' | '30d' | '90d'>('30d')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ window })
        if (projectId) params.set('projectId', projectId)
        const response = await fetch(`/api/my-tasks/dashboard?${params.toString()}`)
        const payload = await response.json()
        if (mounted && response.ok) setData(payload)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [projectId, window])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-sm text-muted-foreground">Loading dashboard...</CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-sm text-muted-foreground">No dashboard data available.</CardContent>
      </Card>
    )
  }

  const stats = [
    { label: 'Total completed tasks', value: data.totalCompletedTasks, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Total incomplete tasks', value: data.totalIncompleteTasks, icon: ListChecks, color: 'text-blue-300' },
    { label: 'Total overdue tasks', value: data.totalOverdueTasks, icon: TriangleAlert, color: 'text-amber-400' },
    { label: 'Total tasks', value: data.totalTasks, icon: Clock3, color: 'text-purple-300' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {(['14d', '30d', '90d'] as const).map((range) => (
          <Button key={range} size="sm" variant={window === range ? 'default' : 'outline'} onClick={() => setWindow(range)}>
            {range}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <stat.icon className={`w-5 h-5 ${stat.color} mb-1`} />
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tasks by smart section</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.tasksBySmartSection}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tasks by completion status this month</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.tasksByCompletionStatusThisMonth} dataKey="count" nameKey="status" innerRadius={70} outerRadius={95}>
                  {data.tasksByCompletionStatusThisMonth.map((entry, index) => (
                    <Cell key={`${entry.status}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total tasks by project</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.tasksByProject}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="projectName" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Task completion over time</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.taskCompletionOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="active" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
