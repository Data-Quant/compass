'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import type { MappingReasonCodeValue, PeerReplyValue, PeerRequestView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const NOUN: Record<PeerRequestView['relation'], string> = { PEER: 'peer', LEAD: 'lead', REPORT: 'team member' }
const REASONS: Record<MappingReasonCodeValue, string> = { NO_LONGER_WORK_TOGETHER: 'No longer work together', WRONG_PERSON: 'Wrong person', OTHER: 'Other' }
const REPLIES: Record<PeerReplyValue, string> = { WORK_TOGETHER: 'says they work together', NOT_WORK_TOGETHER: 'says they don’t work together' }
const STATUS: Record<PeerRequestView['status'], string> = {
  PENDING: 'waiting', NEEDS_INFO: 'asked for more information', APPROVED: 'applied', REJECTED: 'declined', CANCELLED: 'cancelled', EXPIRED: 'expired',
}
const isOpen = (r: PeerRequestView) => r.status === 'PENDING' || r.status === 'NEEDS_INFO'

type NoteAction = { request: PeerRequestView; decision: 'REJECT' | 'NEEDS_INFO' }

function who(r: PeerRequestView): string {
  if (r.relation !== 'PEER') return 'HR decides'
  if (!r.approver) return 'No lead: HR decides'
  return `${r.approver.name} (lead) decides${r.approverVote === 'PENDING' ? '' : `: ${r.approverVote.toLowerCase()}`}`
}

/** HR's view of the round's list-change requests: apply, decline with a reason, or ask the requester for more. */
export function PeerRequestsAdminCard() {
  const [data, setData] = useState<{ period: { id: string; name: string } | null; requests: PeerRequestView[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [noting, setNoting] = useState<NoteAction | null>(null)
  const [note, setNote] = useState('')

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

  async function decide(requestId: string, decision: 'APPROVE' | 'REJECT' | 'NEEDS_INFO', text?: string): Promise<boolean> {
    setBusy(true)
    try {
      await weeklyRequest('/api/admin/weekly/peer-requests', { method: 'POST', body: { requestId, decision, ...(text ? { note: text } : {}) } })
      toast.success(decision === 'APPROVE' ? 'Applied' : decision === 'REJECT' ? 'Declined' : 'Question sent')
      await load()
      return true
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the decision'))
      return false
    } finally {
      setBusy(false)
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

  async function submitNote() {
    if (!noting) return
    if (await decide(noting.request.id, noting.decision, note.trim())) setNoting(null)
  }

  if (!data?.period) return null
  const overdue = data.requests.filter((r) => r.overdue).length
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">List change requests · {data.period.name}</h2>
            <p className="text-sm text-muted-foreground">
              The employee’s lead decides a peer change; the peer is told and may reply. You decide lead and team changes, and peer changes for anyone without a lead. A change applies to this quarter; to make it permanent, update the <a className="underline" href="/admin/mappings">mappings</a>.
            </p>
            {overdue > 0 && <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-400">{overdue} waiting on a lead for more than 2 working days. The lead was reminded; you can decide them yourself.</p>}
          </div>
          <Button disabled={busy} onClick={() => void emailMappings()}>{busy ? 'Sending…' : 'Email everyone their lists'}</Button>
        </div>
        {data.requests.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet.</p> : (
          <ul className="divide-y rounded-md border">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p>
                    <span className="font-medium">{r.requester.name}</span> · {r.action === 'ADD' ? 'add' : 'remove'} <span className="font-medium">{r.peer.name}</span> as their {NOUN[r.relation]}
                    {r.overdue && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700 dark:text-amber-400">Over 2 working days</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {who(r)}
                    {r.relation === 'PEER' && r.peerReply ? ` · ${r.peer.name} ${REPLIES[r.peerReply]}` : ''}
                    {r.reasonCode ? ` · ${REASONS[r.reasonCode]}` : ''}
                    {r.reason ? ` · “${r.reason}”` : ''}
                  </p>
                  {r.decisionNote && (r.status === 'NEEDS_INFO' || r.status === 'REJECTED') && <p className="text-xs text-muted-foreground">{r.status === 'NEEDS_INFO' ? 'You asked' : 'Reason'}: “{r.decisionNote}”</p>}
                  {r.answer && <p className="text-xs text-muted-foreground">{r.requester.name} answered: “{r.answer}”</p>}
                </div>
                {isOpen(r) ? (
                  <span className="flex flex-wrap gap-2">
                    {r.status === 'NEEDS_INFO' && <Badge variant="outline">Waiting for {r.requester.name}</Badge>}
                    <Button size="sm" disabled={busy} onClick={() => void decide(r.id, 'APPROVE')}>Apply</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { setNoting({ request: r, decision: 'REJECT' }); setNote('') }}>Decline</Button>
                    {r.status === 'PENDING' && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setNoting({ request: r, decision: 'NEEDS_INFO' }); setNote('') }}>Needs info</Button>}
                    {r.relation === 'PEER' && r.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => void resend(r.id)}>Resend links</Button>}
                  </span>
                ) : <Badge variant={r.status === 'APPROVED' ? 'default' : 'outline'}>{STATUS[r.status]}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {noting && (
        <Modal isOpen onClose={() => setNoting(null)} title={noting.decision === 'REJECT' ? 'Decline this request' : 'Ask for more information'}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hr-note">{noting.decision === 'REJECT' ? 'Reason' : 'Your question'} ({noting.request.requester.name} will see this)</Label>
              <Textarea id="hr-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNoting(null)}>Cancel</Button>
              <Button disabled={busy || !note.trim()} onClick={() => void submitNote()}>{noting.decision === 'REJECT' ? 'Decline' : 'Send question'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}
