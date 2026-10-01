'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LEVEL_KEYS, LEVEL_LABELS } from '@/lib/weekly/profile'
import type { ReviewAnswerView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

export type DecisionMode = 'SET_SCORE' | 'NOT_ENOUGH_EVIDENCE' | 'EXCLUDE'

function titleFor(mode: DecisionMode, item: ReviewAnswerView): string {
  if (mode === 'SET_SCORE') return item.ai ? 'Set a different score' : 'Score by hand'
  return mode === 'NOT_ENOUGH_EVIDENCE' ? 'Not enough evidence' : 'Exclude this answer'
}

export function DecisionDialog({ item, mode, onClose, onDone }: { item: ReviewAnswerView; mode: DecisionMode; onClose: () => void; onDone: () => Promise<void> }) {
  const [score, setScore] = useState(String(item.ai?.score ?? 2))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const body =
      mode === 'SET_SCORE'
        ? { action: mode, basedOn: item.basedOn, score: Number(score), reason }
        : mode === 'EXCLUDE'
          ? { action: mode, basedOn: item.basedOn, reason }
          : { action: mode, basedOn: item.basedOn, ...(reason.trim() ? { reason: reason.trim() } : {}) }
    try {
      await weeklyRequest(`/api/admin/weekly/review/${item.responseId}`, { method: 'POST', body })
      toast.success('Decision saved')
      await onDone()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the decision'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={titleFor(mode, item)}>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'SET_SCORE' && (
          <div className="space-y-2">
            <Label htmlFor="review-score">Score</Label>
            <Select value={score} onValueChange={setScore}>
              <SelectTrigger id="review-score" aria-label="Score"><SelectValue /></SelectTrigger>
              <SelectContent>{LEVEL_KEYS.map((key) => <SelectItem key={key} value={key}>{key} · {LEVEL_LABELS[key]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        {mode === 'NOT_ENOUGH_EVIDENCE' && (
          <p className="text-sm text-muted-foreground">The answer is kept but not used as evidence, and the topic stays open. The evaluator is not asked again.</p>
        )}
        <div className="space-y-2">
          <Label htmlFor="review-reason">{mode === 'NOT_ENOUGH_EVIDENCE' ? 'Note for the audit log (optional)' : 'Reason'}</Label>
          <Textarea id="review-reason" rows={2} required={mode !== 'NOT_ENOUGH_EVIDENCE'} minLength={mode === 'NOT_ENOUGH_EVIDENCE' ? undefined : 3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save decision'}</Button>
        </div>
      </form>
    </Modal>
  )
}

export function CorrectionDialog({ item, onClose, onDone }: { item: ReviewAnswerView; onClose: () => void; onDone: () => Promise<void> }) {
  const [fields, setFields] = useState({ situation: item.answer.situation, action: item.answer.action, result: item.answer.result, shortfall: item.answer.shortfall ?? '' })
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await weeklyRequest(`/api/admin/weekly/responses/${item.responseId}`, { method: 'PATCH', body: { ...fields, shortfall: fields.shortfall.trim() || null, reason } })
      toast.success('Answer corrected. It will be scored again.')
      await onDone()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not correct the answer'))
    } finally {
      setSaving(false)
    }
  }

  const box = (key: keyof typeof fields, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`correct-${key}`}>{label}</Label>
      <Textarea id={`correct-${key}`} rows={3} maxLength={4000} value={fields[key]} onChange={(e) => set(key)(e.target.value)} />
    </div>
  )

  return (
    <Modal isOpen onClose={onClose} title="Correct the answer’s text" size="lg">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted-foreground">The original is kept in the audit log. The corrected answer is scored again and comes back to you for review.</p>
        {box('situation', 'Situation')}
        {box('action', 'What they did')}
        {box('result', 'Result')}
        {box('shortfall', 'What didn’t go well')}
        <div className="space-y-1">
          <Label htmlFor="correct-reason">Reason</Label>
          <Textarea id="correct-reason" rows={2} required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save correction'}</Button>
        </div>
      </form>
    </Modal>
  )
}
