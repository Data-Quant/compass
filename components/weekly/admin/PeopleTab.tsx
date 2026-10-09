'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { AdminCyclesResponse, CycleSummary, ParticipantRow, ParticipantsResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { useRoundCycle } from '../round/RoundContext'
import { PairWindowsCard } from './PairWindowsCard'
import { ReviewStageCard } from './ReviewStageCard'
import { ListImportDialog } from './ListImportDialog'
import { RoundPeopleTable } from './RoundPeopleTable'

const EXCLUSION_LABELS: Record<NonNullable<ParticipantRow['exclusion']>, string> = {
  NOT_EVALUATED: 'Not evaluated (named leader or Partner)',
  FILLED_BY_HR: 'Partner: HR fills in their evaluations',
  INACTIVE: 'No longer active',
  LEFT: 'Has left',
  JOINED_LATE: 'Joined after the round opened',
}

/** The cycles, and the one being worked on: the Evaluation round page's round when inside it. */
export function useCycles() {
  const roundCycleId = useRoundCycle()
  const [cycles, setCycles] = useState<CycleSummary[]>([])
  const [chosen, setCycleId] = useState('')
  const cycleId = roundCycleId ?? chosen
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
  const roundCycleId = useRoundCycle()
  if (roundCycleId || cycles.length < 2) return null
  return (
    <Select value={cycleId} onValueChange={onChange}>
      <SelectTrigger className="w-72" aria-label="Cycle"><SelectValue /></SelectTrigger>
      <SelectContent>{cycles.map((c) => <SelectItem key={c.id} value={c.id}>{c.periodName}</SelectItem>)}</SelectContent>
    </Select>
  )
}

export function PeopleTab() {
  const { cycles, cycleId, setCycleId } = useCycles()
  const periodId = cycles.find((c) => c.id === cycleId)?.periodId ?? ''
  const [data, setData] = useState<ParticipantsResponse | null>(null)
  const [optingIn, setOptingIn] = useState<ParticipantRow | null>(null)
  const [importing, setImporting] = useState(false)

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
      {periodId && <ReviewStageCard key={periodId} periodId={periodId} />}
      {cycleId && <PairWindowsCard key={cycleId} cycleId={cycleId} />}
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setImporting(true)}>Import lists from a spreadsheet</Button></div>
      <RoundPeopleTable cycleId={cycleId} rows={data.rows} exclusionLabels={EXCLUSION_LABELS} onChanged={load} onOptIn={setOptingIn} onRemoveOptIn={(row) => void removeOptIn(row)} />
      {importing && <ListImportDialog cycleId={cycleId} onClose={() => setImporting(false)} onSaved={load} />}
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
