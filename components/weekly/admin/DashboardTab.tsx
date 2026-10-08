'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { CoverageView, DashboardResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CyclePicker, useCycles } from './PeopleTab'

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="font-semibold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

function CoverageTable({ rows }: { rows: CoverageView[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nobody.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground"><th className="py-1">Person</th><th>Group</th><th>Topics answered</th><th>Evaluators contributing</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.evaluatee.id}-${r.perspective}`} className="border-t">
            <td className="py-1">{r.evaluatee.name}</td>
            <td>{PERSPECTIVE_LABELS[r.perspective]}</td>
            <td>{r.satisfied} of {r.total} ({percent(r.share)})</td>
            <td>{r.evaluatorsContributing}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DashboardTab() {
  const { cycles, cycleId, setCycleId } = useCycles()
  const [data, setData] = useState<DashboardResponse | null>(null)

  const load = useCallback(async () => {
    if (!cycleId) return
    try {
      setData(await weeklyRequest<DashboardResponse>(`/api/admin/weekly/dashboard?cycleId=${encodeURIComponent(cycleId)}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the dashboard'))
    }
  }, [cycleId])

  useEffect(() => {
    void load()
  }, [load])

  if (cycles.length === 0) return <p className="text-sm text-muted-foreground">Create a cycle in Setup to see the dashboard.</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  const low = data.coverage.filter((c) => c.lowEvidence)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Week {data.cycle.currentWeek} of {data.cycle.totalWeeks}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>Refresh</Button>
        </div>
      </div>
      <Section title="Low evidence">
        <p className="text-sm text-muted-foreground">Under 60% of a group’s topics have an answer. HR is emailed this list in week {Math.max(1, data.cycle.questionWeeks - 1)}.</p>
        <CoverageTable rows={low} />
      </Section>
      <Section title="Evaluators">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1">Evaluator</th><th>Asked</th><th>Answered</th><th>Not observed</th><th>Open</th><th>Overdue</th><th>Response rate</th></tr></thead>
          <tbody>
            {data.evaluators.map((e) => (
              <tr key={e.evaluator.id} className="border-t">
                <td className="py-1">{e.evaluator.name}</td><td>{e.released}</td><td>{e.answered}</td><td>{e.notObserved}</td><td>{e.open}</td><td>{e.overdue}</td><td>{percent(e.responseRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Evaluator drift">
        {data.drift.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evaluator’s scores sit far from their group’s average.</p>
        ) : (
          <ul className="text-sm">
            {data.drift.map((d) => (
              <li key={`${d.evaluator.id}-${d.perspective}`}>
                {d.evaluator.name} ({PERSPECTIVE_LABELS[d.perspective].toLowerCase()}): {d.difference > 0 ? '+' : ''}{d.difference.toFixed(2)} from the group average over {d.count} scores
              </li>
            ))}
          </ul>
        )}
      </Section>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">Coverage for everyone</summary>
        <div className="mt-3"><CoverageTable rows={data.coverage} /></div>
      </details>
    </div>
  )
}
