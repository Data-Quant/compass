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
import type { MappingReasonCodeValue, MappingRelationValue, MyMappingResponse, PeerRequestView, PersonRef } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const STATUS: Record<PeerRequestView['status'], string> = {
  PENDING: 'Waiting', NEEDS_INFO: 'HR has a question', APPROVED: 'Approved', REJECTED: 'Not approved', CANCELLED: 'Cancelled', EXPIRED: 'Not decided in time',
}
const SECTIONS: Record<MappingRelationValue, { title: string; add: string; noun: string }> = {
  LEAD: { title: 'Your lead', add: 'Contact HR to add a lead', noun: 'lead' },
  REPORT: { title: 'Your reporting team members', add: 'Contact HR to add a team member', noun: 'team member' },
  PEER: { title: 'Your peers', add: 'Ask to add a peer', noun: 'peer' },
}
const ORDER: MappingRelationValue[] = ['LEAD', 'REPORT', 'PEER']
const REASONS: Record<MappingReasonCodeValue, string> = { NO_LONGER_WORK_TOGETHER: 'We no longer work together', WRONG_PERSON: 'Wrong person', OTHER: 'Other' }
const MIN_PEERS = 2
const isOpen = (r: PeerRequestView) => r.status === 'PENDING' || r.status === 'NEEDS_INFO'

function waitingFor(r: PeerRequestView): string {
  if (r.status === 'NEEDS_INFO') return STATUS.NEEDS_INFO
  if (r.relation !== 'PEER' || !r.approver) return 'Waiting for HR'
  return `Waiting for ${r.approver.name}`
}

function describe(r: PeerRequestView): string {
  const noun = SECTIONS[r.relation].noun
  return r.action === 'ADD' ? `Add ${r.peer.name} as your ${noun}` : `Remove ${r.peer.name} as your ${noun}`
}

interface Asking { action: 'ADD' | 'REMOVE'; relation: MappingRelationValue; person: PersonRef | null }

/**
 * UX spec, section 6: during the review stage everyone checks who they evaluate and who evaluates them, says the lists
 * look right or asks to correct them. Their lead decides a peer change (the peer is told); HR decides lead and team changes.
 */
