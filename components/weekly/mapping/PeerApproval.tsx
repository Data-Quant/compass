'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { MappingReasonCodeValue, PeerReplyValue, PeerRequestTokenView } from '@/lib/weekly/view-types'

const OUTCOME: Record<string, string> = {
  APPROVED: 'Thanks. The change has been made.',
  REJECTED: 'Thanks. The request was declined, and they have been told why.',
}
const REASONS: Record<MappingReasonCodeValue, string> = { NO_LONGER_WORK_TOGETHER: 'They no longer work together', WRONG_PERSON: 'Wrong person', OTHER: 'Other' }
const REPLIES: Record<PeerReplyValue, string> = { WORK_TOGETHER: 'We do work together', NOT_WORK_TOGETHER: 'I don’t work with them' }
const MIN_PEERS = 2

type Body = { decision: 'APPROVE' | 'REJECT'; note?: string } | { reply: PeerReplyValue }

/** From the emailed link: the lead approves or declines a peer change; the peer may say whether they work together. */
export function PeerApproval({ token }: { token: string }) {
  const [view, setView] = useState<PeerRequestTokenView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [declining, setDeclining] = useState(false)
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
        setDone('Thanks. Their lead will see your reply.')
        load()
      } else setDone(OUTCOME[result?.status] ?? 'Thanks.')
    } catch {
      setError('Could not reach Compass. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const open = view?.status === 'PENDING' || view?.status === 'NEEDS_INFO'
  const leadCanDecide = view?.role === 'LEAD' && view.status === 'PENDING' && view.vote === 'PENDING'
  return (
    <Card className="w-full">
      <CardContent className="space-y-4 p-6">
        <h1 className="text-lg font-semibold">Peer change request</h1>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && !view && <p className="text-sm text-muted-foreground">Loading…</p>}
        {view && (
          <>
            <p className="text-sm">
              {view.requester.name} asked to {view.action === 'ADD' ? 'add' : 'remove'} {view.role === 'PEER' ? 'you' : view.peer.name} {view.action === 'ADD' ? 'as a peer' : 'from their peers'} for {view.periodName}.
            </p>
            {(view.reasonCode || view.reason) && (
              <p className="rounded-md bg-muted p-3 text-sm">
                {view.reasonCode && <strong>{REASONS[view.reasonCode]}. </strong>}
                {view.reason && `“${view.reason}”`}
              </p>
            )}
            {view.role === 'LEAD' && (
              <>
                <p className="text-sm text-muted-foreground">
                  {view.peer.name}: {view.peerReply ? `“${REPLIES[view.peerReply]}”` : 'has not replied (they do not have to).'}
                </p>
                {open && view.action === 'REMOVE' && view.peersLeft < MIN_PEERS && (
                  <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    {view.requester.name} would be left with {view.peersLeft <= 0 ? 'no peers' : `only ${view.peersLeft} peer`}.
                  </p>
                )}
              </>
            )}
            {done && <p className="text-sm font-medium">{done}</p>}
            {!done && !error && leadCanDecide && !declining && (
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void post({ decision: 'APPROVE' })}>Approve</Button>
                <Button disabled={busy} variant="outline" onClick={() => setDeclining(true)}>Decline</Button>
              </div>
            )}
            {!done && !error && leadCanDecide && declining && (
              <div className="space-y-2">
                <Label htmlFor="decline-reason">Why are you declining? {view.requester.name} will see this.</Label>
                <Textarea id="decline-reason" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <Button disabled={busy || !note.trim()} variant="destructive" onClick={() => void post({ decision: 'REJECT', note: note.trim() })}>Decline</Button>
                  <Button disabled={busy} variant="outline" onClick={() => setDeclining(false)}>Back</Button>
                </div>
              </div>
            )}
            {!done && !error && view.role === 'LEAD' && !leadCanDecide && (
              <p className="text-sm text-muted-foreground">{view.status === 'NEEDS_INFO' ? 'HR has asked a question about this request. You can decide once it is answered; this link will still work.' : 'This request has already been decided.'}</p>
            )}
            {view.role === 'PEER' && open && !error && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Their lead decides. You do not have to answer{view.peerReply ? `; you said “${REPLIES[view.peerReply]}”` : ''}.</p>
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
