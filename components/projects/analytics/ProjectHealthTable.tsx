'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { WorkspaceAnalytics } from './types'
import { plural } from './chart-theme'
import { MarkTip } from './ChartCard'

type Row = WorkspaceAnalytics['projects'][number]
type SortKey = 'name' | 'progress' | 'open' | 'overdue' | 'completed' | 'status' | 'recent'

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', ON_HOLD: 'On hold', COMPLETED: 'Completed', ARCHIVED: 'Archived' }
const STATUS_ORDER = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'name', label: 'Project' },
  { key: 'progress', label: 'Progress' },
  { key: 'open', label: 'Open', numeric: true },
  { key: 'overdue', label: 'Overdue', numeric: true },
  { key: 'completed', label: 'Completed', numeric: true },
  { key: 'status', label: 'Status' },
  { key: 'recent', label: 'Completed per week, last 12 weeks' },
]

function compare(a: Row, b: Row, key: SortKey) {
  if (key === 'name') return a.name.localeCompare(b.name)
  if (key === 'status') return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  if (key === 'recent') return sum(a.sparkline) - sum(b.sparkline)
  return (a[key] ?? -1) - (b[key] ?? -1)
}

function Sparkline({ values, color, weeks }: { values: number[]; color: string; weeks: WorkspaceAnalytics['weeks'] }) {
  const width = 120
  const height = 28
  const max = Math.max(...values, 1)
  const step = (width - 8) / Math.max(values.length - 1, 1)
  const points = values.map((value, i) => [4 + i * step, height - 4 - (value / max) * (height - 8)] as const)
  const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const total = sum(values)
  const peak = Math.max(...values)
  return (
    <MarkTip
      title="Last 12 weeks"
      rows={[
        { label: 'Completed', value: total },
        { label: `Week of ${weeks[weeks.length - 1]?.label ?? ''}`, value: values[values.length - 1] ?? 0 },
        { label: 'Busiest week', value: peak },
      ]}
    >
      <span
        role="img"
        aria-label={`Completed per week, last 12 weeks, oldest first: ${values.join(', ')}. ${total} in total.`}
        className="inline-flex rounded"
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {last && <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke="hsl(var(--card))" strokeWidth={2} />}
        </svg>
      </span>
    </MarkTip>
  )
}

export function ProjectHealthTable({ rows, weeks, colorOf }: {
  rows: Row[]
  weeks: WorkspaceAnalytics['weeks']
  colorOf: (projectId: string) => string
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const sorted = [...rows].sort((a, b) => compare(a, b, sort.key) * sort.dir || a.name.localeCompare(b.name))
  const pick = (key: SortKey) => setSort((current) => ({ key, dir: current.key === key ? (current.dir === 1 ? -1 : 1) : 1 }))

  return (
    <Card role="region" aria-labelledby="health-title" className="min-w-0 overflow-hidden">
      <div className="px-5 pb-3 pt-5">
        <h2 id="health-title" className="text-base font-semibold text-foreground">Project health</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Select a column header to sort. Select a project to open its analytics page.</p>
      </div>
      <div tabIndex={0} role="group" aria-label="Project health table, scrolls sideways" className="relative overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <caption className="sr-only">Project health, sorted by {COLUMNS.find((column) => column.key === sort.key)?.label.toLowerCase()}, {sort.dir === 1 ? 'ascending' : 'descending'}</caption>
          <thead>
            <tr className="border-y border-border bg-muted/40 text-left text-xs text-muted-foreground">
              {COLUMNS.map((column) => {
                const active = sort.key === column.key
                const Icon = !active ? ChevronsUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    className={cn('whitespace-nowrap px-3 py-2 font-medium first:pl-5 last:pr-5', column.numeric && 'text-right')}
                  >
                    <button
                      type="button"
                      onClick={() => pick(column.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1 py-0.5 -mx-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active && 'text-foreground',
                      )}
                    >
                      {column.label}
                      <Icon aria-hidden="true" className={cn('h-3.5 w-3.5', !active && 'opacity-50')} />
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const color = colorOf(row.projectId)
              return (
                <tr key={row.projectId} className="border-b border-border last:border-0 transition-colors hover:bg-muted/30">
                  <th scope="row" className="max-w-[260px] px-3 py-2.5 pl-5 text-left font-medium">
                    <Link
                      href={`/projects/${row.projectId}/analytics`}
                      className="inline-flex min-w-0 max-w-full items-center gap-2 rounded text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
                      <span className="truncate">{row.name}</span>
                    </Link>
                  </th>
                  <td className="px-3 py-2.5">
                    {row.progress === null ? (
                      <span className="text-muted-foreground">No tasks yet</span>
                    ) : (
                      <span className="inline-flex items-center gap-2 tabular-nums text-foreground">
                        <span aria-hidden="true" className="block h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full" style={{ width: `${row.progress}%`, background: color }} />
                        </span>
                        {row.progress}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.open}</td>
                  <td className={cn('px-3 py-2.5 text-right tabular-nums', row.overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                    {row.overdue ? `${row.overdue} overdue` : 'None'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{row.completed}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 pr-5">
                    <Sparkline values={row.sparkline} color={color} weeks={weeks} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[11px] text-muted-foreground">
        {plural(rows.length, 'project')}. Completed counts the selected range; the sparkline always covers the last 12 weeks.
      </p>
    </Card>
  )
}
