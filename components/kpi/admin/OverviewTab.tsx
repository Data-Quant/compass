'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { currentQuarterKey, formatPercent, monthLabel, quarterLabel, shiftQuarter } from '@/lib/kpi/format'
import type { OverviewResponse } from '@/lib/kpi/view-types'
import { PeriodSwitcher } from '../PeriodSwitcher'
import { errorMessage, kpiRequest } from '../kpi-api'

export function OverviewTab() {
  const [quarterKey, setQuarterKey] = useState(() => currentQuarterKey())
  const [data, setData] = useState<OverviewResponse | null>(null)

  useEffect(() => {
    let active = true
    setData(null)
    kpiRequest<OverviewResponse>(`/api/admin/kpi/overview?quarter=${quarterKey}`)
      .then((value) => {
        if (active) setData(value)
      })
      .catch((e: unknown) => toast.error(errorMessage(e, 'Could not load the overview')))
    return () => {
      active = false
    }
  }, [quarterKey])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSwitcher label={quarterLabel(quarterKey)} onPrevious={() => setQuarterKey(shiftQuarter(quarterKey, -1))} onNext={() => setQuarterKey(shiftQuarter(quarterKey, 1))} />
        <a href={`/api/admin/kpi/export?quarter=${quarterKey}`} download className="text-sm font-medium text-primary hover:underline">Download Excel</a>
      </div>
      {!data ? (
        <p className="text-sm text-muted-foreground">Loading overview…</p>
      ) : (
        <>
          {data.departmentsWithoutKpis.some((month) => month.departments.length > 0) && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Departments without KPIs</p>
              {data.departmentsWithoutKpis.map((month) =>
                month.departments.length ? (
                  <p key={month.monthKey}>{monthLabel(month.monthKey)}: {month.departments.join(', ')}</p>
                ) : null,
              )}
            </div>
          )}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-2">Person</th><th className="p-2">Department</th><th className="p-2">Measured on</th><th className="p-2">Setters</th><th className="p-2">KPI %</th><th className="p-2">Verified</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.person.id} className="border-b last:border-0">
                    <td className="p-2 font-medium">{row.person.name}</td>
                    <td className="p-2">{row.department ?? ''}</td>
                    <td className="p-2">{row.kind === 'LEAD_JP' ? 'Department KPIs' : 'Team KPIs'}</td>
                    <td className="p-2">{row.kind === 'LEAD_JP' ? '—' : row.setters.map((setter) => setter.name).join(', ') || 'None'}</td>
                    <td className="p-2">{formatPercent(row.percent.percent)}{row.percent.provisional ? ' (provisional)' : ''}</td>
                    <td className="p-2">{row.percent.verified} / {row.percent.counted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
