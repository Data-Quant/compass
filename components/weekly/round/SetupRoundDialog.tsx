'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { errorMessage, weeklyRequest } from '../weekly-api'

type DateField = 'startDate' | 'endDate' | 'weekOneStartsOn' | 'reviewDeadline'
const field = (id: DateField, label: string, hint?: string) => ({ id, label, hint })

/** Draft step 1: the quarter and its weekly schedule in one form. */
export function SetupRoundDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (periodId: string) => Promise<void> }) {
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', weekOneStartsOn: '', questionWeeks: '11', reviewDeadline: '' })
  const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const body = {
        name: form.name, startDate: form.startDate, endDate: form.endDate, weekOneStartsOn: form.weekOneStartsOn,
        ...(form.questionWeeks ? { questionWeeks: Number(form.questionWeeks) } : {}),
        ...(form.reviewDeadline ? { reviewDeadline: form.reviewDeadline } : {}),
      }
      const result = await weeklyRequest<{ periodId: string }>('/api/admin/rounds', { method: 'POST', body })
      toast.success('Round set up. Nobody else sees it until you open the review stage.')
      await onCreated(result.periodId)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not set up the round'))
    } finally {
      setSaving(false)
    }
  }

  const dates = [
    field('startDate', 'Quarter starts'), field('endDate', 'Quarter ends'),
    field('weekOneStartsOn', 'Weekly questions start', 'A Monday'), field('reviewDeadline', 'Review stage ends', 'Optional: a week from today if empty'),
  ] as const
  return (
    <Modal isOpen onClose={onClose} title="Set up a round">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="round-name">Quarter name</Label>
          <Input id="round-name" placeholder="Q1 2027" value={form.name} onChange={(e) => set('name')(e.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {dates.map((d) => (
            <div key={d.id} className="space-y-1">
              <Label htmlFor={`round-${d.id}`}>{d.label}</Label>
              <Input id={`round-${d.id}`} type="date" value={form[d.id]} onChange={(e) => set(d.id)(e.target.value)} required={d.id !== 'reviewDeadline'} />
              {d.hint && <p className="text-xs text-muted-foreground">{d.hint}</p>}
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="round-weeks">Question weeks</Label>
          <Input id="round-weeks" type="number" min={1} max={26} value={form.questionWeeks} onChange={(e) => set('questionWeeks')(e.target.value)} />
          <p className="text-xs text-muted-foreground">Two catch-up weeks follow them.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Setting up…' : 'Set up round'}</Button>
        </div>
      </form>
    </Modal>
  )
}
