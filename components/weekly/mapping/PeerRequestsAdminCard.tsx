'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Clock, Mail, MessageCircleQuestion } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { MappingReasonCodeValue, PeerReplyValue, PeerRequestView } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'
import { errorMessage, weeklyRequest } from '../weekly-api'

/** How long a request has waited: "today", "1 day", "3 days". */
function waited(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days < 1 ? 'since today' : `${days} ${days === 1 ? 'day' : 'days'}`
}

const NOUN: Record<PeerRequestView['relation'], string> = { PEER: 'peer', LEAD: 'lead', REPORT: 'team member' }
const REASONS: Record<MappingReasonCodeValue, string> = { NO_LONGER_WORK_TOGETHER: 'No longer work together', WRONG_PERSON: 'Wrong person', OTHER: 'Other' }
const REPLIES: Record<PeerReplyValue, string> = { WORK_TOGETHER: 'says they work together', NOT_WORK_TOGETHER: 'says they don’t work together' }
const OUTCOME: Record<PeerRequestView['status'], string> = {
  PENDING: 'Open', NEEDS_INFO: 'Open', APPROVED: 'Applied', REJECTED: 'Declined', CANCELLED: 'Cancelled by them', EXPIRED: 'Expired at round start',
}

type View = 'HR' | 'LEAD' | 'REQUESTER' | 'DONE'
const VIEWS: Array<{ value: View; label: string; empty: string }> = [
  { value: 'HR', label: 'Ready for you', empty: 'Nothing waiting for your decision.' },
  { value: 'LEAD', label: 'With leads', empty: 'No requests waiting for a lead.' },
  { value: 'REQUESTER', label: 'Waiting on employee', empty: 'No open questions.' },
  { value: 'DONE', label: 'Done', empty: 'Nothing decided yet.' },
]
type NoteAction = { request: PeerRequestView; decision: 'REJECT' | 'NEEDS_INFO' }

function summary(r: PeerRequestView): string {
  return `${r.action === 'ADD' ? 'Add' : 'Remove'} ${r.peer.name} as their ${NOUN[r.relation]}`
}

/**
 * HR's change requests for the round. A team member's request reaches HR after their lead reviews it; someone with no
 * lead comes straight here. HR applies, declines with a reason, or asks the employee a question; HR can also decide a
 * request a lead has not reviewed yet.
 */
