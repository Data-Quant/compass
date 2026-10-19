'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { MappingReasonCodeValue, MappingRelationValue, PeerReplyValue, PeerRequestTokenView } from '@/lib/weekly/view-types'

const REASONS: Record<MappingReasonCodeValue, string> = { NO_LONGER_WORK_TOGETHER: 'They no longer work together', WRONG_PERSON: 'Wrong person', OTHER: 'Other' }
const REPLIES: Record<PeerReplyValue, string> = { WORK_TOGETHER: 'We do work together', NOT_WORK_TOGETHER: 'I don’t work with them' }
const LIST: Record<MappingRelationValue, [string, string]> = { PEER: ['as a peer', 'from their peers'], LEAD: ['as their lead', 'as their lead'], REPORT: ['to their team', 'from their team'] }
const MIN_PEERS = 2

type Body = { decision: 'APPROVE' | 'REJECT'; note?: string } | { reply: PeerReplyValue }

/** From the emailed link: the lead reviews a change before HR decides; in a peer change the peer may say whether they work together. */
export function PeerApproval({ token }: { token: string }) {
  const [view, setView] = useState<PeerRequestTokenView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [disagreeing, setDisagreeing] = useState(false)
  const [note, setNote] = useState('')
  const url = `/api/peer-requests/${encodeURIComponent(token)}`

  const load = useCallback(() => {
    fetch(url)
      .then(async (r) => (r.ok ? setView(await r.json()) : setError((await r.json().catch(() => null))?.error ?? 'This link is not valid')))
      .catch(() => setError('Could not load the request'))
  }, [url])
  useEffect(load, [load])

  async function post(body: Body) {
    setBusy(true)
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await r.json().catch(() => null)
      if (!r.ok) return setError(result?.error ?? 'Could not save your answer')
      if ('reply' in body) {
        setDone('Thanks. Their lead and HR will see your reply.')
        load()
      } else setDone('Thanks. HR has your review and makes the final decision.')
    } catch {
      setError('Could not reach Compass. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const open = view?.status === 'PENDING' || view?.status === 'NEEDS_INFO'
  const leadCanReview = view?.role === 'LEAD' && view.status === 'PENDING' && view.vote === 'PENDING'
  const words = view ? LIST[view.relation] : null
  return (
    <Card className="w-full">
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{view?.role === 'PEER' ? 'You were mentioned in a change request' : 'Review a change request'}</h1>
          {view?.role === 'LEAD' && <p className="text-sm text-muted-foreground">You review this as their lead. HR makes the final decision.</p>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && !view && <p className="text-sm text-muted-foreground">Loading…</p>}
        {view && words && (
          <>
            <div className="rounded-lg border p-4">
              <p className="text-sm">
                <span className="font-semibold">{view.requester.name}</span> asked to {view.action === 'ADD' ? 'add' : 'remove'} <span className="font-semibold">{view.role === 'PEER' ? 'you' : view.peer.name}</span> {words[view.action === 'ADD' ? 0 : 1]} for {view.periodName}.
              </p>
              {(view.reasonCode || view.reason) && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {view.reasonCode && <span className="font-medium text-foreground">{REASONS[view.reasonCode]}. </span>}
                  {view.reason && `“${view.reason}”`}
                </p>
              )}
            </div>
            {view.role === 'LEAD' && view.relation === 'PEER' && (
              <p className="text-sm text-muted-foreground">{view.peer.name}: {view.peerReply ? `“${REPLIES[view.peerReply]}”` : 'has not replied (they do not have to).'}</p>
            )}
            {view.role === 'LEAD' && open && view.relation === 'PEER' && view.action === 'REMOVE' && view.peersLeft < MIN_PEERS && (
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {view.requester.name} would be left with {view.peersLeft <= 0 ? 'no peers' : `only ${view.peersLeft} peer`}.
              </p>
            )}
            {done && <p className="rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{done}</p>}
            {!done && !error && leadCanReview && !disagreeing && (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void post({ decision: 'APPROVE' })}>I agree</Button>
                <Button disabled={busy} variant="outline" onClick={() => setDisagreeing(true)}>I disagree</Button>
              </div>
            )}
            {!done && !error && leadCanReview && disagreeing && (
              <div className="space-y-2">
                <Label htmlFor="disagree-reason">Why? HR and {view.requester.name} will see this.</Label>
                <Textarea id="disagree-reason" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <Button disabled={busy || !note.trim()} onClick={() => void post({ decision: 'REJECT', note: note.trim() })}>Send to HR</Button>
                  <Button disabled={busy} variant="outline" onClick={() => setDisagreeing(false)}>Back</Button>
                </div>
              </div>
            )}
            {!done && !error && view.role === 'LEAD' && !leadCanReview && (
              <p className="text-sm text-muted-foreground">
                {view.status === 'NEEDS_INFO' ? 'HR asked a question about this request. You can review it once it is answered; this link will still work.' : view.vote !== 'PENDING' ? 'You have reviewed this. HR makes the final decision.' : 'This request has been decided.'}
              </p>
            )}
            {view.role === 'PEER' && open && !error && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Their lead and HR decide. You do not have to answer{view.peerReply ? `; you said “${REPLIES[view.peerReply]}”` : ''}.</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(REPLIES) as PeerReplyValue[]).map((reply) => (
                    <Button key={reply} disabled={busy || view.peerReply === reply} variant={view.peerReply === reply ? 'default' : 'outline'} onClick={() => void post({ reply })}>{REPLIES[reply]}</Button>
                  ))}
                </div>
              </div>
            )}
            {view.role === 'PEER' && !open && <p className="text-sm text-muted-foreground">This request has been decided.</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
