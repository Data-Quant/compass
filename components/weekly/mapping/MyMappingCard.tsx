'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { MyMappingResponse, PeerRequestView, PersonRef } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const STATUS: Record<PeerRequestView['status'], string> = { PENDING: 'Waiting for approval', APPROVED: 'Approved', REJECTED: 'Not approved', CANCELLED: 'Cancelled' }

/** Who still has to approve a pending request, in plain words. */
function waitingFor(r: PeerRequestView): string {
  const names = [r.peerVote === 'PENDING' ? r.peer.name : null, r.approver ? (r.approverVote === 'PENDING' ? r.approver.name : null) : 'HR'].filter(Boolean)
  return names.length ? `Waiting for ${names.join(' and ')}` : 'Waiting for approval'
}

function People({ title, people, empty }: { title: string; people: PersonRef[]; empty: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      {people.length ? <p className="text-sm text-muted-foreground">{people.map((p) => p.name).join(', ')}</p> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </div>
  )
}

/** Section 4: lead and team are HR's; peers can be corrected with the peer's and the lead's approval. */
export function MyMappingCard() {
  const [data, setData] = useState<MyMappingResponse | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [asking, setAsking] = useState<{ action: 'ADD' | 'REMOVE'; peer: PersonRef | null } | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<MyMappingResponse>('/api/weekly/mapping'))
    } catch {
      setUnavailable(true)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function submit() {
    if (!asking?.peer) return
    setSaving(true)
    try {
      await weeklyRequest('/api/weekly/mapping', { method: 'POST', body: { peerId: asking.peer.id, action: asking.action, ...(reason.trim() ? { reason: reason.trim() } : {}) } })
      toast.success('Request sent for approval')
      setAsking(null)
      setReason('')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send the request'))
    } finally {
      setSaving(false)
    }
  }

  async function cancel(id: string) {
    try {
      await weeklyRequest('/api/weekly/mapping', { method: 'DELETE', body: { requestId: id } })
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not cancel the request'))
    }
  }

  if (unavailable || !data) return null
  const pendingAbout = new Set(data.requests.filter((r) => r.status === 'PENDING').map((r) => r.peer.id))
  const locked = data.period.locked
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Your mapping for {data.period.name}</h2>
          <p className="text-sm text-muted-foreground">Who you evaluate and who evaluates you. For a change to your lead or team, contact HR.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <People title="Your lead" people={data.leads} empty="None" />
          <People title="Your reporting team members" people={data.reports} empty="None" />
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Your peers</p>
            {!locked && <Button size="sm" variant="outline" onClick={() => setAsking({ action: 'ADD', peer: null })}>Ask to add a peer</Button>}
          </div>
          {data.peers.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
          <ul className="divide-y rounded-md border">
            {data.peers.map((peer) => (
              <li key={peer.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{peer.name}{peer.position ? <span className="text-muted-foreground"> · {peer.position}</span> : null}</span>
                {!locked && !pendingAbout.has(peer.id) && <Button size="sm" variant="ghost" onClick={() => setAsking({ action: 'REMOVE', peer })}>Ask to remove</Button>}
              </li>
            ))}
          </ul>
        </div>
        {data.requests.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Your requests</p>
            <ul className="space-y-2">
              {data.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span>{r.action === 'ADD' ? 'Add' : 'Remove'} {r.peer.name}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant={r.status === 'APPROVED' ? 'default' : 'outline'}>{r.status === 'PENDING' ? waitingFor(r) : STATUS[r.status]}</Badge>
                    {r.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => void cancel(r.id)}>Cancel</Button>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      {asking && (
        <Modal isOpen onClose={() => setAsking(null)} title={asking.action === 'ADD' ? 'Ask to add a peer' : `Ask to remove ${asking.peer?.name ?? ''}`}>
          <div className="space-y-4">
            {asking.action === 'ADD' && (
              <div className="space-y-2">
                <Label htmlFor="add-peer">Peer</Label>
                <Select value={asking.peer?.id ?? ''} onValueChange={(id) => setAsking({ action: 'ADD', peer: data.candidates.find((c) => c.id === id) ?? null })}>
                  <SelectTrigger id="add-peer" aria-label="Peer"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                  <SelectContent>{data.candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.position ? ` · ${c.position}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="peer-reason">Why (optional)</Label>
              <Textarea id="peer-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">The peer and your lead each get an email to approve. The change happens once both approve.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAsking(null)}>Cancel</Button>
              <Button disabled={saving || !asking.peer} onClick={() => void submit()}>{saving ? 'Sending…' : 'Send for approval'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}
