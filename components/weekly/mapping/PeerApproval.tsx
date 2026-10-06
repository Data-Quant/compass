'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { PeerRequestTokenView } from '@/lib/weekly/view-types'

const OUTCOME: Record<string, string> = {
  PENDING: 'Thanks. The change will happen once the other approver agrees.',
  APPROVED: 'Thanks. The change has been made.',
  REJECTED: 'Thanks. The request was declined.',
}

/** One click to approve or decline a peer change, from the email link. */
export function PeerApproval({ token }: { token: string }) {
  const [view, setView] = useState<PeerRequestTokenView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/peer-requests/${encodeURIComponent(token)}`)
      .then(async (r) => (r.ok ? setView(await r.json()) : setError((await r.json().catch(() => null))?.error ?? 'This link is not valid')))
      .catch(() => setError('Could not load the request'))
  }, [token])

  async function decide(decision: 'APPROVE' | 'REJECT') {
    setBusy(true)
    try {
      const r = await fetch(`/api/peer-requests/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) })
      const body = await r.json().catch(() => null)
      if (!r.ok) setError(body?.error ?? 'Could not save your answer')
      else setDone(OUTCOME[body?.status] ?? OUTCOME.PENDING)
    } finally {
      setBusy(false)
    }
  }

  const answered = view && (view.vote !== 'PENDING' || view.status !== 'PENDING')
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
            {view.reason && <p className="rounded-md bg-muted p-3 text-sm">“{view.reason}”</p>}
            {done ? <p className="text-sm font-medium">{done}</p> : answered ? (
              <p className="text-sm text-muted-foreground">This request has already been answered.</p>
            ) : (
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => void decide('APPROVE')}>Approve</Button>
                <Button disabled={busy} variant="outline" onClick={() => void decide('REJECT')}>Decline</Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
