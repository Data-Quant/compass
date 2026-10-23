'use client'

import { UserAvatar } from '@/components/composed/UserAvatar'
import type { WorkspaceAnalytics } from './types'
import { ChartCard, ChartEmpty, Legend, MarkTip, SrTable } from './ChartCard'
import type { ProjectSeries } from './WorkspaceThroughputChart'

export function WorkspaceWorkloadChart({ workload, series, keyOf }: {
  workload: WorkspaceAnalytics['workload']
  series: ProjectSeries[]
  keyOf: (projectId: string) => string
}) {
  const max = Math.max(...workload.map((row) => row.total), 1)
  const rows = workload.map((row) => {
    const counts = new Map<string, number>()
    for (const entry of row.byProject) {
      const key = keyOf(entry.projectId)
      counts.set(key, (counts.get(key) ?? 0) + entry.count)
    }
    return { ...row, parts: series.map((entry) => ({ ...entry, count: counts.get(entry.key) ?? 0 })) }
  })
  const used = series.filter((entry) => rows.some((row) => row.parts.some((part) => part.key === entry.key && part.count > 0)))

  return (
    <ChartCard
      id="workspace-workload"
      title="Open work by person, across projects"
      description="Shows who is spread thin, as assignee or co-assignee. Sorted by name, never by count."
      aside={used.length > 0 ? <Legend items={used.map((entry) => ({ label: entry.label, color: entry.color }))} /> : undefined}
    >
      {rows.length === 0 ? (
        <ChartEmpty title="No open work assigned" description="Open tasks with an assignee or co-assignee show here." />
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {rows.map((row) => {
              const parts = row.parts.filter((part) => part.count > 0)
              return (
                <li key={row.userId}>
                  <MarkTip
                    title={`${row.name}: ${row.total} open`}
                    rows={parts.map((part) => ({ label: part.label, value: part.count, color: part.color, kind: 'rect' as const }))}
                  >
                    <div
                      tabIndex={0}
                      aria-label={`${row.name}: ${row.total} open. ${parts.map((part) => `${part.count} in ${part.label}`).join(', ')}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[160px_1fr_64px]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <UserAvatar name={row.name} size="xs" title="" />
                        <span className="truncate text-[13px] text-foreground">{row.name}</span>
                      </span>
                      <span className="col-span-2 row-start-2 flex h-4 gap-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                        {parts.map((part) => (
                          <span key={part.key} className="block h-full rounded" style={{ width: `${(part.count / max) * 100}%`, background: part.color }} />
                        ))}
                      </span>
                      <span className="text-right text-[13px] tabular-nums text-muted-foreground sm:col-start-3 sm:row-start-1">{row.total} open</span>
                    </div>
                  </MarkTip>
                </li>
              )
            })}
          </ul>
          <SrTable
            caption="Open work by person, across projects"
            headers={['Person', ...series.map((entry) => entry.label), 'Total']}
            rows={rows.map((row) => [row.name, ...row.parts.map((part) => part.count), row.total])}
          />
        </>
      )}
    </ChartCard>
  )
}