export function MyMappingCard() {
  const [data, setData] = useState<MyMappingResponse | null>(null)
  const [asking, setAsking] = useState<Asking | null>(null)
  const [reasonCode, setReasonCode] = useState<MappingReasonCodeValue | ''>('')
  const [reason, setReason] = useState('')
  const [answering, setAnswering] = useState<PeerRequestView | null>(null)
  const [answer, setAnswer] = useState('')
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

  function openAsk(next: Asking) {
    setAsking(next)
    setReasonCode('')
    setReason('')
  }

  async function run(action: () => Promise<unknown>, success: string, failure: string): Promise<boolean> {
    setSaving(true)
    try {
      await action()
      toast.success(success)
      await load()
      return true
    } catch (e) {
      toast.error(errorMessage(e, failure))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function submit() {
    if (!asking?.person) return
    const body = {
      peerId: asking.person.id, action: asking.action, relation: asking.relation,
      ...(reasonCode ? { reasonCode } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}),
    }
    const lead = data?.leads[0]?.name
    const sent = asking.relation === 'PEER' && lead ? `Sent to ${lead}, who decides` : 'Sent to HR'
    if (await run(() => weeklyRequest('/api/weekly/mapping', { method: 'POST', body }), sent, 'Could not send the request')) setAsking(null)
  }

  async function sendAnswer() {
    if (!answering) return
    const body = { action: 'answer', requestId: answering.id, reason: answer.trim() }
    if (await run(() => weeklyRequest('/api/weekly/mapping', { method: 'PATCH', body }), 'Sent to HR', 'Could not send your answer')) {
      setAnswering(null)
      setAnswer('')
    }
  }

  if (!data) return null
  const openAbout = new Set(data.requests.filter(isOpen).map((r) => r.peer.id))
  const locked = data.period.locked
  const people: Record<MappingRelationValue, PersonRef[]> = { LEAD: data.leads, REPORT: data.reports, PEER: data.peers }
  const removingPeer = asking?.action === 'REMOVE' && asking.relation === 'PEER'
  const peersAfter = data.peers.length - data.requests.filter((r) => isOpen(r) && r.relation === 'PEER' && r.action === 'REMOVE').length - 1
  const reasonMissing = removingPeer && (!reasonCode || (reasonCode === 'OTHER' && !reason.trim()))
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Your evaluation lists for {data.period.name}</h2>
            <p className="text-sm text-muted-foreground">
              Who you evaluate and who evaluates you this quarter.{' '}
              {locked ? 'If anything is wrong, contact HR.' : 'Check them. If anyone is wrong or missing, ask for a change.'}
            </p>
          </div>
          {!locked && (data.confirmedAt
            ? <Badge variant="outline">You said these look right</Badge>
            : <Button size="sm" disabled={saving} onClick={() => void run(() => weeklyRequest('/api/weekly/mapping', { method: 'PATCH', body: { action: 'confirm' } }), 'Thanks. HR can see you checked your lists.', 'Could not save')}>Looks right</Button>)}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {ORDER.map((relation) => (
            <div key={relation} className="space-y-2">
              <p className="text-sm font-medium">{SECTIONS[relation].title}</p>
              {people[relation].length === 0 && <p className="text-sm text-muted-foreground">None</p>}
              <ul className="divide-y rounded-md border empty:hidden">
                {people[relation].map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{person.name}</span>
                    {!locked && !openAbout.has(person.id) && (
                      <Button size="sm" variant="ghost" aria-label={`Ask to remove ${person.name}`} onClick={() => openAsk({ action: 'REMOVE', relation, person })}>Remove</Button>
                    )}
                  </li>
                ))}
              </ul>
              {!locked && <Button size="sm" variant="outline" onClick={() => openAsk({ action: 'ADD', relation, person: null })}>{SECTIONS[relation].add}</Button>}
            </div>
          ))}
        </div>
        {data.requests.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Your requests</p>
            <ul className="space-y-2">
              {data.requests.map((r) => (
                <li key={r.id} className="space-y-1 rounded-md border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{describe(r)}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant={r.status === 'APPROVED' ? 'default' : 'outline'}>{isOpen(r) ? waitingFor(r) : STATUS[r.status]}</Badge>
                      {r.status === 'NEEDS_INFO' && !locked && <Button size="sm" variant="outline" onClick={() => { setAnswering(r); setAnswer('') }}>Answer</Button>}
                      {isOpen(r) && !locked && <Button size="sm" variant="ghost" disabled={saving} onClick={() => void run(() => weeklyRequest('/api/weekly/mapping', { method: 'DELETE', body: { requestId: r.id } }), 'Request cancelled', 'Could not cancel the request')}>Cancel</Button>}
                    </span>
                  </div>
                  {r.decisionNote && (r.status === 'NEEDS_INFO' || r.status === 'REJECTED') && (
                    <p className="text-muted-foreground">{r.status === 'NEEDS_INFO' ? 'HR asks: ' : 'Reason: '}“{r.decisionNote}”</p>
                  )}
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
            {removingPeer && (
              <div className="space-y-2">
                <Label htmlFor="mapping-reason-code">Reason</Label>
                <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as MappingReasonCodeValue)}>
                  <SelectTrigger id="mapping-reason-code" aria-label="Reason"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                  <SelectContent>{(Object.keys(REASONS) as MappingReasonCodeValue[]).map((code) => <SelectItem key={code} value={code}>{REASONS[code]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="mapping-reason">{removingPeer && reasonCode === 'OTHER' ? 'Explain' : 'Details (optional)'}</Label>
              <Textarea id="mapping-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {removingPeer && peersAfter < MIN_PEERS && (
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                This would leave you with {peersAfter <= 0 ? 'no peers' : `only ${peersAfter} peer`}. Fewer peers means fewer views of your work. You can still send it.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {asking.relation !== 'PEER'
                ? 'HR reviews this and updates your lists, or asks you for more information.'
                : data.leads.length
                  ? `${data.leads[0].name} decides. ${asking.person?.name ?? 'The person'} is told and can say whether you work together.`
                  : `HR decides, as you have no lead listed. ${asking.person?.name ?? 'The person'} is told.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAsking(null)}>Cancel</Button>
              <Button disabled={saving || !asking.person || reasonMissing} onClick={() => void submit()}>{saving ? 'Sending…' : 'Send request'}</Button>
            </div>
          </div>
        </Modal>
      )}
      {answering && (
        <Modal isOpen onClose={() => setAnswering(null)} title="Answer HR">
          <div className="space-y-4">
            <p className="text-sm">HR asks: “{answering.decisionNote}”</p>
            <div className="space-y-2">
              <Label htmlFor="mapping-answer">Your answer</Label>
              <Textarea id="mapping-answer" rows={3} maxLength={500} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAnswering(null)}>Cancel</Button>
              <Button disabled={saving || !answer.trim()} onClick={() => void sendAnswer()}>{saving ? 'Sending…' : 'Send to HR'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}
