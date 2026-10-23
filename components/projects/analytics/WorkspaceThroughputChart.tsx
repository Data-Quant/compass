'use client'

import { Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from 'recharts'
import type { AnalyticsRange } from '@/lib/project-analytics'
import type { WorkspaceAnalytics } from './types'
import { AXIS_TICK, CHART_MARGIN, GRID_STROKE, SURFACE, Y_AXIS_WIDTH, plural } from './chart-theme'
import { ChartCard, ChartEmpty, Legend, SrTable, TipCard } from './ChartCard'
import { bucketTitle } from './BurnUpChart'

export type ProjectSeries = { key: string; label: string; color: string }
type Point = { label: string; total: number } & Record<string, number | string>

export function WorkspaceThroughputChart({ analytics, range, series, keyOf }: {
  analytics: WorkspaceAnalytics
  range: AnalyticsRange
  series: ProjectSeries[]
  keyOf: (projectId: string) => string
}) {
  const unit = range.bucket
  const data: Point[] = analytics.buckets.map((bucket, i) => {
    const point: Point = { label: bucket.label, total: 0 }
    for (const entry of series) point[entry.key] = 0
    for (const project of analytics.projects) {
      const count = project.series[i] ?? 0
      const key = keyOf(project.projectId)
      point[key] = (point[key] as number) + count
      point.total += count
    }
    return point
  })
  const total = data.reduce((acc, point) => acc + point.total, 0)
  const mid = Math.floor((data.length - 1) / 2)
  // Round only the top non-zero segment of each stack.
  const topKey = (point: Point) => [...series].reverse().find((entry) => (point[entry.key] as number) > 0)?.key

  return (
    <ChartCard
      id="workspace-throughput"
      title={`Completed per ${unit}, all projects`}
      description="Stacked by project, in the same colours as the table."
      aside={<Legend items={series.map((entry) => ({ label: entry.label, color: entry.color }))} />}
    >
      {total === 0 ? (
        <ChartEmpty className="h-[260px]" title="Nothing completed in this range" description="Pick a longer range, or check back once tasks are marked done." />
      ) : (
        <>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={CHART_MARGIN} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis
                  dataKey="label"
                  ticks={[...new Set([data[0].label, data[mid].label, data[data.length - 1].label])]}
                  interval={0}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: GRID_STROKE }}
                />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={Y_AXIS_WIDTH} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.6 }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as Point | undefined
                    if (!active || !point) return null
                    return (
                      <TipCard
                        title={`${bucketTitle(range.bucket, point.label)}: ${point.total} completed`}
                        rows={[...series].reverse().map((entry) => ({ label: entry.label, value: point[entry.key], color: entry.color, kind: 'rect' as const }))}
                      />
                    )
                  }}
                />
                {series.map((entry) => (
                  <Bar
                    key={entry.key}
                    dataKey={entry.key}
                    name={entry.label}
                    stackId="projects"
                    fill={entry.color}
                    stroke={SURFACE}
                    strokeWidth={1}
                    maxBarSize={28}
                    isAnimationActive={false}
                    shape={(props: BarShapeProps) => (
                      <Rectangle {...props} radius={topKey(props.payload as Point) === entry.key ? [4, 4, 0, 0] : 0} />
                    )}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <SrTable
            caption={`Completed per ${unit}, all projects, ${plural(total, 'task')} in total`}
            headers={['Period', ...series.map((entry) => entry.label), 'Total']}
            rows={data.map((point) => [bucketTitle(range.bucket, point.label), ...series.map((entry) => point[entry.key]), point.total])}
          />
        </>
      )}
    </ChartCard>
  )
}
