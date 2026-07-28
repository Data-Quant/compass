'use client'

import { useId, useMemo } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const MUTED = 'hsl(var(--muted-foreground))'
const EDGE = 'hsl(var(--border))'
const SURFACE = 'hsl(var(--card))'
const AMBER = 'hsl(var(--primary))'
const CYAN = 'hsl(var(--accent))'
const CORAL = 'hsl(var(--destructive))'

export interface EvaluationHistoryPoint {
  periodId: string
  label: string
  score: number | null
}

export interface LensReadout {
  lens: string
  label: string
  score: number | null
  organizationAverage?: number | null
  evaluatorCount?: number | null
  isSelf?: boolean
}

export interface CompensationPoint {
  date: string
  total: number
  currency: string
}

export interface EvaluationPeriodMarker {
  date: string
  label: string
}

function EmptyVisual({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-44 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
  valueFormatter: (value: number) => string
  labelFormatter?: (value: string) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="min-w-36 rounded-lg border border-border bg-popover/95 px-3 py-2 text-popover-foreground shadow-xl backdrop-blur">
      <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label && labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload
        .filter((item) => typeof item.value === 'number')
        .map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-4 text-xs">
            <span style={{ color: item.color }}>{item.name}</span>
            <span className="font-mono text-foreground">{valueFormatter(item.value!)}</span>
          </div>
        ))}
    </div>
  )
}

