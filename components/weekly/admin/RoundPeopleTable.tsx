'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ParticipantRow, PersonRef, RoundWarningKey } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const WARNINGS: Record<RoundWarningKey, string> = { NO_LEAD: 'No lead', FEW_PEERS: 'Fewer than 2 peers' }
const RELATIONS = { LEAD: 'Lead', REPORT: 'Team member', PEER: 'Peer' } as const
type Relation = keyof typeof RELATIONS

const names = (people: PersonRef[]) => (people.length ? people.map((p) => p.name).join(', ') : '–')

interface Props {
  cycleId: string
  rows: ParticipantRow[]
  exclusionLabels: Record<NonNullable<ParticipantRow['exclusion']>, string>
  onChanged: () => Promise<void>
  onOptIn: (row: ParticipantRow) => void
  onRemoveOptIn: (row: ParticipantRow) => void
}

/** One row per person: their lists, their status, and what HR should look at (UX spec, HR step 2). */
const QUARTER_END = { C_LEVEL: 'C-Level', DEPT: 'Department', HR: 'HR' } as const

export function RoundPeopleTable({ cycleId, rows, exclusionLabels, onChanged, onOptIn, onRemoveOptIn }: Props) {
  const [filter, setFilter] = useState('')
  const [onlyWarnings, setOnlyWarnings] = useState(false)
  const [editing, setEditing] = useState<ParticipantRow | null>(null)
  const [accepting, setAccepting] = useState<{ row: ParticipantRow; key: RoundWarningKey } | null>(null)

  const open = (row: ParticipantRow) => row.warnings.some((w) => !w.acceptedReason)
  const shown = useMemo(() => rows.filter((r) => (!onlyWarnings || open(r)) && r.person.name.toLowerCase().includes(filter.toLowerCase())), [rows, onlyWarnings, filter])
  const included = rows.filter((r) => !r.exclusion).length
  const warnings = rows.filter(open).length
  const confirmed = rows.filter((r) => !r.exclusion && r.confirmedAt).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{included} included · {rows.length - included} not evaluated · {warnings} with something to check · {confirmed} said their lists look right</p>
        <div className="flex items-center gap-2">
          <Input className="h-8 w-48" placeholder="Find a person" aria-label="Find a person" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Button size="sm" variant={onlyWarnings ? 'default' : 'outline'} onClick={() => setOnlyWarnings((v) => !v)}>Only to check</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2">Person</th><th className="p-2">Lead</th><th className="p-2">Team</th><th className="p-2">Peers</th><th className="p-2">Quarter-end forms</th><th className="p-2">Status</th>
              <th className="p-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.person.id} className="border-b align-top last:border-0">
                <td className="p-2"><p className="font-medium">{row.person.name}</p><p className="text-xs text-muted-foreground">{row.department ?? ''}</p></td>
                <td className="p-2">{names(row.leads)}</td>
                <td className="p-2">{names(row.reports)}</td>
                <td className="p-2">{names(row.peers)}</td>
                <td className="p-2 text-xs">
                  {row.quarterEnd.length === 0 ? <span className="text-muted-foreground">None</span> : row.quarterEnd.map((q) => (
                    <p key={`${q.type}-${q.evaluator.id}`}><span className="text-muted-foreground">{QUARTER_END[q.type]}:</span> {q.evaluator.name}</p>
                  ))}
                </td>
                <td className="space-y-1 p-2">
                  {row.exclusion ? <Badge variant="outline">{exclusionLabels[row.exclusion]}</Badge> : <Badge variant="secondary">Included</Badge>}
                  {row.optedIn && <p className="text-xs text-muted-foreground">Opted in: {row.optInReason}</p>}
                  {!row.exclusion && <p className="text-xs text-muted-foreground">{row.confirmedAt ? 'Said lists look right' : 'Has not confirmed lists'}</p>}
                  {row.warnings.map((w) => (
                    <div key={w.key} className="flex flex-wrap items-center gap-1">
                      <Badge variant={w.acceptedReason ? 'outline' : 'destructive'}>{WARNINGS[w.key]}</Badge>
                      {w.acceptedReason
                        ? <span className="text-xs text-muted-foreground">Accepted: {w.acceptedReason}</span>
                        : <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAccepting({ row, key: w.key })}>Accept</Button>}
                    </div>
                  ))}
                </td>
                <td className="space-y-1 p-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(row)}>Change lists</Button>
                  {row.exclusion === 'JOINED_LATE' && <Button size="sm" variant="ghost" onClick={() => onOptIn(row)}>Opt in</Button>}
                  {row.optedIn && <Button size="sm" variant="ghost" onClick={() => onRemoveOptIn(row)}>Remove opt-in</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ChangeListsDialog cycleId={cycleId} row={editing} people={rows.map((r) => r.person)} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {accepting && <AcceptWarningDialog cycleId={cycleId} row={accepting.row} warning={accepting.key} onClose={() => setAccepting(null)} onSaved={onChanged} />}
    </div>
  )
}

