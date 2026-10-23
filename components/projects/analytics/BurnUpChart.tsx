'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsRange } from '@/lib/project-analytics'
import type { ProjectAnalytics } from './types'
import { AXIS_TICK, GRID_STROKE, NEUTRAL, SURFACE, plural } from './chart-theme'
import { ChartCard, ChartEmpty, Legend, SrTable, TipCard } from './ChartCard'

const COMPLETED = 'hsl(var(--primary))'
const BUCKET_DAYS = { day: 1, week: 7, month: 30.4 } as const

export const bucketTitle = (bucket: AnalyticsRange['bucket'], label: string) => (
  bucket === 'week' ? `Week of ${label}` : label
)

type Point = { x: number; label?: string; scope?: number; done?: number; projection?: number }

function paceCopy(remaining: number, weeksLeft: number | null) {
  if (remaining === 0) return 'All scope completed'
  if (weeksLeft === null) return 'No pace yet: nothing completed in the last 4 weeks'
  if (weeksLeft < 1) return 'At current pace: less than a week left'
  const weeks = Math.ceil(weeksLeft)
  return `At current pace: about ${plural(weeks, 'week')} left`
}

export function BurnUpChart({ burnUp, range }: { burnUp: ProjectAnalytics['burnUp']; range: AnalyticsRange }) {
  const series = burnUp.series
  const last = series[series.length - 1]
  const remaining = last ? last.scope - last.done : 0

  const points: Point[] = series.map((point, index) => ({
    x: index, label: point.label, scope: point.scope, done: point.done,
  }))
  // Project forward over a fifth of the plotted span, ending early if scope would be finished.
  if (last && remaining > 0 && burnUp.weeksLeft !== null) {
    const lastX = series.length - 1
    const horizon = Math.max(1, Math.round(series.length * 0.2))
    const bucketsLeft = (burnUp.weeksLeft * 7) / BUCKET_DAYS[range.bucket]
    const step = Math.min(horizon, bucketsLeft)
    points[lastX].projection = last.done
    points.push({ x: lastX + step, projection: Math.round((last.done + (remaining * step) / bucketsLeft) * 10) / 10 })
  }
  const domainEnd = Math.max(series.length - 1 + Math.max(1, Math.round(series.length * 0.2)), 1)
  const mid = Math.floor((series.length - 1) / 2)

  const legend = [
    { label: 'Scope', color: NEUTRAL, kind: 'line' as const },
    { label: 'Completed', color: COMPLETED, kind: 'line' as const },
    { label: 'At current pace', color: COMPLETED, kind: 'dash' as const },
  ]

  return (
    <ChartCard
      id="burnup"
      title="Progress over time"
      description="Scope is every non-backlog task created so far. Completed is every one of those marked done. A widening gap means work is arriving faster than it finishes."
      aside={<Legend items={legend} />}
    >
      {!last || last.scope === 0 ? (
        <ChartEmpty
          className="h-[240px]"
          title="No tasks yet"
          description="Progress shows here once the board has tasks outside the backlog."
        />
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground">
              {paceCopy(remaining, burnUp.weeksLeft)}
            </span>
          </div>
          <p className="sr-only">
            {`Scope grew to ${plural(last.scope, 'task')}, ${last.done} completed. ${paceCopy(remaining, burnUp.weeksLeft)}.`}
          </p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, domainEnd]}
                  ticks={[...new Set([0, mid, series.length - 1])]}
                  tickFormatter={(x: number) => series[x]?.label ?? ''}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: GRID_STROKE }}
                />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as Point | undefined
                    if (!active || !point) return null
                    if (point.scope === undefined) {
                      return (
                        <TipCard
                          title="At current pace"
                          rows={[{ label: 'Completed by then', value: `about ${Math.round(point.projection ?? 0)}`, color: COMPLETED, kind: 'dash' }]}
                        />
                      )
                    }
                    return (
                      <TipCard
                        title={bucketTitle(range.bucket, point.label ?? '')}
                        rows={[
                          { label: 'Scope', value: point.scope, color: NEUTRAL },
                          { label: 'Completed', value: point.done ?? 0, color: COMPLETED },
                          { label: 'Still open', value: Math.max(0, point.scope - (point.done ?? 0)) },
                        ]}
                      />
                    )
                  }}
                />
                <Line dataKey="scope" stroke={NEUTRAL} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
                <Line dataKey="done" stroke={COMPLETED} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
                <Line dataKey="projection" stroke={COMPLETED} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <SrTable
            caption="Progress over time"
            headers={['Period', 'Scope', 'Completed']}
            rows={series.map((point) => [bucketTitle(range.bucket, point.label), point.scope, point.done])}
          />
        </>
      )}
    </ChartCard>
  )
}
