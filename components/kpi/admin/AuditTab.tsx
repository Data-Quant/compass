'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { STATUS_LABELS, currentMonthKey, formatKarachiDate, monthLabel, shiftMonth } from '@/lib/kpi/format'
import type { AuditRow, KpiStatusValue } from '@/lib/kpi/view-types'
import { PeriodSwitcher } from '../PeriodSwitcher'
import { errorMessage, kpiRequest } from '../kpi-api'

function statusLabel(value: string | null): string {
  if (!value) return ''
  return value in STATUS_LABELS ? STATUS_LABELS[value as KpiStatusValue] : value
}

export function AuditTab() {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey())
  const [rows, setRows] = useState<AuditRow[] | null>(null)

  useEffect(() => {
    let active = true
    setRows(null)
    kpiRequest<{ rows: AuditRow[] }>(`/api/admin/kpi/audit?month=${monthKey}`)
      .then((data) => {
        if (active) setRows(data.rows)
      })
      .catch((e: unknown) => toast.error(errorMessage(e, 'Could not load the audit log')))
    return () => {
      active = false
    }
  }, [monthKey])

  return (
    <div className="space-y-4">
      <PeriodSwitcher label={monthLabel(monthKey)} onPrevious={() => setMonthKey(shiftMonth(monthKey, -1))} onNext={() => setMonthKey(shiftMonth(monthKey, 1))} />
      <p className="text-xs text-muted-foreground">Newest first, up to 500 entries for the month. Nothing here can be edited or deleted.</p>
      {!rows ? (
        <p className="text-sm text-muted-foreground">Loading the audit log…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded for this month.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2">When</th><th className="p-2">Who</th><th className="p-2">Action</th><th className="p-2">KPI</th><th className="p-2">Status</th><th className="p-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap p-2">{formatKarachiDate(row.createdAt)}</td>
                  <td className="p-2">{row.actorName} <span className="text-xs text-muted-foreground">({row.actorRole})</span></td>
                  <td className="p-2">{row.action}</td>
                  <td className="p-2">{row.kpiTitle ?? ''}</td>
                  <td className="p-2">{row.fromStatus || row.toStatus ? `${statusLabel(row.fromStatus)} → ${statusLabel(row.toStatus)}` : ''}</td>
                  <td className="p-2">{row.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