function ChangeListsDialog({ cycleId, row, people, onClose, onSaved }: { cycleId: string; row: ParticipantRow; people: PersonRef[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [relation, setRelation] = useState<Relation>('PEER')
  const [change, setChange] = useState<'ADD' | 'REMOVE'>('ADD')
  const [otherId, setOtherId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const current = relation === 'LEAD' ? row.leads : relation === 'REPORT' ? row.reports : row.peers
  const choices = change === 'REMOVE' ? current : people.filter((p) => p.id !== row.person.id && !current.some((c) => c.id === p.id))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await weeklyRequest('/api/admin/weekly/round-people', { method: 'POST', body: { action: 'change', cycleId, userId: row.person.id, otherId, relation, change, reason } })
      toast.success('Lists updated. Both people are told.')
      onClose()
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change the lists'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Change ${row.person.name}'s lists`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="change-what">What</Label>
            <Select value={`${change}:${relation}`} onValueChange={(v) => { const [c, r] = v.split(':'); setChange(c as 'ADD' | 'REMOVE'); setRelation(r as Relation); setOtherId('') }}>
              <SelectTrigger id="change-what" aria-label="What to change"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['ADD', 'REMOVE'] as const).flatMap((c) => (Object.keys(RELATIONS) as Relation[]).map((r) => (
                  <SelectItem key={`${c}:${r}`} value={`${c}:${r}`}>{c === 'ADD' ? 'Add' : 'Remove'} a {RELATIONS[r].toLowerCase()}</SelectItem>
                )))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="change-who">Who</Label>
            <Select value={otherId} onValueChange={setOtherId}>
              <SelectTrigger id="change-who" aria-label="Who"><SelectValue placeholder={choices.length ? 'Choose a person' : 'Nobody to choose'} /></SelectTrigger>
              <SelectContent>{choices.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="change-reason">Reason</Label>
          <Textarea id="change-reason" rows={2} required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-xs text-muted-foreground">Applies to this round in both directions; a lead or team change also updates the live mappings for future quarters. Answers already given still count; new questions start next week.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !otherId}>{saving ? 'Saving…' : 'Save change'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function AcceptWarningDialog({ cycleId, row, warning, onClose, onSaved }: { cycleId: string; row: ParticipantRow; warning: RoundWarningKey; onClose: () => void; onSaved: () => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await weeklyRequest('/api/admin/weekly/round-people', { method: 'POST', body: { action: 'accept-warning', cycleId, userId: row.person.id, warning, reason } })
      onClose()
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not accept the warning'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal isOpen onClose={onClose} title={`${WARNINGS[warning]}: ${row.person.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="accept-reason">Why this is fine</Label>
          <Textarea id="accept-reason" rows={2} required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Accept'}</Button>
        </div>
      </form>
    </Modal>
  )
}
