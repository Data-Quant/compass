'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertCircle, ArrowDownRight, ArrowUpRight, CalendarDays, Sparkles, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  CompensationEventType,
  HistoricalCompensationEventMarker,
  HistoricalCompensationEmployee,
  HistoricalCompensationEvent,
  HistoricalCompensationPayload,
} from '@/lib/analytics/historical-compensation'
import { buildHistoricalCompensationEventMarkers } from '@/lib/analytics/historical-compensation'

const ALL_EMPLOYEES = 'all'
const SELECTED_SERIES_COLOR = '#8b5cf6'
const DATE_AXIS_PADDING_MS = 31 * 24 * 60 * 60 * 1000
const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))', fontSize: 13 }
const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '10px',
  color: 'hsl(var(--foreground))',
}

function dateLabel(value: string | number): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function fullDateLabel(value: string | number): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function money(value: number, currency: string, compact = false): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: 0,
  }).format(value)
}

function seriesColor(index: number, total: number): string {
  if (total <= 1) return SELECTED_SERIES_COLOR
  const hue = Math.round((index * 317.5) % 360)
  return `hsl(${hue} 72% 56%)`
}

function eventTone(type: CompensationEventType): string {
  if (type === 'PROMOTION') return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300'
  if (type === 'PAY_INCREASE' || type === 'BONUS_INCREASE') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (type === 'PAY_DECREASE' || type === 'BONUS_DECREASE') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
  return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300'
}

