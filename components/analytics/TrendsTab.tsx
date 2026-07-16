'use client'

import { motion } from 'framer-motion'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowDownRight, ArrowUpRight, Sparkles } from 'lucide-react'
import type { Mover, TrendsResult } from '@/lib/analytics/trends'
import type { NameResolver } from '@/components/analytics/types'

const DEPARTMENT_COLORS = [
  'hsl(var(--primary))',
  'hsl(142 71% 45%)',
  'hsl(217 91% 60%)',
  'hsl(38 92% 50%)',
  'hsl(280 65% 60%)',
  'hsl(0 72% 51%)',
]

interface TrendsTabProps {
  trends: TrendsResult
  resolveName: NameResolver
}

interface MoverListProps {
  title: string
  movers: Mover[]
  resolveName: NameResolver
  tone: 'positive' | 'negative'
}

function MoverList({ title, movers, resolveName, tone }: MoverListProps) {
  const Icon = tone === 'positive' ? ArrowUpRight : ArrowDownRight
  const toneClass =
    tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Icon className={`w-5 h-5 ${toneClass}`} />
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        {movers.length > 0 ? (
          <div className="space-y-3">
            {movers.map((mover, index) => (
              <motion.div
                key={mover.employeeId}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div>
                  <div className="font-medium text-foreground">{resolveName(mover.employeeId)}</div>
                  <div className="text-xs text-muted-foreground">
                    {mover.department || 'No department'} • {mover.previousScore.toFixed(1)}% →{' '}
                    {mover.currentScore.toFixed(1)}%
                  </div>
                </div>
                <div className={`font-semibold ${toneClass}`}>
                  {mover.delta > 0 ? '+' : ''}
                  {mover.delta.toFixed(1)}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">No data available</div>
        )}
      </CardContent>
    </Card>
  )
}

export function TrendsTab({ trends, resolveName }: TrendsTabProps) {
  if (trends.insufficientData) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Trends need at least two completed evaluation periods. This view fills in once the next
            quarter closes.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Recharts needs one row per period with a key per department.
  const chartData = trends.orgSeries.map((point) => {
    const row: Record<string, string | number> = {
      periodName: point.periodName,
      Organization: Number(point.avgScore.toFixed(2)),
    }
    for (const series of trends.departmentSeries) {
      const match = series.points.find((entry) => entry.periodId === point.periodId)
      if (match) {
        row[series.department] = Number(match.avgScore.toFixed(2))
      }
    }
    return row
  })

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Score Trajectory</h3>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="periodName" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Organization"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  animationDuration={900}
                />
                {trends.departmentSeries.map((series, index) => (
                  <Line
                    key={series.department}
                    type="monotone"
                    dataKey={series.department}
                    stroke={DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length]}
                    strokeWidth={2}
                    strokeOpacity={0.8}
                    dot={{ r: 3 }}
                    animationDuration={900}
                    animationBegin={120 * (index + 1)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MoverList
          title="Biggest Improvers"
          movers={trends.topImprovers}
          resolveName={resolveName}
          tone="positive"
        />
        <MoverList
          title="Biggest Decliners"
          movers={trends.topDecliners}
          resolveName={resolveName}
          tone="negative"
        />
      </div>

      {trends.newJoiners.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              New This Period ({trends.newJoiners.length})
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              No prior score, so they have no momentum yet and are not ranked as movers.
            </p>
            <div className="flex flex-wrap gap-2">
              {trends.newJoiners.map((joiner) => (
                <span key={joiner.employeeId} className="px-3 py-1 bg-muted rounded-full text-sm">
                  {resolveName(joiner.employeeId)} — {joiner.currentScore.toFixed(1)}%
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
