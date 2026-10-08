'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { RoundResultsResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const EMAIL: Record<'PENDING' | 'SENT' | 'FAILED', string> = { PENDING: 'Queued', SENT: 'Sent', FAILED: 'Failed to send' }

/** UX spec, HR step 9: release all reports, or selected ones. Each report is generated and sent one at a time. */
export function RoundResultsCard({ periodId, onReleased }: { periodId: string; onReleased: () => Promise<void> }) {
  const [data, setData] = useState<RoundResultsResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<RoundResultsResponse>(`/api/admin/rounds/${periodId}/results`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the results'))
    }
  }, [periodId])
  useEffect(() => {
    void load()
  }, [load])

  async function release(ids: string[]) {
    setProgress({ done: 0, total: ids.length })
    let failed = 0
    for (const [i, employeeId] of ids.entries()) {
      try {
        await weeklyRequest(`/api/admin/rounds/${periodId}/results`, { method: 'POST', body: { action: 'release-report', employeeId } })
      } catch {
        failed += 1
      }
      setProgress({ done: i + 1, total: ids.length })
    }
    try {
      if (!data?.released) await weeklyRequest(`/api/admin/rounds/${periodId}/results`, { method: 'POST', body: { action: 'mark-released' } })
      toast[failed ? 'error' : 'success'](failed ? `${ids.length - failed} reports released, ${failed} failed` : `${ids.length} reports released`)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not mark the round released'))
    }
    setProgress(null)
    setSelected(new Set())
    await load()
    await onReleased()
  }

  if (!data) return null
  if (!data.closed) return null
  const unsent = data.rows.filter((r) => r.email?.status !== 'SENT').map((r) => r.person.id)
  const busy = progress !== null
  const toggle = (id: string, on: boolean) => setSelected((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next })
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Reports</h2>
            <p className="text-sm text-muted-foreground">
              {data.released ? `Released ${formatKarachiDate(data.released)}. ` : ''}Releasing a report generates it from the final scores and emails it to the person.
              {!data.emailsOn && ' Emails are off here, so reports are queued, not sent.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><a href={`/api/reports/export?periodId=${periodId}`}>Export Excel</a></Button>
            <Button variant="outline" disabled={busy || selected.size === 0} onClick={() => void release([...selected])}>Release selected ({selected.size})</Button>
            <Button disabled={busy || unsent.length === 0} onClick={() => void release(unsent)}>{busy ? `Releasing ${progress.done} of ${progress.total}…` : `Release all (${unsent.length})`}</Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/40 text-left"><th className="w-8 p-2"><span className="sr-only">Select</span></th><th className="p-2">Person</th><th className="p-2">Department</th><th className="p-2 text-right">Score</th><th className="p-2">Report</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.person.id} className="border-b last:border-0">
                  <td className="p-2"><Checkbox aria-label={`Select ${r.person.name}`} checked={selected.has(r.person.id)} onCheckedChange={(v) => toggle(r.person.id, v === true)} /></td>
                  <td className="p-2">{r.person.name}</td>
                  <td className="p-2 text-muted-foreground">{r.department ?? ''}</td>
                  <td className="p-2 text-right tabular-nums">{r.score === null ? '–' : r.score.toFixed(2)}</td>
                  <td className="p-2">
                    {r.email ? <Badge variant={r.email.status === 'SENT' ? 'default' : r.email.status === 'FAILED' ? 'destructive' : 'outline'}>{EMAIL[r.email.status]}</Badge> : <span className="text-muted-foreground">Not released</span>}
                    {r.score !== null && <a className="ml-2 text-xs underline" target="_blank" rel="noreferrer" href={`/api/reports?employeeId=${r.person.id}&periodId=${periodId}&format=html`}>View</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
