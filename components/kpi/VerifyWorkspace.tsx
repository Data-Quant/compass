'use client'

import { useEffect, useState } from 'react'
import { currentMonthKey, monthLabel, shiftMonth } from '@/lib/kpi/format'
import type { VerifierViewResponse } from '@/lib/kpi/view-types'
import { DeadlineBanner } from './DeadlineBanner'
import { GoalList } from './GoalList'
import { PeriodSwitcher } from './PeriodSwitcher'
import { errorMessage, kpiRequest } from './kpi-api'

export function VerifyWorkspace() {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey())
  const [data, setData] = useState<VerifierViewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setData(null)
    kpiRequest<VerifierViewResponse>(`/api/kpi/verify/kpis?month=${monthKey}`)
      .then((value) => {
        if (active) {
          setData(value)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e, 'Could not load KPIs'))
      })
    return () => {
      active = false
    }
  }, [monthKey])

  const team = data?.goals.filter((goal) => goal.scope === 'TEAM') ?? []
  const departments = data?.goals.filter((goal) => goal.scope === 'DEPARTMENT') ?? []

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">KPI verification</h1>
        <p className="mt-1 text-muted-foreground">
          All KPIs set for the month. Claims to verify appear here after the month ends.
        </p>
      </div>
      <PeriodSwitcher label={monthLabel(monthKey)} onPrevious={() => setMonthKey(shiftMonth(monthKey, -1))} onNext={() => setMonthKey(shiftMonth(monthKey, 1))} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading KPIs…</p>}
      {data && (
        <>
          <DeadlineBanner month={data.month} />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Department KPIs</h2>
            <GoalList goals={departments} editable={false} emptyMessage="No department KPIs for this month." />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Team KPIs</h2>
            <GoalList goals={team} editable={false} emptyMessage="No team KPIs for this month." />
          </section>
        </>
      )}
    </div>
  )
}
