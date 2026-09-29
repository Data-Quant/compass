'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { currentQuarterKey, formatPercent, monthLabel, quarterLabel, shiftQuarter } from '@/lib/kpi/format'
import type { MyViewResponse } from '@/lib/kpi/view-types'
import { KpiStatusBadge } from './KpiStatusBadge'
import { PeriodSwitcher } from './PeriodSwitcher'
import { errorMessage, kpiRequest } from './kpi-api'

export function MyKpisPanel() {
  const [quarterKey, setQuarterKey] = useState(() => currentQuarterKey())
  const [data, setData] = useState<MyViewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setData(null)
    kpiRequest<MyViewResponse>(`/api/kpi/my?quarter=${quarterKey}`)
      .then((value) => {
        if (active) {
          setData(value)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e, 'Could not load your KPIs'))
      })
    return () => {
      active = false
    }
  }, [quarterKey])

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
                {monthKpis.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No KPIs for this month.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {monthKpis.map((kpi) => (
                      <li key={kpi.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">{kpi.title}</p>
                          <p className="text-sm">Target: {kpi.target}</p>
                          <p className="text-xs text-muted-foreground">
                            {kpi.scope === 'DEPARTMENT' ? 'Department goal' : 'Team goal'}: {kpi.goalTitle}
                          </p>
                        </div>
                        <KpiStatusBadge status={kpi.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
