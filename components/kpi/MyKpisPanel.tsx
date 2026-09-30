'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { currentQuarterKey, formatPercent, monthLabel, quarterLabel, shiftQuarter } from '@/lib/kpi/format'
import type { MyKpi, MyViewResponse } from '@/lib/kpi/view-types'
import { KpiTable, type KpiTableGoal } from './KpiTable'
import { PeriodSwitcher } from './PeriodSwitcher'
import { errorMessage, kpiRequest } from './kpi-api'

/** My KPIs grouped under their goals, in the order they come. */
function byGoal(kpis: MyKpi[]): KpiTableGoal[] {
  const goals = new Map<string, KpiTableGoal>()
  for (const kpi of kpis) {
    const goal = goals.get(kpi.goalId) ?? { id: kpi.goalId, title: kpi.goalTitle, subtitle: kpi.scope === 'DEPARTMENT' ? 'Department goal' : 'Team goal', kpis: [] }
    goals.set(kpi.goalId, { ...goal, kpis: [...goal.kpis, kpi] })
  }
  return [...goals.values()]
}

export function MyKpisPanel() {
  const [quarterKey, setQuarterKey] = useState(() => currentQuarterKey())
  const [data, setData] = useState<MyViewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The quarter switcher works while a load is in flight: only the latest request may set data.
  const latest = useRef(0)

  const load = useCallback(async () => {
    const request = ++latest.current
    try {
      const next = await kpiRequest<MyViewResponse>(`/api/kpi/my?quarter=${quarterKey}`)
      if (request !== latest.current) return
      setData(next)
      setError(null)
    } catch (e) {
      if (request === latest.current) setError(errorMessage(e, 'Could not load your KPIs'))
    }
  }, [quarterKey])

  useEffect(() => {
    setData(null)
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <PeriodSwitcher label={quarterLabel(quarterKey)} onPrevious={() => setQuarterKey(shiftQuarter(quarterKey, -1))} onNext={() => setQuarterKey(shiftQuarter(quarterKey, 1))} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading your KPIs…</p>}
      {data && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-baseline gap-x-6 gap-y-1 p-4">
              <span className="text-3xl font-semibold">{formatPercent(data.percent.percent)}</span>
              <span className="text-sm text-muted-foreground">
                {data.percent.verified} of {data.percent.counted} KPIs verified
                {data.percent.provisional ? ' · results still coming in' : ''}
              </span>
            </CardContent>
          </Card>
          {data.months.map((month) => {
            const monthKpis = data.kpis.filter((kpi) => kpi.monthKey === month.monthKey)
            return (
              <section key={month.monthKey} className="space-y-2">
                <h3 className="font-semibold">{monthLabel(month.monthKey)}</h3>
                <KpiTable goals={byGoal(monthKpis)} emptyMessage="No KPIs for this month." onChanged={load} />
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
