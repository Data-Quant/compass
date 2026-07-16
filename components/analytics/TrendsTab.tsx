'use client'

import { motion } from 'framer-motion'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowDownRight, ArrowUpRight, Sparkles } from 'lucide-react'
import type { DepartmentTrend, Mover, TrendsResult } from '@/lib/analytics/trends'
import type { NameResolver } from '@/components/analytics/types'

const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))', fontSize: 12 }
const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
}

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

/**
 * One department's trajectory as a small multiple.
 *
 * Departments are faceted rather than overlaid: there are far more of them than a
 * categorical palette can hold, and overlaying them would mean cycling hues —
 * two departments sharing a color. Faceting keeps identity in the title and lets
 * every facet reuse the same single hue.
 */
function DepartmentFacet({ series, index }: { series: DepartmentTrend; index: number }) {
  const latest = series.points[series.points.length - 1]
  const first = series.points[0]
  const delta = latest && first ? latest.avgScore - first.avgScore : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 * index }}
    >
      <Card>
        <CardContent className="p-4">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <span className="text-sm font-medium text-foreground truncate" title={series.department}>
              {series.department}
            </span>
            <span className="text-sm font-semibold text-foreground shrink-0">
              {latest ? `${latest.avgScore.toFixed(0)}%` : '—'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={72}>
            <LineChart data={series.points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <YAxis domain={[0, 100]} hide />
              <XAxis dataKey="periodName" hide />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [
                  typeof value === 'number' ? `${value.toFixed(1)}%` : '—',
                  series.department,
                ]}
              />
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 2 }}
                animationDuration={700}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="text-xs text-muted-foreground mt-1">
            {series.points.length < 2
              ? 'one period only'
              : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts since ${first?.periodName}`}
          </div>
        </CardContent>
      </Card>
    </motion.div>
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

  const orgData = trends.orgSeries.map((point) => ({
    periodName: point.periodName,
    avgScore: Number(point.avgScore.toFixed(2)),
    employeeCount: point.employeeCount,
  }))

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-foreground">Organization Trajectory</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Average overall score across everyone evaluated in each period.
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={orgData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="periodName" tick={AXIS_TICK} />
                <YAxis domain={[0, 100]} unit="%" tick={AXIS_TICK} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, _name, entry) => [
                    typeof value === 'number'
                      ? `${value.toFixed(1)}% (${entry?.payload?.employeeCount ?? 0} people)`
                      : '—',
                    'Organization',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  name="Organization"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  animationDuration={900}
                />
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

      {trends.departmentSeries.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            By Department ({trends.departmentSeries.length})
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Each department on its own axis, 0–100%. Shown side by side rather than overlaid — there
            are more departments than a palette can distinguish.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {trends.departmentSeries.map((series, index) => (
              <DepartmentFacet key={series.department} series={series} index={index} />
            ))}
          </div>
        </div>
      )}

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
