'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { currentMonthKey, formatKarachiDate, monthLabel, shiftMonth } from '@/lib/kpi/format'
import type { ResultsResponse, ResultsRow } from '@/lib/kpi/view-types'
import { KpiStatusBadge } from '../KpiStatusBadge'
import { PeriodSwitcher } from '../PeriodSwitcher'
import { errorMessage, kpiRequest } from '../kpi-api'
import { OverrideDialog } from './OverrideDialog'
import { ReasonPrompt } from './ReasonPrompt'

export function ResultsTab() {
  const [monthKey, setMonthKey] = useState(() => currentMonthKey())
  const [data, setData] = useState<ResultsResponse | null>(null)
  const [correcting, setCorrecting] = useState<ResultsRow | null>(null)
  const [reopening, setReopening] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await kpiRequest<ResultsResponse>(`/api/admin/kpi/results?month=${monthKey}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load results'))
    }
  }, [monthKey])

  useEffect(() => {
    setData(null)
    void load()
  }, [load])

  async function patchMonth(body: object, success: string): Promise<boolean> {
    if (!data?.month.id) return false
    try {
      await kpiRequest(`/api/admin/kpi/months/${data.month.id}`, { method: 'PATCH', body })
      toast.success(success)
      await load()
      return true
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update the month'))
      return false
    }
  }

  return (
    <div className="space-y-4">
      <PeriodSwitcher label={monthLabel(monthKey)} onPrevious={() => setMonthKey(shiftMonth(monthKey, -1))} onNext={() => setMonthKey(shiftMonth(monthKey, 1))} />
      {!data ? (
        <p className="text-sm text-muted-foreground">Loading results…</p>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="space-y-1">
                <p className="font-medium">
                  {data.month.finalizedAt ? `Final since ${formatKarachiDate(data.month.finalizedAt)}` : `Not final yet · due ${formatKarachiDate(data.month.targetFinalAt)}`}
                </p>
                <p className="text-muted-foreground">
                  {data.pending.verification} waiting for verification · {data.pending.changeRequests} change requests ·{' '}
                  <Link href="/kpis/verify" className="text-primary hover:underline">Open verification</Link>
                </p>
              </div>
              {data.month.id &&
                (data.month.finalizedAt ? (
                  <Button variant="outline" onClick={() => setReopening(true)}>Reopen month</Button>
                ) : (
                  <Button onClick={() => void patchMonth({ action: 'finalize' }, 'Month marked final')}>Mark final</Button>
                ))}
            </CardContent>
          </Card>
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No KPIs for this month.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="p-2">KPI</th><th className="p-2">Goal</th><th className="p-2">Owners</th><th className="p-2">Claimed by</th>
                    <th className="p-2">Result</th><th className="p-2">Execution note</th><th className="p-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.kpiId} className="border-b align-top last:border-0">
                      <td className="p-2 font-medium">{row.title}</td>
                      <td className="p-2">{row.goalTitle}{row.departmentLabel ? ` (${row.departmentLabel})` : ''}</td>
                      <td className="p-2">{row.owners.map((owner) => owner.name).join(', ')}</td>
                      <td className="p-2">{row.claimedBy?.name ?? '—'}</td>
                      <td className="p-2"><KpiStatusBadge status={row.status} /></td>
                      <td className="p-2">{row.decisionNote ?? ''}</td>
                      <td className="p-2 text-right">
                        {row.final && !data.month.finalizedAt && (
                          <Button size="sm" variant="ghost" aria-label={`Correct ${row.title}`} onClick={() => setCorrecting(row)}>Correct</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">To correct a result in a final month, reopen the month first. Corrections need a reason and are kept in the audit log.</p>
        </>
      )}
      {correcting && <OverrideDialog row={correcting} onClose={() => setCorrecting(null)} onDone={load} />}
      {reopening && (
        <ReasonPrompt
          title={`Reopen ${monthLabel(monthKey)}`}
          submitLabel="Reopen"
          onClose={() => setReopening(false)}
          onSubmit={async (reason) => {
            if (await patchMonth({ action: 'reopen', reason }, 'Month reopened')) setReopening(false)
          }}
        />
      )}
    </div>
  )
}
