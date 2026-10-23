'use client'

import type { ProjectAnalytics } from './types'
import { plural } from './chart-theme'
import { ChartCard, ChartEmpty, MarkTip, SrTable } from './ChartCard'

const LABELS: Record<string, string> = {
  '1-3': '1–3 days',
  '4-7': '4–7 days',
  '8-14': '8–14 days',
  '15-30': '15–30 days',
  '30+': 'Over 30 days',
}

export function AgingChart({ aging }: { aging: ProjectAnalytics['aging'] }) {
  const max = Math.max(...aging.map((bucket) => bucket.count), 1)
  const total = aging.reduce((sum, bucket) => sum + bucket.count, 0)

  return (
    <ChartCard id="aging" title="Overdue, by how late" description="Open tasks past their due date.">
      {total === 0 ? (
        <ChartEmpty className="h-[200px]" title="Nothing is overdue" description="Open tasks past their due date show here." />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {aging.map((bucket, index) => {
              const label = LABELS[bucket.label] ?? bucket.label
              const color = `var(--viz-age-${index})`
              return (
                <li key={bucket.label}>
                  <MarkTip title={`${label} late`} rows={[{ label: 'Open tasks', value: bucket.count, color, kind: 'rect' }]}>
                    <div
                      tabIndex={0}
                      aria-label={`${label} late: ${plural(bucket.count, 'task')}`}
                      className="grid grid-cols-[96px_1fr_28px] items-center gap-3 rounded-md px-1 py-1.5 text-[13px] transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="flex h-3.5 rounded bg-[var(--viz-track)]">
                        {bucket.count > 0 && (
                          <span className="block h-full rounded" style={{ width: `${(bucket.count / max) * 100}%`, background: color }} />
                        )}
                      </span>
                      <span className="text-right font-medium tabular-nums text-foreground">{bucket.count}</span>
                    </div>
                  </MarkTip>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Stronger colour means later. Late work still counts as completed when it&apos;s done.</p>
          <SrTable caption="Overdue tasks by days late" headers={['Days late', 'Tasks']} rows={aging.map((bucket) => [LABELS[bucket.label] ?? bucket.label, bucket.count])} />
        </>
      )}
    </ChartCard>
  )
}
