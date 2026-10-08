'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, CircleCheck, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { MappingReasonCodeValue, MappingRelationValue, MyMappingResponse, PeerRequestView, PersonRef } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'
import { errorMessage, weeklyRequest } from '../weekly-api'

const SECTIONS: Record<MappingRelationValue, { title: string; hint: string; add: string; noun: string }> = {
  LEAD: { title: 'Your lead', hint: 'Evaluates you as their team member', add: 'Add a lead', noun: 'lead' },
  REPORT: { title: 'Your team', hint: 'People who report to you', add: 'Add a team member', noun: 'team member' },
  PEER: { title: 'Your peers', hint: 'People you work alongside', add: 'Add a peer', noun: 'peer' },
}
const ORDER: MappingRelationValue[] = ['LEAD', 'REPORT', 'PEER']
const REASONS: Record<MappingReasonCodeValue, string> = { NO_LONGER_WORK_TOGETHER: 'We no longer work together', WRONG_PERSON: 'Wrong person', OTHER: 'Other' }
const MIN_PEERS = 2
const isOpen = (r: PeerRequestView) => r.status === 'PENDING' || r.status === 'NEEDS_INFO'

interface Asking { action: 'ADD' | 'REMOVE'; relation: MappingRelationValue; person: PersonRef | null }

function describe(r: PeerRequestView): string {
  const noun = SECTIONS[r.relation].noun
  return r.action === 'ADD' ? `Add ${r.peer.name} as your ${noun}` : `Remove ${r.peer.name} as your ${noun}`
}

