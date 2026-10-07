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
import type { MappingRelationValue, MyMappingResponse, PeerRequestView, PersonRef } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const STATUS: Record<PeerRequestView['status'], string> = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Not approved', CANCELLED: 'Cancelled' }
const SECTIONS: Record<MappingRelationValue, { title: string; add: string; noun: string; empty: string }> = {
  LEAD: { title: 'Your lead', add: 'Ask to add a lead', noun: 'lead', empty: 'None' },
  REPORT: { title: 'Your reporting team members', add: 'Ask to add a team member', noun: 'team member', empty: 'None' },
  PEER: { title: 'Your peers', add: 'Ask to add a peer', noun: 'peer', empty: 'None' },
}
const ORDER: MappingRelationValue[] = ['LEAD', 'REPORT', 'PEER']

/** Who still has to agree to a pending request, in plain words. */
function waitingFor(r: PeerRequestView): string {
  if (r.relation !== 'PEER') return 'Waiting for HR'
  const names = [r.peerVote === 'PENDING' ? r.peer.name : null, r.approver ? (r.approverVote === 'PENDING' ? r.approver.name : null) : 'HR'].filter(Boolean)
  return names.length ? `Waiting for ${names.join(' and ')}` : 'Waiting for approval'
}

function describe(r: PeerRequestView): string {
  const noun = SECTIONS[r.relation].noun
  return r.action === 'ADD' ? `Add ${r.peer.name} as your ${noun}` : `Remove ${r.peer.name} as your ${noun}`
}

interface Asking { action: 'ADD' | 'REMOVE'; relation: MappingRelationValue; person: PersonRef | null }

/**
 * Section 4: at the start of the quarter everyone checks who they evaluate and who evaluates them, and asks to correct it.
 * Peer changes are approved by the peer and the lead; changes to the lead or the team are HR's decision.
 */
export function MyMappingCard() {
  const [data, setData] = useState<MyMappingResponse | null>(null)
  const [asking, setAsking] = useState<Asking | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<MyMappingResponse>('/api/weekly/mapping'))
    } catch {
      setData(null)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function submit() {
    if (!asking?.person) return
    setSaving(true)
    try {
      await weeklyRequest('/api/weekly/mapping', {
        method: 'POST',
        body: { peerId: asking.person.id, action: asking.action, relation: asking.relation, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      })
      toast.success(asking.relation === 'PEER' ? 'Request sent to the peer and your lead' : 'Request sent to HR')
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

  if (!data) return null
  const pendingAbout = new Set(data.requests.filter((r) => r.status === 'PENDING').map((r) => r.peer.id))
  const locked = data.period.locked
  const people: Record<MappingRelationValue, PersonRef[]> = { LEAD: data.leads, REPORT: data.reports, PEER: data.peers }
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Your mapping for {data.period.name}</h2>
          <p className="text-sm text-muted-foreground">
            Who you evaluate and who evaluates you this quarter. If anyone is wrong or missing, ask for a change: a peer change needs that peer and your lead to approve; HR decides changes to your lead or team.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {ORDER.map((relation) => (
            <div key={relation} className="space-y-2">
              <p className="text-sm font-medium">{SECTIONS[relation].title}</p>
              {people[relation].length === 0 && <p className="text-sm text-muted-foreground">{SECTIONS[relation].empty}</p>}
              <ul className="divide-y rounded-md border empty:hidden">
                {people[relation].map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{person.name}</span>
                    {!locked && !pendingAbout.has(person.id) && (
                      <Button size="sm" variant="ghost" aria-label={`Ask to remove ${person.name}`} onClick={() => setAsking({ action: 'REMOVE', relation, person })}>Remove</Button>
                    )}
                  </li>
                ))}
              </ul>
              {!locked && <Button size="sm" variant="outline" onClick={() => setAsking({ action: 'ADD', relation, person: null })}>{SECTIONS[relation].add}</Button>}
            </div>
          ))}
        </div>
        {data.requests.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Your requests</p>
            <ul className="space-y-2">
              {data.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span>{describe(r)}</span>
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
        <Modal
          isOpen
          onClose={() => setAsking(null)}
          title={asking.action === 'ADD' ? SECTIONS[asking.relation].add : `Ask to remove ${asking.person?.name ?? ''} as your ${SECTIONS[asking.relation].noun}`}
        >
          <div className="space-y-4">
            {asking.action === 'ADD' && (
              <div className="space-y-2">
                <Label htmlFor="mapping-person">Person</Label>
                <Select value={asking.person?.id ?? ''} onValueChange={(id) => setAsking({ ...asking, person: data.candidates.find((c) => c.id === id) ?? null })}>
                  <SelectTrigger id="mapping-person" aria-label="Person"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                  <SelectContent>{data.candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.position ? ` · ${c.position}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="mapping-reason">Why (optional)</Label>
              <Textarea id="mapping-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {asking.relation === 'PEER' ? 'The peer and your lead each get an email to approve. The change happens once both approve.' : 'HR reviews this and updates your mapping.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAsking(null)}>Cancel</Button>
              <Button disabled={saving || !asking.person} onClick={() => void submit()}>{saving ? 'Sending…' : 'Send request'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}
