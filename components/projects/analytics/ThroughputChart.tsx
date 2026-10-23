'use client'

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsRange } from '@/lib/project-analytics'
import type { ProjectAnalytics } from './types'
import { AXIS_TICK, CHART_MARGIN, COMPLETED, GRID_STROKE, Y_AXIS_WIDTH, formatDecimal, plural } from './chart-theme'
import { ChartCard, ChartEmpty, SrTable, TipCard } from './ChartCard'
import { bucketTitle } from './BurnUpChart'

const BAR = COMPLETED
const AVERAGE = 'hsl(var(--muted-foreground))'

export function ThroughputChart({ throughput, range }: { throughput: ProjectAnalytics['throughput']; range: AnalyticsRange }) {
  const unit = range.bucket
  const series = throughput.series
  const total = series.reduce((sum, point) => sum + point.completed, 0)
  const mid = Math.floor((series.length - 1) / 2)

  return (
    <ChartCard
      id="throughput"
      title={`Completed per ${unit}`}
      description="Each finished task or subtask counts once. Parent tasks that close on their own are skipped."
      aside={
        <div className="text-right">
          <div className="text-xl font-semibold text-foreground">{formatDecimal(throughput.average)}</div>
          <div className="text-[11px] text-muted-foreground">average per {unit}</div>
        </div>
      }
    >
      {total === 0 ? (
        <ChartEmpty
          className="h-[200px]"
          title="Nothing completed in this range"
          description="Pick a longer range, or check back once tasks are marked done."
        />
      ) : (
        <>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={CHART_MARGIN} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis
                  dataKey="label"
                  ticks={[...new Set([series[0].label, series[mid].label, series[series.length - 1].label])]}
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
                    const point = payload?.[0]?.payload as (typeof series)[number] | undefined
                    if (!active || !point) return null
                    return (
                      <TipCard
                        title={bucketTitle(range.bucket, point.label)}
                        rows={[
                          { label: 'Completed', value: point.completed, color: BAR, kind: 'rect' },
                          { label: 'Created', value: point.created },
                        ]}
                      />
                    )
                  }}
                />
                <ReferenceLine y={throughput.average} stroke={AVERAGE} strokeDasharray="4 4" ifOverflow="extendDomain" />
                <Bar dataKey="completed" fill={BAR} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span aria-hidden="true" className="w-3.5 border-t border-dashed" style={{ borderColor: AVERAGE }} />
            Dashed line is the average
          </p>
          <SrTable
            caption={`Completed per ${unit}, ${plural(total, 'task')} in total, average ${formatDecimal(throughput.average)}`}
            headers={['Period', 'Completed', 'Created']}
            rows={series.map((point) => [bucketTitle(range.bucket, point.label), point.completed, point.created])}
          />
        </>
      )}
    </ChartCard>
  )
}