/**
 * The review stage, for an employee: check who evaluates you and whom you evaluate, then say they look right or ask for
 * a change. A change goes to your lead to review first, then HR decides; with no lead it goes straight to HR.
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

  function openAsk(next: Asking) {
    setAsking(next)
    setReasonCode('')
    setReason('')
  }

  if (!data) return null
  const locked = data.period.locked
  const lead = data.leads[0] ?? null
  const reviewer = (person: PersonRef | null) => data.leads.find((l) => l.id !== person?.id) ?? null
  const openAbout = new Set(data.requests.filter(isOpen).map((r) => r.peer.id))
  const people: Record<MappingRelationValue, PersonRef[]> = { LEAD: data.leads, REPORT: data.reports, PEER: data.peers }
  const removingPeer = asking?.action === 'REMOVE' && asking.relation === 'PEER'
  const peersAfter = data.peers.length - data.requests.filter((r) => isOpen(r) && r.relation === 'PEER' && r.action === 'REMOVE').length - 1
  const reasonMissing = removingPeer && (!reasonCode || (reasonCode === 'OTHER' && !reason.trim()))
  const route = asking ? reviewer(asking.person) : null

  async function submit() {
    if (!asking?.person) return
    const body = { peerId: asking.person.id, action: asking.action, relation: asking.relation, ...(reasonCode ? { reasonCode } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) }
    const sent = route ? `Sent to ${route.name} to review` : 'Sent to HR'
    if (await run(() => weeklyRequest('/api/weekly/mapping', { method: 'POST', body }), sent, 'Could not send the request')) setAsking(null)
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Your evaluation lists · {data.period.name}</h2>
            <p className="text-sm text-muted-foreground">
              {locked
                ? 'These are fixed for the round. If something is wrong, contact HR.'
                : `Check who you evaluate and who evaluates you. ${lead ? `Any change goes to ${lead.name} to review, then HR decides.` : 'Any change goes to HR.'}`}
            </p>
          </div>
          {!locked && (data.confirmedAt ? (
            <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"><CircleCheck className="h-3.5 w-3.5" /> You confirmed these</Badge>
          ) : (
            <Button disabled={saving} onClick={() => void run(() => weeklyRequest('/api/weekly/mapping', { method: 'PATCH', body: { action: 'confirm' } }), 'Thanks. HR can see you checked your lists.', 'Could not save')}>
              <Check className="mr-1.5 h-4 w-4" /> Looks right
            </Button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {ORDER.map((relation) => (
            <section key={relation} className="flex flex-col rounded-lg border">
              <div className="border-b px-3 py-2">
                <p className="text-sm font-semibold">{SECTIONS[relation].title}</p>
                <p className="text-xs text-muted-foreground">{SECTIONS[relation].hint}</p>
              </div>
              <ul className="flex-1 divide-y">
                {people[relation].length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Nobody</li>}
                {people[relation].map((person) => (
                  <li key={person.id} className="group flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{person.name}</p>
                      {person.position && <p className="truncate text-xs text-muted-foreground">{person.position}</p>}
                    </div>
                    {!locked && (openAbout.has(person.id)
                      ? <Badge variant="secondary" className="shrink-0">Change requested</Badge>
                      : <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive" aria-label={`Ask to remove ${person.name}`} onClick={() => openAsk({ action: 'REMOVE', relation, person })}><X className="h-4 w-4" /></Button>)}
                  </li>
                ))}
              </ul>
              {!locked && (
                <div className="border-t p-2">
                  <Button size="sm" variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => openAsk({ action: 'ADD', relation, person: null })}><Plus className="mr-1.5 h-4 w-4" /> {SECTIONS[relation].add}</Button>
                </div>
              )}
            </section>
          ))}
        </div>

        {data.requests.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Your change requests</p>
            <ul className="space-y-2">
              {data.requests.map((r) => (
                <li key={r.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{describe(r)}</p>
                    {isOpen(r) && !locked && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={saving} onClick={() => void run(() => weeklyRequest('/api/weekly/mapping', { method: 'DELETE', body: { requestId: r.id } }), 'Request cancelled', 'Could not cancel the request')}>Cancel request</Button>}
                  </div>
                  <RequestSteps request={r} />
                  {r.status === 'NEEDS_INFO' && r.decisionNote && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 p-2 text-sm dark:bg-amber-950">
                      <span>HR asks: “{r.decisionNote}”</span>
                      {!locked && <Button size="sm" onClick={() => { setAnswering(r); setAnswer('') }}>Answer HR</Button>}
                    </div>
                  )}
                  {r.status === 'REJECTED' && r.decisionNote && <p className="text-sm text-muted-foreground">HR’s reason: “{r.decisionNote}”</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {asking && (
        <Modal isOpen onClose={() => setAsking(null)} title={asking.action === 'ADD' ? SECTIONS[asking.relation].add : `Remove ${asking.person?.name ?? ''}?`}>
          <div className="space-y-4">
            {asking.action === 'ADD' && (
              <div className="space-y-1.5">
                <Label htmlFor="mapping-person">Who</Label>
                <Select value={asking.person?.id ?? ''} onValueChange={(id) => setAsking({ ...asking, person: data.candidates.find((c) => c.id === id) ?? null })}>
                  <SelectTrigger id="mapping-person" aria-label="Person"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                  <SelectContent>{data.candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.position ? ` · ${c.position}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {removingPeer && (
              <div className="space-y-1.5">
                <Label htmlFor="mapping-reason-code">Why</Label>
                <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as MappingReasonCodeValue)}>
                  <SelectTrigger id="mapping-reason-code" aria-label="Reason"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                  <SelectContent>{(Object.keys(REASONS) as MappingReasonCodeValue[]).map((code) => <SelectItem key={code} value={code}>{REASONS[code]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="mapping-reason">{removingPeer && reasonCode === 'OTHER' ? 'Explain' : 'Anything to add (optional)'}</Label>
              <Textarea id="mapping-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {removingPeer && peersAfter < MIN_PEERS && (
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                This would leave you with {peersAfter <= 0 ? 'no peers' : `only ${peersAfter} peer`}. Fewer peers means fewer views of your work. You can still send it.
              </p>
            )}
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">What happens next</p>
              <p className="text-muted-foreground">
                {route ? `${route.name} reviews it first, then HR decides. You’ll see each step here.` : 'HR decides. You’ll see the outcome here.'}
                {asking.relation === 'PEER' && asking.person ? ` ${asking.person.name} is told and can say whether you work together.` : ''}
              </p>
            </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="mapping-answer">Your answer</Label>
              <Textarea id="mapping-answer" rows={3} maxLength={500} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAnswering(null)}>Cancel</Button>
              <Button disabled={saving || !answer.trim()} onClick={() => void run(() => weeklyRequest('/api/weekly/mapping', { method: 'PATCH', body: { action: 'answer', requestId: answering.id, reason: answer.trim() } }), 'Sent to HR', 'Could not send your answer').then((ok) => ok && setAnswering(null))}>Send to HR</Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}

type Step = { label: string; state: 'done' | 'current' | 'todo' | 'failed' }

/** Sent → lead reviewing (when there is a lead) → HR deciding → outcome. */
function RequestSteps({ request: r }: { request: PeerRequestView }) {
  const closed = !isOpen(r)
  const leadStep: Step | null = r.approver
    ? { label: r.approverVote === 'PENDING' ? (closed ? `${r.approver.name} did not review` : `${r.approver.name} reviewing`) : `${r.approver.name} ${r.approverVote === 'APPROVED' ? 'agreed' : 'disagreed'}`, state: r.stage === 'LEAD' ? 'current' : 'done' }
    : null
  const hrLabel = r.stage === 'REQUESTER' ? 'HR asked you a question' : 'HR deciding'
  const outcome: Record<PeerRequestView['status'], string> = { PENDING: 'Decision', NEEDS_INFO: 'Decision', APPROVED: 'Approved', REJECTED: 'Not approved', CANCELLED: 'Cancelled', EXPIRED: 'Not decided in time' }
  const steps: Step[] = [
    { label: 'Sent', state: 'done' },
    ...(leadStep ? [leadStep] : []),
    { label: hrLabel, state: r.stage === 'HR' || r.stage === 'REQUESTER' ? 'current' : closed ? 'done' : 'todo' },
    { label: outcome[r.status], state: r.status === 'APPROVED' ? 'done' : closed ? 'failed' : 'todo' },
  ]
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Request progress">
      {steps.map((step, i) => (
        <li key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="h-px w-3 bg-border" />}
          <span className={cn(
            'rounded-full border px-2 py-0.5',
            step.state === 'done' && 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
            step.state === 'current' && 'border-primary bg-primary/10 font-medium text-foreground',
            step.state === 'todo' && 'text-muted-foreground',
            step.state === 'failed' && 'border-destructive/40 bg-destructive/10 text-destructive',
          )}>{step.label}</span>
        </li>
      ))}
    </ol>
  )
}
