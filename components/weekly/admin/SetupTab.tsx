'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatKarachiDate, weekLabel } from '@/lib/weekly/format'
import { QUESTIONS_PER_PAIR } from '@/lib/weekly/scheduler'
import type { AdminCyclesResponse, AdminPeriodRow, CycleSummary } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const STATUS_LABELS: Record<CycleSummary['status'], string> = { SETUP: 'In setup', RUNNING: 'Running', CLOSED: 'Closed' }
const karachiDateInput = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })

export function SetupTab() {
  const [data, setData] = useState<AdminCyclesResponse | null>(null)
  const [starting, setStarting] = useState<CycleSummary | null>(null)
  const [editing, setEditing] = useState<CycleSummary | null>(null)
  const [removing, setRemoving] = useState<CycleSummary | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<AdminCyclesResponse>('/api/admin/weekly/cycles'))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load cycles'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function start(cycle: CycleSummary) {
    setStarting(null)
    try {
      await weeklyRequest(`/api/admin/weekly/cycles/${cycle.id}`, { method: 'PATCH', body: { action: 'start' } })
      toast.success('Weekly evaluations started')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not start the cycle'))
    }
  }

  async function remove(cycle: CycleSummary) {
    setRemoving(null)
    try {
      await weeklyRequest(`/api/admin/weekly/cycles/${cycle.id}`, { method: 'DELETE' })
      toast.success(`${cycle.periodName} cycle removed`)
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not remove the cycle'))
    }
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  const available = data.periods.filter((p) => !p.cycleId && !p.isLocked)
  return (
    <div className="space-y-6">
      {data.cycles.length === 0 && <p className="text-sm text-muted-foreground">No quarter runs on weekly evaluations yet.</p>}
      {data.cycles.map((cycle) => (
        <Card key={cycle.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{cycle.periodName}</p>
                <Badge variant={cycle.status === 'RUNNING' ? 'default' : 'outline'}>{STATUS_LABELS[cycle.status]}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Week 1 starts {formatKarachiDate(cycle.weekOneStartsOn)} · {cycle.totalWeeks} weeks ({cycle.questionWeeks} with new questions) · {QUESTIONS_PER_PAIR} questions per pair a quarter · {weekLabel(cycle)}
              </p>
            </div>
            {cycle.status === 'SETUP' && (
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setRemoving(cycle)}>Remove</Button>
                <Button variant="outline" onClick={() => setEditing(cycle)}>Edit</Button>
                <Button onClick={() => setStarting(cycle)}>Start</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {available.length > 0 && <NewCycleForm periods={available} onCreated={load} />}
      {editing && <EditCycleDialog cycle={editing} onClose={() => setEditing(null)} onSaved={load} />}
      <ConfirmDialog
        isOpen={starting !== null}
        onClose={() => setStarting(null)}
        onConfirm={() => {
          if (starting) void start(starting)
        }}
        title="Start weekly evaluations?"
        message="The current week’s questions go out at the next daily run (09:00 Karachi time), then every Monday. Once started, the cycle can no longer be removed."
        confirmText="Start now"
        variant="warning"
      />
      <ConfirmDialog
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) void remove(removing)
        }}
        title="Remove this cycle?"
        message="The cycle is deleted. Nothing has been sent yet."
        confirmText="Remove cycle"
        variant="danger"
      />
    </div>
  )
}

function NewCycleForm({ periods, onCreated }: { periods: AdminPeriodRow[]; onCreated: () => Promise<void> }) {
  const [periodId, setPeriodId] = useState('')
  const [weekOne, setWeekOne] = useState('')
  const [questionWeeks, setQuestionWeeks] = useState('')
  const [saving, setSaving] = useState(false)
  const chosen = periods.find((p) => p.id === periodId)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await weeklyRequest('/api/admin/weekly/cycles', { method: 'POST', body: { periodId, weekOneStartsOn: weekOne, ...(questionWeeks ? { questionWeeks: Number(questionWeeks) } : {}) } })
      toast.success('Cycle created')
      setPeriodId('')
      setWeekOne('')
      setQuestionWeeks('')
      await onCreated()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not create the cycle'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={submit} className="space-y-4">
          <h3 className="font-semibold">Run a quarter on weekly evaluations</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="cycle-period">Quarter</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger id="cycle-period" aria-label="Quarter"><SelectValue placeholder="Choose a period" /></SelectTrigger>
                <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-week-one">Week 1 starts (a Monday)</Label>
              <Input id="cycle-week-one" type="date" value={weekOne} onChange={(e) => setWeekOne(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-question-weeks">Question weeks</Label>
              <Input id="cycle-question-weeks" type="number" min={1} max={26} placeholder="Up to the period end" value={questionWeeks} onChange={(e) => setQuestionWeeks(e.target.value)} />
              <p className="text-xs text-muted-foreground">Two catch-up weeks follow them.</p>
            </div>
          </div>
          <p className={`text-sm ${chosen?.isActive ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
            {chosen?.isActive
              ? `${chosen.name} is the active period. You can remove the cycle until it starts.`
              : 'You can remove the cycle until it starts.'}
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving || !periodId || !weekOne}>{saving ? 'Creating…' : 'Create cycle'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function EditCycleDialog({ cycle, onClose, onSaved }: { cycle: CycleSummary; onClose: () => void; onSaved: () => Promise<void> }) {
  const [weekOne, setWeekOne] = useState(karachiDateInput(cycle.weekOneStartsOn))
  const [questionWeeks, setQuestionWeeks] = useState(String(cycle.questionWeeks))
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await weeklyRequest(`/api/admin/weekly/cycles/${cycle.id}`, { method: 'PATCH', body: { action: 'update', weekOneStartsOn: weekOne, questionWeeks: Number(questionWeeks) } })
      toast.success('Cycle updated')
      onClose()
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update the cycle'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Edit ${cycle.periodName}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-week-one">Week 1 starts (a Monday)</Label>
          <Input id="edit-week-one" type="date" value={weekOne} onChange={(e) => setWeekOne(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-question-weeks">Question weeks</Label>
          <Input id="edit-question-weeks" type="number" min={1} max={26} value={questionWeeks} onChange={(e) => setQuestionWeeks(e.target.value)} required />
          <p className="text-xs text-muted-foreground">Two catch-up weeks follow them.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}