function CompensationTooltip({ active, payload, label, currency }: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>
  label?: number
  currency: string
}) {
  if (!active || !payload?.length) return null

  const marker = payload.find(
    (item) => Array.isArray(item.payload?.events)
  )?.payload as HistoricalCompensationEventMarker | undefined
  if (marker) {
    return (
      <div style={TOOLTIP_STYLE} className="max-w-sm p-3 text-sm shadow-lg">
        <p className="font-semibold">{marker.employeeName}</p>
        <p className="text-xs text-muted-foreground">{fullDateLabel(marker.timestamp)}</p>
        <div className="mt-2 space-y-2 border-t pt-2">
          {marker.events.map((event) => (
            <div key={event.id}>
              <p className="text-xs font-medium">{event.title}</p>
              {event.delta !== null && event.currency ? (
                <p className="text-xs text-muted-foreground">
                  {event.delta > 0 ? '+' : ''}{money(event.delta, event.currency)}
                </p>
              ) : null}
              {event.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{event.detail}</p> : null}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const event = payload.find((item) => typeof item.payload?.type === 'string')?.payload
  if (event) {
    return (
      <div style={TOOLTIP_STYLE} className="max-w-xs p-3 text-sm shadow-lg">
        <p className="font-semibold">{String(event.title)}</p>
        <p className="text-xs text-muted-foreground">{fullDateLabel(String(event.effectiveFrom))}</p>
        {event.detail ? <p className="mt-1 text-xs">{String(event.detail)}</p> : null}
      </div>
    )
  }

  return (
    <div style={TOOLTIP_STYLE} className="max-h-72 min-w-48 overflow-y-auto p-3 text-sm shadow-lg">
      <p className="mb-2 font-semibold">{dateLabel(label ?? '')}</p>
      <div className="space-y-1">
        {payload
          .filter((item) => typeof item.value === 'number')
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((item) => (
            <div key={`${item.name}-${item.value}`} className="flex items-center justify-between gap-5 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                <span className="truncate">{item.name}</span>
              </span>
              <span className="font-medium tabular-nums">{money(item.value!, currency)}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

function MetricCard({ label, value, detail, icon: Icon }: {
  label: string
  value: string
  detail: string
  icon: typeof Users
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
      </CardContent>
    </Card>
  )
}

export function HistoricalCompensationTab() {
  const [data, setData] = useState<HistoricalCompensationPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [employeeId, setEmployeeId] = useState(ALL_EMPLOYEES)
  const [currency, setCurrency] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/admin/analytics/historical-compensation')
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to load compensation history')
        if (cancelled) return
        setData(payload)
        setCurrency(payload.summary.currencies[0] ?? '')
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Failed to load compensation history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const employeesWithHistory = useMemo(
    () => data?.employees.filter((employee) => employee.points.length > 0) ?? [],
    [data]
  )
  const selectedEmployee = employeeId === ALL_EMPLOYEES
    ? null
    : employeesWithHistory.find((employee) => employee.id === employeeId) ?? null
  const visibleEmployees = selectedEmployee
    ? [selectedEmployee]
    : employeesWithHistory.filter((employee) => employee.currencies.includes(currency))

  const chartData = useMemo(() => {
    const rows = new Map<number, Record<string, string | number>>()
    for (const employee of visibleEmployees) {
      for (const point of employee.points.filter((entry) => entry.currency === currency)) {
        const timestamp = new Date(point.effectiveFrom).getTime()
        const row = rows.get(timestamp) ?? { timestamp }
        row[employee.id] = point.baseSalary
        rows.set(timestamp, row)
      }
    }
    return [...rows.values()].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
  }, [currency, visibleEmployees])

  const visibleEvents = useMemo(() => {
    const rows: Array<HistoricalCompensationEvent & { employee: HistoricalCompensationEmployee }> = []
    for (const employee of visibleEmployees) {
      for (const event of employee.events) {
        if (event.currency && event.currency !== currency) continue
        rows.push({ ...event, employee })
      }
    }
    return rows.sort(
      (a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    )
  }, [currency, visibleEmployees])

  const markerData = useMemo(
    () => buildHistoricalCompensationEventMarkers(visibleEmployees, currency),
    [currency, visibleEmployees]
  )
  const markerSeries = selectedEmployee
    ? [{
        employee: selectedEmployee,
        color: SELECTED_SERIES_COLOR,
        markers: markerData.filter((marker) => marker.employeeId === selectedEmployee.id),
      }]
    : []

  const chartTimestamps = [
    ...chartData.map((row) => Number(row.timestamp)),
    ...(selectedEmployee ? markerData.map((marker) => marker.timestamp) : []),
  ].filter(Number.isFinite)
  const xDomain: [number | 'dataMin', number | 'dataMax'] = chartTimestamps.length > 0
    ? [
        Math.min(...chartTimestamps) - DATE_AXIS_PADDING_MS,
        Math.max(...chartTimestamps) + DATE_AXIS_PADDING_MS,
      ]
    : ['dataMin', 'dataMax']

  const visibleBaseSalaries = visibleEmployees.flatMap((employee) =>
    employee.points
      .filter((point) => point.currency === currency)
      .map((point) => point.baseSalary)
  )
  const yDomain: [number | 'auto', number | 'auto'] = (() => {
    if (!selectedEmployee || visibleBaseSalaries.length === 0) return [0, 'auto']
    const minimum = Math.min(...visibleBaseSalaries)
    const maximum = Math.max(...visibleBaseSalaries)
    const spread = Math.max(maximum - minimum, maximum * 0.08, 1)
    return [Math.max(0, Math.floor(minimum - spread * 0.45)), Math.ceil(maximum + spread * 0.45)]
  })()

  function changeEmployee(nextId: string) {
    setEmployeeId(nextId)
    if (nextId === ALL_EMPLOYEES) return
    const employee = employeesWithHistory.find((entry) => entry.id === nextId)
    if (employee && !employee.currencies.includes(currency)) {
      setCurrency(employee.currencies[0] ?? '')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-28" />)}
        </div>
        <Skeleton className="h-[430px]" />
      </div>
    )
  }

  if (!data || data.summary.currencies.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No finalized compensation history yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This view fills in once payroll receipts are finalized and linked to employees.
          </p>
        </CardContent>
      </Card>
    )
  }

  const latestPoint = visibleEmployees
    .flatMap((employee) => employee.points.filter((point) => point.currency === currency))
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="History coverage"
          value={`${data.summary.employeesWithHistory}/${data.summary.employeeCount}`}
          detail="People with finalized payroll history"
          icon={Users}
        />
        <MetricCard
          label="Events in view"
          value={String(visibleEvents.length)}
          detail={selectedEmployee ? selectedEmployee.name : `${visibleEmployees.length} people in ${currency}`}
          icon={Sparkles}
        />
        <MetricCard
          label="Latest payroll"
          value={latestPoint ? dateLabel(latestPoint.effectiveFrom) : '—'}
          detail={latestPoint?.periodName ?? 'No period in this view'}
          icon={CalendarDays}
        />
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="gap-6 border-b border-border/60 bg-muted/10 px-6 py-6 lg:flex-row lg:items-center lg:justify-between lg:space-y-0 xl:px-8">
          <div>
            <CardTitle className="text-xl tracking-tight">Historical compensation</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-sm leading-6">
              {selectedEmployee
                ? `Base salary history for ${selectedEmployee.name}. Diamonds mark compensation events on the salary line.`
                : `Company-wide base salary history for ${visibleEmployees.length} people. Select a person to focus the chart and reveal event markers.`}
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <Select value={employeeId} onValueChange={changeEmployee}>
              <SelectTrigger className="h-11 w-full rounded-xl bg-background sm:w-[300px]">
                <SelectValue placeholder="Choose an employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_EMPLOYEES}>All people</SelectItem>
                {employeesWithHistory.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}{employee.isPayrollActive ? '' : ' (archived)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-11 w-full rounded-xl bg-background sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {data.summary.currencies.map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-5 pt-6 sm:px-5 xl:px-7 xl:pb-7">
          {chartData.length > 0 ? (
            <>
              {selectedEmployee && latestPoint ? (
                <div className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 px-3 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Current base</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{money(latestPoint.baseSalary, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest bonus</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{money(latestPoint.bonus, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Events</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{visibleEvents.length}</p>
                  </div>
                </div>
              ) : null}
              <div className="h-[470px] w-full rounded-2xl bg-muted/[0.025] sm:h-[520px] xl:h-[570px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 22, right: 32, bottom: 18, left: 16 }}>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="2 8"
                    stroke="hsl(var(--border))"
                    strokeOpacity={0.75}
                  />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={xDomain}
                    tick={AXIS_TICK}
                    tickFormatter={dateLabel}
                    minTickGap={48}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={14}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    tickFormatter={(value) => money(Number(value), currency, true)}
                    width={92}
                    domain={yDomain}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={12}
                    tickCount={6}
                  />
                  <Tooltip
                    content={<CompensationTooltip currency={currency} />}
                    cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.2 }}
                  />
                  {visibleEmployees.map((employee, index) => (
                    <Line
                      key={employee.id}
                      type="stepAfter"
                      dataKey={employee.id}
                      name={employee.name}
                      stroke={seriesColor(index, visibleEmployees.length)}
                      strokeWidth={selectedEmployee ? 4 : 1.75}
                      strokeOpacity={selectedEmployee ? 1 : 0.72}
                      dot={false}
                      activeDot={{ r: selectedEmployee ? 6 : 4, strokeWidth: 2 }}
                      connectNulls
                      animationDuration={700}
                    />
                  ))}
                  {markerSeries.map((series) => series.markers.length > 0 ? (
                    <Scatter
                      key={`${series.employee.id}:events`}
                      name={`${series.employee.name} events`}
                      data={series.markers}
                      dataKey="anchorAmount"
                      fill={series.color}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                      shape="diamond"
                    />
                  ) : null)}
                </ComposedChart>
              </ResponsiveContainer>
              </div>
              {!selectedEmployee && visibleEmployees.length > 0 ? (
                <div className="mx-3 mt-4 flex items-center justify-between gap-4 border-t border-border/60 pt-4 text-xs text-muted-foreground">
                  <span>{visibleEmployees.length} employee histories shown</span>
                  <span>Use the employee selector to inspect one line and its events</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="py-20 text-center text-sm text-muted-foreground">No {currency} history for this selection.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compensation events</CardTitle>
          <CardDescription>
            Promotions and role changes come from recorded salary-revision notes. Pay and bonus changes are calculated from consecutive finalized payroll periods.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visibleEvents.length > 0 ? (
            <div className="grid max-h-[760px] gap-3 overflow-y-auto pr-2 lg:grid-cols-2">
              {visibleEvents.map((event) => {
                const increasing = event.delta !== null && event.delta > 0
                const ChangeIcon = increasing ? ArrowUpRight : ArrowDownRight
                return (
                  <div key={`${event.employee.id}:${event.id}`} className="flex gap-3 rounded-lg border p-4">
                    <div className={`mt-0.5 rounded-lg border p-2 ${eventTone(event.type)}`}>
                      {event.type === 'PAY_INCREASE' || event.type === 'PAY_DECREASE' || event.type === 'BONUS_INCREASE' || event.type === 'BONUS_DECREASE'
                        ? <ChangeIcon className="h-4 w-4" />
                        : <Sparkles className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{event.title}</p>
                        <Badge variant="outline">{event.employee.name}</Badge>
                        <Badge variant="secondary">
                          {event.source === 'SALARY_REVISION' ? 'Recorded' : 'Derived from payroll'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fullDateLabel(event.effectiveFrom)}
                        {event.delta !== null && event.currency
                          ? ` · ${event.delta > 0 ? '+' : ''}${money(event.delta, event.currency)}`
                          : ''}
                      </p>
                      {event.detail ? <p className="mt-2 text-sm">{event.detail}</p> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">No recorded changes in this view.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