export function EvaluationTrajectory({
  primaryName,
  primary,
  comparisonName,
  comparison = [],
}: {
  primaryName: string
  primary: EvaluationHistoryPoint[]
  comparisonName?: string | null
  comparison?: EvaluationHistoryPoint[]
}) {
  const chartId = useId().replace(/:/g, '')
  const reduceMotion = useReducedMotion()
  const rows = useMemo(() => {
    const order = new Map<string, number>()
    primary.forEach((point, index) => order.set(point.periodId, index))
    comparison.forEach((point) => {
      if (!order.has(point.periodId)) order.set(point.periodId, order.size)
    })

    const byId = new Map<
      string,
      { periodId: string; label: string; primary: number | null; comparison: number | null }
    >()
    for (const point of primary) {
      byId.set(point.periodId, {
        periodId: point.periodId,
        label: point.label,
        primary: point.score,
        comparison: null,
      })
    }
    for (const point of comparison) {
      const existing = byId.get(point.periodId)
      if (existing) existing.comparison = point.score
      else {
        byId.set(point.periodId, {
          periodId: point.periodId,
          label: point.label,
          primary: null,
          comparison: point.score,
        })
      }
    }

    return [...byId.values()].sort(
      (a, b) => (order.get(a.periodId) ?? 0) - (order.get(b.periodId) ?? 0)
    )
  }, [comparison, primary])

  if (!rows.some((row) => row.primary !== null || row.comparison !== null)) {
    return <EmptyVisual>No scored evaluation history is available for this subject.</EmptyVisual>
  }

  const accessible = rows
    .map((row) => {
      const values = [
        row.primary === null ? null : `${primaryName} ${row.primary.toFixed(0)} percent`,
        comparisonName && row.comparison !== null
          ? `${comparisonName} ${row.comparison.toFixed(0)} percent`
          : null,
      ].filter(Boolean)
      return `${row.label}: ${values.join(', ')}`
    })
    .join('. ')

  return (
    <div
      role="img"
      aria-label={`Evaluation trajectory. ${accessible}`}
    >
      <ResponsiveContainer width="100%" height={270}>
        <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 2, left: -20 }}>
          <defs>
            <linearGradient id={`${chartId}-performance`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={AMBER} stopOpacity={0.25} />
              <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={EDGE} strokeDasharray="2 5" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: MUTED, fontSize: 10 }}
            tickMargin={10}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: MUTED, fontSize: 10 }}
          />
          <Tooltip
            content={
              <ChartTooltip
                valueFormatter={(value) => `${value.toFixed(0)}%`}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="primary"
            name={primaryName}
            stroke="none"
            fill={`url(#${chartId}-performance)`}
            connectNulls={false}
            isAnimationActive={!reduceMotion}
          />
          <Line
            type="monotone"
            dataKey="primary"
            name={primaryName}
            stroke={AMBER}
            strokeWidth={2.25}
            dot={{ r: 3.5, fill: AMBER, stroke: SURFACE, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={!reduceMotion}
          />
          {comparisonName && (
            <Line
              type="monotone"
              dataKey="comparison"
              name={comparisonName}
              stroke={CYAN}
              strokeWidth={1.8}
              strokeDasharray="6 4"
              dot={{ r: 3, fill: CYAN, stroke: SURFACE, strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={!reduceMotion}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function LensMatrix({
  primaryName,
  primary,
  comparisonName,
  comparison = [],
}: {
  primaryName: string
  primary: LensReadout[]
  comparisonName?: string | null
  comparison?: LensReadout[]
}) {
  const compareByLens = new Map(comparison.map((item) => [item.lens, item]))
  const rows = [
    ...primary,
    ...comparison.filter((item) => !primary.some((candidate) => candidate.lens === item.lens)),
  ]

  if (!rows.length) {
    return <EmptyVisual>No relationship-lens scores are available for this period.</EmptyVisual>
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const compare = compareByLens.get(row.lens)
        const score = row.score === null ? null : Math.max(0, Math.min(4, row.score))
        const average =
          row.organizationAverage == null
            ? null
            : Math.max(0, Math.min(4, row.organizationAverage))
        const compareScore =
          compare?.score == null ? null : Math.max(0, Math.min(4, compare.score))

        return (
          <div key={row.lens}>
            <div className="mb-1.5 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {row.label}
                  {row.isSelf ? ' · self' : ''}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                  {row.evaluatorCount
                    ? `${row.evaluatorCount} evaluator${row.evaluatorCount === 1 ? '' : 's'}`
                    : row.isSelf
                      ? 'Self-reported lens'
                      : 'Evaluator coverage unavailable'}
                </p>
              </div>
              <div className="flex items-baseline gap-2 font-mono">
                <span
                  className={
                    row.isSelf
                      ? '[color:var(--employee-360-comparison)]'
                      : 'text-foreground'
                  }
                >
                  {score === null ? '—' : score.toFixed(2)}
                </span>
                {comparisonName && (
                  <span className="text-xs [color:var(--employee-360-comparison)]">
                    {compareScore === null ? '—' : compareScore.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
            <div
              className="relative h-2 rounded-full bg-muted"
              role="meter"
              aria-label={`${row.label} for ${primaryName}`}
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={score ?? undefined}
            >
              {score !== null && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${(score / 4) * 100}%`,
                    backgroundColor: row.isSelf ? CYAN : AMBER,
                    opacity: row.isSelf ? 0.72 : 0.9,
                  }}
                />
              )}
              {average !== null && (
                <span
                  className="absolute top-[-3px] h-3.5 w-px bg-foreground/60"
                  style={{ left: `${(average / 4) * 100}%` }}
                  title={`Organization average ${average.toFixed(2)}`}
                />
              )}
              {compareScore !== null && (
                <span
                  className="absolute top-[-2px] h-3 w-3 -translate-x-1/2 rounded-full border-2 bg-card [border-color:var(--employee-360-comparison)]"
                  style={{ left: `${(compareScore / 4) * 100}%` }}
                  title={`${comparisonName} ${compareScore.toFixed(2)}`}
                />
              )}
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[10px] text-muted-foreground">
        <span>
          <i className="mr-1.5 inline-block h-1.5 w-4 rounded-full [background-color:var(--employee-360-primary)]" />{' '}
          {primaryName}
        </span>
        {comparisonName && (
          <span>
            <i className="mr-1.5 inline-block h-2 w-2 rounded-full border [border-color:var(--employee-360-comparison)]" />{' '}
            {comparisonName}
          </span>
        )}
        <span>
          <i className="mr-1.5 inline-block h-3 w-px bg-foreground/60" /> organization average
        </span>
      </div>
    </div>
  )
}

function CompensationCurrencyChart({
  currency,
  primaryName,
  primary,
  comparisonName,
  comparison = [],
  evaluationMarkers = [],
}: {
  currency: string
  primaryName: string
  primary: CompensationPoint[]
  comparisonName?: string | null
  comparison?: CompensationPoint[]
  evaluationMarkers?: EvaluationPeriodMarker[]
}) {
  const chartId = useId().replace(/:/g, '')
  const reduceMotion = useReducedMotion()
  const rows = useMemo(() => {
    const dates = [
      ...new Set([
        ...primary.map((point) => point.date),
        ...comparison.map((point) => point.date),
        ...evaluationMarkers.map((marker) => marker.date),
      ]),
    ].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    const primaryByDate = new Map(primary.map((point) => [point.date, point.total]))
    const comparisonByDate = new Map(comparison.map((point) => [point.date, point.total]))
    let primaryValue: number | null = null
    let comparisonValue: number | null = null
    return dates.map((date) => {
      if (primaryByDate.has(date)) primaryValue = primaryByDate.get(date)!
      if (comparisonByDate.has(date)) comparisonValue = comparisonByDate.get(date)!
      return {
        date,
        primary: primaryValue,
        comparison: comparisonValue,
      }
    })
  }, [comparison, evaluationMarkers, primary])

  if (!rows.length) {
    return <EmptyVisual>No finalized basic-salary history is available for this subject.</EmptyVisual>
  }

  const formatMoney = (value: number) =>
    `${currency ? `${currency} ` : ''}${Math.round(value).toLocaleString()}`

  return (
    <div
      role="img"
      aria-label={`Basic salary trajectory in ${currency}. ${rows
        .map((row) =>
          [
            `${new Date(row.date).toLocaleDateString(undefined, {
              month: 'short',
              year: 'numeric',
            })}: ${primaryName} ${
              row.primary === null ? 'unavailable' : formatMoney(row.primary)
            }`,
            comparisonName
              ? `${comparisonName} ${
                  row.comparison === null
                    ? 'unavailable'
                    : formatMoney(row.comparison)
                }`
              : null,
          ]
            .filter(Boolean)
            .join(', ')
        )
        .join('. ')}`}
    >
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 2, left: 4 }}>
          <defs>
            <linearGradient id={`${chartId}-salary`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={AMBER} stopOpacity={0.18} />
              <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={EDGE} strokeDasharray="2 5" vertical={false} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: MUTED, fontSize: 10 }}
            tickMargin={10}
            tickFormatter={(value) =>
              new Date(value).toLocaleDateString(undefined, {
                month: 'short',
                year: '2-digit',
              })
            }
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={78}
            tick={{ fill: MUTED, fontSize: 10 }}
            tickFormatter={(value) =>
              Math.abs(value) >= 1_000_000
                ? `${(value / 1_000_000).toFixed(1)}m`
                : Math.abs(value) >= 1_000
                  ? `${Math.round(value / 1_000)}k`
                  : String(value)
            }
          />
          <Tooltip
            content={
              <ChartTooltip
                valueFormatter={(value) => formatMoney(value)}
                labelFormatter={(value) =>
                  new Date(value).toLocaleDateString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                }
              />
            }
          />
          {evaluationMarkers.slice(-6).map((marker) => (
            <ReferenceLine
              key={`${currency}-${marker.date}-${marker.label}`}
              x={marker.date}
              stroke={CYAN}
              strokeDasharray="2 5"
              strokeOpacity={0.42}
              label={{
                value: marker.label,
                position: 'insideTopRight',
                fill: MUTED,
                fontSize: 8,
              }}
            />
          ))}
          <Area
            type="stepAfter"
            dataKey="primary"
            name={primaryName}
            stroke="none"
            fill={`url(#${chartId}-salary)`}
            connectNulls
            isAnimationActive={!reduceMotion}
          />
          <Line
            type="stepAfter"
            dataKey="primary"
            name={primaryName}
            stroke={AMBER}
            strokeWidth={2.2}
            dot={{ r: 3, fill: AMBER, stroke: SURFACE, strokeWidth: 2 }}
            connectNulls
            isAnimationActive={!reduceMotion}
          />
          {comparisonName && comparison.length > 0 && (
            <Line
              type="stepAfter"
              dataKey="comparison"
              name={comparisonName}
              stroke={CYAN}
              strokeWidth={1.8}
              strokeDasharray="6 4"
              dot={{ r: 3, fill: CYAN, stroke: SURFACE, strokeWidth: 2 }}
              connectNulls
              isAnimationActive={!reduceMotion}
            />
          )}
          {rows.length === 1 && rows[0].primary !== null && (
            <ReferenceDot
              x={rows[0].date}
              y={rows[0].primary}
              r={4}
              fill={AMBER}
              stroke={CORAL}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CompensationTrajectory({
  primaryName,
  primary,
  comparisonName,
  comparison = [],
  evaluationMarkers = [],
}: {
  primaryName: string
  primary: CompensationPoint[]
  comparisonName?: string | null
  comparison?: CompensationPoint[]
  evaluationMarkers?: EvaluationPeriodMarker[]
}) {
  const currencies = [
    ...new Set([...primary, ...comparison].map((point) => point.currency)),
  ].sort((left, right) => left.localeCompare(right))

  if (!currencies.length) {
    return <EmptyVisual>No finalized basic-salary history is available for this subject.</EmptyVisual>
  }

  return (
    <div className="space-y-4">
      {currencies.map((currency) => {
        const primarySeries = primary.filter((point) => point.currency === currency)
        const comparisonSeries = comparison.filter(
          (point) => point.currency === currency
        )
        const comparable = primarySeries.length > 0 && comparisonSeries.length > 0

        return (
          <section
            key={currency}
            className="rounded-lg border border-border bg-muted/20 p-3"
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground">
                {currency}
              </span>
              {comparisonName && (
                <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {comparable
                    ? 'Equivalent currency comparison'
                    : primarySeries.length
                      ? 'Primary evidence only'
                      : 'Comparison evidence only'}
                </span>
              )}
            </div>
            <CompensationCurrencyChart
              currency={currency}
              primaryName={primaryName}
              primary={primarySeries}
              comparisonName={comparisonName}
              comparison={comparisonSeries}
              evaluationMarkers={evaluationMarkers}
            />
          </section>
        )
      })}
    </div>
  )
}
