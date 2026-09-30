'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { ReviewAnswerView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { judgementBody, JudgementFields, type Judgement } from './JudgementFields'

/** Prefilled from the latest decision: "asked for more detail" means not enough evidence; otherwise HR's or the AI's score. */
function prefill(item: ReviewAnswerView): Judgement {
  const decision = item.decision
  if (decision?.action === 'MARKED_INSUFFICIENT') return { hrSufficiency: 'INSUFFICIENT', hrScore: '2', note: '' }
  return { hrSufficiency: 'SUFFICIENT', hrScore: String(Math.round(decision?.finalScore ?? item.ai?.score ?? 2)), note: '' }
}

export function AddToCalibrationDialog({ item, onClose, onDone }: { item: ReviewAnswerView; onClose: () => void; onDone: () => Promise<void> }) {
  const [judgement, setJudgement] = useState<Judgement>(() => prefill(item))
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await weeklyRequest('/api/admin/weekly/calibration/items', { method: 'POST', body: { source: 'answer', responseId: item.responseId, ...judgementBody(judgement) } })
      toast.success('Added to the calibration set')
      await onDone()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not add the answer'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Add to the calibration set">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The question and answer are copied with {item.evaluator.name}’s and {item.evaluatee.name}’s names replaced by “the evaluator” and “the person”.
          Your judgement is the target each model is measured against.
        </p>
        <JudgementFields value={judgement} onChange={setJudgement} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add to set'}</Button>
        </div>
      </form>
    </Modal>
  )
}
