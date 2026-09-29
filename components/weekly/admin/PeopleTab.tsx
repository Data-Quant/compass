'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { AdminCyclesResponse, CycleSummary, ParticipantRow, ParticipantsResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const EXCLUSION_LABELS: Record<NonNullable<ParticipantRow['exclusion']>, string> = {
  NOT_EVALUATED: 'Not evaluated (named leader, Partner or 3E)',
  INACTIVE: 'No longer active',
  LEFT: 'Has left',
  JOINED_LATE: 'Joined with fewer than 6 weeks left',
}

export function useCycles() {
  const [cycles, setCycles] = useState<CycleSummary[]>([])
  const [cycleId, setCycleId] = useState('')
  useEffect(() => {
    weeklyRequest<AdminCyclesResponse>('/api/admin/weekly/cycles')
      .then((result) => {
        setCycles(result.cycles)
        const preferred = result.cycles.find((c) => c.status === 'RUNNING') ?? result.cycles[0]
        if (preferred) setCycleId(preferred.id)
      })
      .catch((e: unknown) => toast.error(errorMessage(e, 'Could not load cycles')))
  }, [])
  return { cycles, cycleId, setCycleId }
}

export function CyclePicker({ cycles, cycleId, onChange }: { cycles: CycleSummary[]; cycleId: string; onChange: (id: string) => void }) {
  if (cycles.length < 2) return null
  return (
    <Select value={cycleId} onValueChange={onChange}>
      <SelectTrigger className="w-72" aria-label="Cycle"><SelectValue /></SelectTrigger>
      <SelectContent>{cycles.map((c) => <SelectItem key={c.id} value={c.id}>{c.periodName}</SelectItem>)}</SelectContent>
    </Select>
  )
}

export function PeopleTab() {
  const { cycles, cycleId, setCycleId } = useCycles()
  const [data, setData] = useState<ParticipantsResponse | null>(null)
  const [optingIn, setOptingIn] = useState<ParticipantRow | null>(null)

  const load = useCallback(async () => {
    if (!cycleId) return
    try {
      setData(await weeklyRequest<ParticipantsResponse>(`/api/admin/weekly/participants?cycleId=${cycleId}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load people'))
    }
  }, [cycleId])

  useEffect(() => {
    void load()
  }, [load])

  async function removeOptIn(row: ParticipantRow) {
    try {
      await weeklyRequest('/api/admin/weekly/participants', { method: 'DELETE', body: { cycleId, userId: row.person.id } })
      toast.success('Opt-in removed')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not remove the opt-in'))
    }
  }

  if (cycles.length === 0) return <p className="text-sm text-muted-foreground">Create a cycle in Setup first.</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading people…</p>
  return (
    <div className="space-y-4">
      <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
      <p className="text-sm text-muted-foreground">Everyone someone evaluates this quarter, and whether they get weekly questions about them.</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="p-2">Person</th><th className="p-2">Department</th><th className="p-2">Status</th><th className="p-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.person.id} className="border-b last:border-0">
                <td className="p-2">{row.person.name}</td>
                <td className="p-2">{row.department ?? ''}</td>
                <td className="p-2">
                  {row.exclusion ? <Badge variant="outline">{EXCLUSION_LABELS[row.exclusion]}</Badge> : <Badge>Included</Badge>}
                  {row.optedIn && <span className="ml-2 text-xs text-muted-foreground">Opted in: {row.optInReason}</span>}
                </td>
                <td className="p-2 text-right">
                  {row.exclusion === 'JOINED_LATE' && <Button size="sm" variant="outline" onClick={() => setOptingIn(row)}>Opt in</Button>}
                  {row.optedIn && <Button size="sm" variant="ghost" onClick={() => void removeOptIn(row)}>Remove opt-in</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {optingIn && <OptInDialog cycleId={cycleId} row={optingIn} onClose={() => setOptingIn(null)} onSaved={load} />}
    </div>
  )
}

function OptInDialog({ cycleId, row, onClose, onSaved }: { cycleId: string; row: ParticipantRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await weeklyRequest('/api/admin/weekly/participants', { method: 'POST', body: { cycleId, userId: row.person.id, reason: reason.trim() } })
      toast.success(`${row.person.name} opted in`)
      onClose()
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not opt them in'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Opt ${row.person.name} in`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="opt-in-reason">Reason</Label>
          <Textarea id="opt-in-reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Opt in'}</Button>
        </div>
      </form>
    </Modal>
  )
}
