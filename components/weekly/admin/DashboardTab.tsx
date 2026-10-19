'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import { cn } from '@/lib/utils'
import type { CoverageView, DashboardResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CyclePicker, NoRound, useCycles } from './PeopleTab'

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

/** A rate as a short bar and its percentage; low rates read amber so they stand out in a long table. */
function RateBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const tone = value >= 0.75 ? 'bg-emerald-500' : value >= 0.5 ? 'bg-primary' : 'bg-amber-500'
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn('block h-full origin-left rounded-full transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]', tone)} style={{ transform: `scaleX(${Math.min(1, value)})` }} />
      </span>
      <span className="w-10 tabular-nums">{percent(value)}</span>
    </span>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

function CoverageTable({ rows }: { rows: CoverageView[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nobody.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"><th className="pb-2">Person</th><th>Group</th><th>Topics answered</th><th>Evaluators contributing</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.evaluatee.id}-${r.perspective}`} className="border-t border-border/60">
            <td className="py-2">{r.evaluatee.name}</td>
            <td>{PERSPECTIVE_LABELS[r.perspective]}</td>
            <td><span className="flex items-center gap-2"><RateBar value={r.share} /><span className="text-muted-foreground">{r.satisfied} of {r.total}</span></span></td>
            <td>{r.evaluatorsContributing}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ProgressTable({ label, rows }: { label: string; rows: Array<{ key: string; name: string; asked: number; answered: number }> }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No questions yet.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"><th className="pb-2">{label}</th><th className="pb-2">Asked</th><th className="pb-2">Answered</th><th className="pb-2">Rate</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-border/60 tabular-nums"><td className="py-2">{r.name}</td><td>{r.asked}</td><td>{r.answered}</td><td><RateBar value={r.asked ? r.answered / r.asked : null} /></td></tr>
        ))}
      </tbody>
    </table>
  )
}

export function DashboardTab() {
  const { cycles, cycleId, setCycleId, loaded } = useCycles()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [reminding, setReminding] = useState(false)

  async function remind() {
    setReminding(true)
    try {
      const result = await weeklyRequest<{ sent: number; recorded: number; skipped: number }>('/api/admin/weekly/dashboard', { method: 'POST', body: { action: 'remind', cycleId } })
      const reached = result.sent + result.recorded
      toast.success(reached ? `Reminder sent to ${reached} ${reached === 1 ? 'person' : 'people'} with open questions` : 'Nobody new to remind today')
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send the reminders'))
    } finally {
      setReminding(false)
    }
  }

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

  if (!cycleId) return <NoRound loaded={loaded} />
  if (!data) {
    return (
      <div className="space-y-4" aria-label="Loading">
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted/60" />)}</div>
        <div className="h-56 animate-pulse rounded-2xl bg-muted/60" />
      </div>
    )
  }
  const low = data.coverage.filter((c) => c.lowEvidence)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Week {data.cycle.currentWeek} of {data.cycle.totalWeeks}</p>
          <Button variant="outline" size="sm" disabled={reminding} onClick={() => void remind()}>Send reminders</Button>
          <Button variant="outline" size="sm" onClick={() => void load()}>Refresh</Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="By week">
          <ProgressTable label="Week" rows={data.byWeek.map((w) => ({ key: String(w.week), name: `Week ${w.week}`, asked: w.asked, answered: w.answered }))} />
        </Section>
        <Section title="By department">
          <ProgressTable label="Department" rows={data.byDepartment.map((d) => ({ key: d.department, name: `${d.department} (${d.evaluators})`, asked: d.asked, answered: d.answered }))} />
        </Section>
      </div>
      {data.cycle.currentWeek >= Math.max(1, data.cycle.questionWeeks - 1) ? (
        <Section title="Low evidence">
          <p className="text-sm text-muted-foreground">Under 60% of a group’s topics have an answer. HR is emailed this list in week {Math.max(1, data.cycle.questionWeeks - 1)}.</p>
          <CoverageTable rows={low} />
        </Section>
      ) : (
        <details className="rounded-2xl border border-border/70 bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Low evidence: {low.length} {low.length === 1 ? 'group' : 'groups'} so far <span className="font-normal text-muted-foreground">(expected early; it matters from week {Math.max(1, data.cycle.questionWeeks - 1)})</span></summary>
          <div className="mt-3"><CoverageTable rows={low} /></div>
        </details>
      )}
      <Section title="Evaluators">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"><th className="pb-2">Evaluator</th><th className="pb-2">Asked</th><th className="pb-2">Answered</th><th className="pb-2">Not observed</th><th className="pb-2">Open</th><th className="pb-2">Overdue</th><th className="pb-2">Response rate</th></tr></thead>
          <tbody>
            {data.evaluators.map((e) => (
              <tr key={e.evaluator.id} className="border-t border-border/60 tabular-nums">
                <td className="py-2 font-medium">{e.evaluator.name}</td><td>{e.released}</td><td>{e.answered}</td><td>{e.notObserved}</td><td>{e.open}</td>
                <td>{e.overdue > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{e.overdue}</span> : 0}</td>
                <td><RateBar value={e.responseRate} /></td>
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
      <details className="rounded-2xl border border-border/70 bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Coverage for everyone</summary>
        <div className="mt-3"><CoverageTable rows={data.coverage} /></div>
      </details>
    </div>
  )
}
