'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LeadHistoryResponse } from '@/lib/kpi/view-types'
import { errorMessage, kpiRequest } from '../kpi-api'

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

export function LeadHistoryTab() {
  const [data, setData] = useState<LeadHistoryResponse | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async (range?: { from: string; to: string }) => {
    try {
      const query = range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : ''
      const result = await kpiRequest<LeadHistoryResponse>(`/api/kpi/verify/lead-history${query}`)
      setData(result)
      setFrom(result.fromMonth)
      setTo(result.toMonth)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the lead history'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function submit(event: FormEvent) {
    event.preventDefault()
    void load({ from, to })
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="history-from">From</Label><Input id="history-from" type="month" value={from} onChange={(e) => setFrom(e.target.value)} required /></div>
        <div className="space-y-1"><Label htmlFor="history-to">To</Label><Input id="history-to" type="month" value={to} onChange={(e) => setTo(e.target.value)} required /></div>
        <Button type="submit" variant="outline">Show</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Rejection rate = claims rejected at their first decision ÷ claims decided. A lead is flagged at 25% or more with at least four decided claims.
      </p>
      {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : data.rows.length === 0 ? <p className="text-sm">No KPIs in these months.</p> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Lead</th><th>Locked</th><th>Claimed done</th><th>Not done</th><th>Verified</th><th>Needs info</th>
              <th>Rejected at first decision</th><th>Appealed</th><th>Finally not verified</th><th />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.lead.id} className="border-t">
                <td className="py-1">{row.lead.name}</td>
                <td>{row.locked}</td>
                <td>{row.claimedDone} ({percent(row.claimRate)})</td>
                <td>{row.claimedNotDone}</td>
                <td>{row.verified}</td>
                <td>{row.needsInfo}</td>
                <td>{row.rejectedAtFirstDecision} of {row.decided} ({percent(row.rejectionRate)})</td>
                <td>{row.appealed}</td>
                <td>{row.finallyNotVerified}</td>
                <td>{row.flagged && <Badge variant="destructive">High rejection rate</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
