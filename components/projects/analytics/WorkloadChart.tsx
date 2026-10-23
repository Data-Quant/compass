'use client'

import { UserAvatar } from '@/components/composed/UserAvatar'
import type { ProjectAnalytics } from './types'
import { BAR_ROW, OPEN_WORK } from './chart-theme'
import { ChartCard, ChartEmpty, Legend, MarkTip, SrTable } from './ChartCard'

export function WorkloadChart({ workload }: { workload: ProjectAnalytics['workload'] }) {
  const max = Math.max(...workload.map((row) => row.total), 1)
  const describe = (row: ProjectAnalytics['workload'][number]) => (
    OPEN_WORK.map((part) => `${row[part.key]} ${part.label.toLowerCase()}`).join(', ')
  )

  return (
    <ChartCard
      id="workload"
      title="Open work by person"
      description="What's on each person's plate now, as assignee or co-assignee. Sorted by name, never by count."
      aside={<Legend items={OPEN_WORK.map((part) => ({ label: part.label, color: part.color }))} />}
    >
      {workload.length === 0 ? (
        <ChartEmpty title="No open work assigned" description="Open tasks with an assignee or co-assignee show here." />
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {workload.map((row) => (
              <li key={row.userId}>
                <MarkTip
                  title={row.name}
                  rows={OPEN_WORK.map((part) => ({ label: part.label, value: row[part.key], color: part.color, kind: 'rect' as const }))}
                >
                  <div
                    aria-label={`${row.name}: ${row.total} open. ${describe(row)}`}
                    className={`${BAR_ROW} grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[180px_1fr_64px]`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <UserAvatar name={row.name} size="xs" title="" />
                      <span className="truncate text-foreground">{row.name}</span>
                    </span>
                    <span className="col-span-2 row-start-2 flex h-4 gap-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                      {OPEN_WORK.filter((part) => row[part.key] > 0).map((part) => (
                        <span
                          key={part.key}
                          className="block h-full rounded"
                          style={{ width: `${(row[part.key] / max) * 100}%`, background: part.color }}
                        />
                      ))}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground sm:col-start-3 sm:row-start-1">{row.total} open</span>
                  </div>
                </MarkTip>
              </li>
            ))}
          </ul>
          <SrTable
            caption="Open work by person"
            headers={['Person', ...OPEN_WORK.map((part) => part.label), 'Total']}
            rows={workload.map((row) => [row.name, ...OPEN_WORK.map((part) => row[part.key]), row.total])}
          />
        </>
      )}
    </ChartCard>
  )
}
