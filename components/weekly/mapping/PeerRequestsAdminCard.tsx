'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { PeerRequestView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const VOTE: Record<PeerRequestView['peerVote'], string> = { PENDING: 'waiting', APPROVED: 'approved', REJECTED: 'declined' }
const NOUN: Record<PeerRequestView['relation'], string> = { PEER: 'peer', LEAD: 'lead', REPORT: 'team member' }

/** HR's view of the quarter's peer requests, with an override, and the button that emails everyone their mapping. */
export function PeerRequestsAdminCard() {
  const [data, setData] = useState<{ period: { id: string; name: string } | null; requests: PeerRequestView[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest('/api/admin/weekly/peer-requests'))
    } catch {
      setData(null)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function decide(requestId: string, decision: 'APPROVE' | 'REJECT') {
    try {
      await weeklyRequest('/api/admin/weekly/peer-requests', { method: 'POST', body: { requestId, decision } })
      toast.success(decision === 'APPROVE' ? 'Approved' : 'Rejected')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the decision'))
    }
  }

  async function resend(requestId: string) {
    try {
      const r = await weeklyRequest<{ sent: number; recorded: number }>('/api/admin/weekly/peer-requests', { method: 'POST', body: { requestId, action: 'resend' } })
      toast.success(r.sent > 0 ? 'New links sent' : 'New links recorded (emails are off here)')
    } catch (e) {
      toast.error(errorMessage(e, 'Could not resend the links'))
    }
  }

  async function emailMappings() {
    setBusy(true)
    try {
      const r = await weeklyRequest<{ sent: number; recorded: number; skipped: number }>('/api/admin/weekly/mapping-emails', { method: 'POST' })
      toast.success(r.sent > 0 ? `${r.sent} emails sent` : r.recorded > 0 ? `${r.recorded} emails recorded (emails are off here)` : 'Everyone was already emailed today')
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send the emails'))
    } finally {
      setBusy(false)
    }
  }

  if (!data?.period) return null
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Mapping requests · {data.period.name}</h2>
            <p className="text-sm text-muted-foreground">Everyone sees their lead, team and peers on their Evaluations page and can ask for corrections. A peer change takes effect once the peer and the employee’s lead approve; you decide lead and team changes here. An approved change applies to this quarter; to make it permanent, update the <a className="underline" href="/admin/mappings">mappings</a>.</p>
          </div>
          <Button disabled={busy} onClick={() => void emailMappings()}>{busy ? 'Sending…' : 'Email everyone their mapping'}</Button>
        </div>
        {data.requests.length === 0 ? <p className="text-sm text-muted-foreground">No peer requests yet.</p> : (
          <ul className="divide-y rounded-md border">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <p><span className="font-medium">{r.requester.name}</span> · {r.action === 'ADD' ? 'add' : 'remove'} <span className="font-medium">{r.peer.name}</span> as their {NOUN[r.relation]}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.relation !== 'PEER' ? 'HR decides' : <>{r.peer.name}: {VOTE[r.peerVote]} · {r.approver ? `${r.approver.name} (lead): ${VOTE[r.approverVote]}` : 'No lead: HR decides'}</>}
                    {r.reason ? ` · “${r.reason}”` : ''}
                  </p>
                </div>
                {r.status === 'PENDING' ? (
                  <span className="flex gap-2">
                    <Button size="sm" onClick={() => void decide(r.id, 'APPROVE')}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => void decide(r.id, 'REJECT')}>Reject</Button>
                    {r.relation === 'PEER' && <Button size="sm" variant="ghost" onClick={() => void resend(r.id)}>Resend links</Button>}
                  </span>
                ) : <Badge variant={r.status === 'APPROVED' ? 'default' : 'outline'}>{r.status.toLowerCase()}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
