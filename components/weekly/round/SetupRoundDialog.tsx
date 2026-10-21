'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { defaultQuestionWeeks, parseCalendarDate, parseWeekOneStart, startOfKarachiDay } from '@/lib/weekly/calendar'
import { nextRoundDefaults } from '@/lib/weekly/round-defaults'
import { roundSchedule } from '@/lib/weekly/round-schedule'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { RoundScheduleSummary } from './RoundScheduleSummary'

export interface RoundForm { name: string; startDate: string; endDate: string; weekOneStartsOn: string; questionWeeks: string; reviewDeadline: string }

interface SetupRoundDialogProps {
  onClose: () => void
  onCreated: (periodId: string) => Promise<void>
  /** Changing the dates of a round that has not opened yet, instead of setting up a new one. */
  edit?: { periodId: string; initial: RoundForm }
}

type DateField = 'startDate' | 'endDate' | 'weekOneStartsOn' | 'reviewDeadline'

/** Draft step 1: the quarter and its weekly schedule in one form, with the exact dates it gives. */
export function SetupRoundDialog({ onClose, onCreated, edit }: SetupRoundDialogProps) {
  // Prefilled with the next quarter (UX spec, HR step 1); HR can change anything.
  const [form, setForm] = useState<RoundForm>(() => {
    if (edit) return edit.initial
    const d = nextRoundDefaults(new Date())
    return { name: d.name, startDate: d.startDate, endDate: d.endDate, weekOneStartsOn: d.weekOneStartsOn, questionWeeks: String(d.questionWeeks), reviewDeadline: '' }
  })
  const [saving, setSaving] = useState(false)
  const set = (key: keyof RoundForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  // The schedule as typed: how many question weeks fit, and the exact dates they give.
  const preview = useMemo(() => {
    const weekOne = parseWeekOneStart(form.weekOneStartsOn)
    const end = parseCalendarDate(form.endDate)
    if (!weekOne) return { problem: 'Pick a weekday (Monday to Friday) for the first questions to see the schedule.' } as const
    if (!end) return { problem: 'Enter when the quarter ends to see the schedule.' } as const
    const room = defaultQuestionWeeks(weekOne, startOfKarachiDay(end))
    const weeks = Number(form.questionWeeks) || room
    if (weeks > room) return { problem: `This quarter has room for at most ${room} question weeks after the first questions, plus the 2 closing weeks.`, room } as const
    return { schedule: roundSchedule(weekOne, weeks), room } as const
  }, [form.weekOneStartsOn, form.endDate, form.questionWeeks])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const body = {
        name: form.name, startDate: form.startDate, endDate: form.endDate, weekOneStartsOn: form.weekOneStartsOn,
        ...(form.questionWeeks ? { questionWeeks: Number(form.questionWeeks) } : {}),
        ...(form.reviewDeadline ? { reviewDeadline: form.reviewDeadline } : {}),
      }
      if (edit) {
        await weeklyRequest(`/api/admin/rounds/${encodeURIComponent(edit.periodId)}`, { method: 'PUT', body })
        toast.success('Dates saved')
        await onCreated(edit.periodId)
      } else {
        const result = await weeklyRequest<{ periodId: string }>('/api/admin/rounds', { method: 'POST', body })
        toast.success('Round set up. Nobody else sees it until you open the review stage.')
        await onCreated(result.periodId)
      }
    } catch (e) {
      toast.error(errorMessage(e, edit ? 'Could not save the dates' : 'Could not set up the round'))
    } finally {
      setSaving(false)
    }
  }

  const dateInput = (id: DateField, label: string, hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`round-${id}`}>{label}</Label>
      <Input id={`round-${id}`} type="date" value={form[id]} onChange={(e) => set(id)(e.target.value)} required={id !== 'reviewDeadline'} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )

  return (
    <Modal isOpen onClose={onClose} title={edit ? 'Change the round’s dates' : 'Set up a round'} size="lg">
      <form onSubmit={submit} className="space-y-6">
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">The quarter</h3>
            <p className="text-xs text-muted-foreground">Names the quarter in reports and analytics, and limits how many question weeks fit. It does not decide when questions go out.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="round-name">Quarter name</Label>
            <Input id="round-name" placeholder="Q1 2027" value={form.name} onChange={(e) => set('name')(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {dateInput('startDate', 'Quarter starts')}
            {dateInput('endDate', 'Quarter ends')}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">The weekly schedule</h3>
            <p className="text-xs text-muted-foreground">This is what people see: when questions go out, and when the round concludes.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {dateInput('weekOneStartsOn', 'First questions go out', 'Any weekday; every later week starts on a Monday')}
            <div className="space-y-1">
              <Label htmlFor="round-weeks">Question weeks</Label>
              <Input id="round-weeks" type="number" min={1} max={26} value={form.questionWeeks} onChange={(e) => set('questionWeeks')(e.target.value)} />
              <p className="text-xs text-muted-foreground">{preview.room ? `Up to ${preview.room} fit this quarter. ` : ''}2 closing weeks always follow.</p>
            </div>
          </div>
          {dateInput('reviewDeadline', 'List review ends', 'Before the round opens, people check who they evaluate and ask for changes. Optional: a week from today if empty.')}
        </section>

        <section className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4">
          <h3 className="text-sm font-semibold">The round, date by date</h3>
          {'schedule' in preview && preview.schedule
            ? <RoundScheduleSummary schedule={preview.schedule} />
            : <p className="text-sm text-muted-foreground">{preview.problem}</p>}
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : edit ? 'Save dates' : 'Set up round'}</Button>
        </div>
      </form>
    </Modal>
  )
}
