'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { CalibrationItemView, CalibrationTopicOption } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { judgementBody, JudgementFields, type Judgement } from './JudgementFields'

type Box = 'question' | 'situation' | 'action' | 'result' | 'shortfall'

export function CalibrationItemDialog({ item, topics, onClose, onSaved }: {
  item: CalibrationItemView | null
  topics: CalibrationTopicOption[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [competencyId, setCompetencyId] = useState(item?.competencyId ?? topics[0]?.id ?? '')
  const [fields, setFields] = useState<Record<Box, string>>({
    question: item?.question ?? '', situation: item?.situation ?? '', action: item?.action ?? '', result: item?.result ?? '', shortfall: item?.shortfall ?? '',
  })
  const [judgement, setJudgement] = useState<Judgement>({ hrSufficiency: item?.hrSufficiency ?? 'SUFFICIENT', hrScore: String(item?.hrScore ?? 2), note: item?.note ?? '' })
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const body = { competencyId, ...fields, shortfall: fields.shortfall.trim() || null, ...judgementBody(judgement) }
    try {
      if (item) await weeklyRequest(`/api/admin/weekly/calibration/items/${item.id}`, { method: 'PATCH', body: { op: 'edit', ...body } })
      else await weeklyRequest('/api/admin/weekly/calibration/items', { method: 'POST', body: { source: 'manual', ...body } })
      toast.success(item ? 'Item saved' : 'Item added')
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the item'))
    } finally {
      setSaving(false)
    }
  }

  const box = (key: Box, label: string, rows = 3) => (
    <div className="space-y-1">
      <Label htmlFor={`item-${key}`}>{label}</Label>
      <Textarea id={`item-${key}`} rows={rows} maxLength={4000} required={key !== 'shortfall'} value={fields[key]} onChange={(e) => setFields((current) => ({ ...current, [key]: e.target.value }))} />
    </div>
  )

  return (
    <Modal isOpen onClose={onClose} title={item ? 'Edit a calibration item' : 'Add a calibration item'} size="lg">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted-foreground">Write it already anonymised: say “the person” and “the evaluator”, never names.</p>
        <div className="space-y-1">
          <Label htmlFor="item-topic">Topic</Label>
          <Select value={competencyId} onValueChange={setCompetencyId}>
            <SelectTrigger id="item-topic" aria-label="Topic"><SelectValue placeholder="Choose a topic" /></SelectTrigger>
            <SelectContent>{topics.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({PERSPECTIVE_LABELS[t.perspective].toLowerCase()})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {box('question', 'Question', 2)}
        {box('situation', 'Situation')}
        {box('action', 'What they did')}
        {box('result', 'Result')}
        {box('shortfall', 'What didn’t go well (optional)', 2)}
        <JudgementFields value={judgement} onChange={setJudgement} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !competencyId}>{saving ? 'Saving…' : 'Save item'}</Button>
        </div>
      </form>
    </Modal>
  )
}