export function PeerRequestsAdminCard() {
  const [data, setData] = useState<{ period: { id: string; name: string } | null; requests: PeerRequestView[] } | null>(null)
  const [view, setView] = useState<View>('HR')
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

  const grouped = useMemo(() => {
    const groups: Record<View, PeerRequestView[]> = { HR: [], LEAD: [], REQUESTER: [], DONE: [] }
    for (const r of data?.requests ?? []) groups[r.stage].push(r)
    return groups
  }, [data])

  async function post(body: Record<string, unknown>, success: string): Promise<boolean> {
    setBusy(true)
    try {
      const result = await weeklyRequest<{ sent?: number }>('/api/admin/weekly/peer-requests', { method: 'POST', body })
      toast.success(typeof result.sent === 'number' && result.sent === 0 && body.action === 'resend' ? 'New links recorded (emails are off here)' : success)
      await load()
      return true
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function emailLists() {
    setBusy(true)
    try {
      const r = await weeklyRequest<{ sent: number; recorded: number }>('/api/admin/weekly/mapping-emails', { method: 'POST' })
      toast.success(r.sent > 0 ? `${r.sent} emails sent` : r.recorded > 0 ? `${r.recorded} emails recorded (emails are off here)` : 'Everyone was already emailed today')
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send the emails'))
    } finally {
      setBusy(false)
    }
  }

  if (!data?.period) return null
  const shown = grouped[view]
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Change requests · {data.period.name}</h2>
            <p className="text-sm text-muted-foreground">Requests from people with a lead come here after their lead reviews them. You make the final call. Changes apply to this round; to make one permanent, update the <a className="underline" href="/admin/mappings">mappings</a>.</p>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void emailLists()}><Mail className="mr-1.5 h-4 w-4" /> Email everyone their lists</Button>
        </div>

        <div role="tablist" aria-label="Requests" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {VIEWS.map((v) => (
            <button
              key={v.value} role="tab" type="button" aria-selected={view === v.value} onClick={() => setView(v.value)}
              className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', view === v.value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {v.label}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', v.value === 'HR' && grouped.HR.length > 0 ? 'bg-primary text-primary-foreground' : 'bg-background/60')}>{grouped[v.value].length}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{VIEWS.find((v) => v.value === view)?.empty}</p> : (
          <ul className="space-y-3">
            {shown.map((r) => (
              <li key={r.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm"><span className="font-semibold">{r.requester.name}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /><span>{summary(r)}</span></p>
                    <p className="text-xs text-muted-foreground">
                      Sent {formatKarachiDate(r.createdAt)}{r.stage !== 'DONE' ? ` · waiting ${waited(r.createdAt)}` : ''}{r.reasonCode ? ` · ${REASONS[r.reasonCode]}` : ''}
                    </p>
                  </div>
                  {r.stage === 'DONE' && <Badge variant={r.status === 'APPROVED' ? 'default' : 'outline'}>{OUTCOME[r.status]}</Badge>}
                  {r.overdue && <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700 dark:text-amber-400"><Clock className="h-3 w-3" /> Lead overdue</Badge>}
                </div>

                <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
                  {r.reason && <><dt className="text-muted-foreground">Their reason</dt><dd>“{r.reason}”</dd></>}
                  <dt className="text-muted-foreground">Lead</dt>
                  <dd>{leadLine(r)}</dd>
                  {r.relation === 'PEER' && <><dt className="text-muted-foreground">{r.peer.name}</dt><dd>{r.peerReply ? REPLIES[r.peerReply] : 'has not replied (optional)'}</dd></>}
                  {r.decisionNote && <><dt className="text-muted-foreground">{r.status === 'NEEDS_INFO' ? 'You asked' : r.status === 'REJECTED' ? 'Your reason' : 'Note'}</dt><dd>“{r.decisionNote}”</dd></>}
                  {r.answer && <><dt className="text-muted-foreground">They answered</dt><dd>“{r.answer}”</dd></>}
                </dl>

                {r.stage !== 'DONE' && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                    {r.stage === 'LEAD' && <span className="mr-auto text-xs text-muted-foreground">You can decide now without waiting for the lead.</span>}
                    {r.stage === 'LEAD' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void post({ requestId: r.id, action: 'resend' }, 'New link sent to the lead')}>Resend link</Button>}
                    {r.stage === 'HR' && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setNoting({ request: r, decision: 'NEEDS_INFO' }); setNote('') }}><MessageCircleQuestion className="mr-1.5 h-4 w-4" /> Ask a question</Button>}
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { setNoting({ request: r, decision: 'REJECT' }); setNote('') }}>Decline</Button>
                    <Button size="sm" disabled={busy} onClick={() => void post({ requestId: r.id, decision: 'APPROVE' }, 'Applied to this round')}>Apply</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {noting && (
        <Modal isOpen onClose={() => setNoting(null)} title={noting.decision === 'REJECT' ? 'Decline this request' : 'Ask a question'}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{noting.request.requester.name} · {summary(noting.request)}</p>
            <div className="space-y-1.5">
              <Label htmlFor="hr-note">{noting.decision === 'REJECT' ? 'Reason' : 'Your question'}</Label>
              <Textarea id="hr-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              <p className="text-xs text-muted-foreground">{noting.request.requester.name} sees this.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNoting(null)}>Cancel</Button>
              <Button disabled={busy || !note.trim()} onClick={() => void post({ requestId: noting.request.id, decision: noting.decision, note: note.trim() }, noting.decision === 'REJECT' ? 'Declined' : 'Question sent').then((ok) => ok && setNoting(null))}>
                {noting.decision === 'REJECT' ? 'Decline' : 'Send question'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}

function leadLine(r: PeerRequestView): string {
  if (!r.approver) return 'No lead to review: comes straight to you'
  if (r.approverVote === 'APPROVED') return `${r.approver.name} agreed${r.leadNote ? `: “${r.leadNote}”` : ''}`
  if (r.approverVote === 'REJECTED') return `${r.approver.name} disagreed: “${r.leadNote ?? ''}”`
  return r.stage === 'DONE' ? `${r.approver.name} did not review it` : `Waiting for ${r.approver.name}${r.overdue ? ' (reminded after 2 working days)' : ''}`
}
