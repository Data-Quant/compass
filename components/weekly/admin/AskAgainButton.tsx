'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PERSPECTIVE_LABELS, type Perspective } from '@/lib/weekly/perspectives'
import type { MoreEvidenceResponse, PersonRef } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export function AskAgainButton({ cycleId, evaluatee, perspective, onDone }: { cycleId: string; evaluatee: PersonRef; perspective: Perspective; onDone?: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const group = PERSPECTIVE_LABELS[perspective].toLowerCase()

  async function ask() {
    setConfirming(false)
    setBusy(true)
    try {
      const result = await weeklyRequest<MoreEvidenceResponse>('/api/admin/weekly/more-evidence', { method: 'POST', body: { cycleId, evaluateeId: evaluatee.id, perspective } })
      toast.success(result.prompts === 0
        ? 'Asked again: no new questions (every topic already has an open question or waits for a decision)'
        : `Asked again: ${plural(result.prompts, 'new question')} for ${plural(result.evaluators, 'evaluator')}`)
      await onDone?.()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not ask again'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} aria-label={`Ask again about ${evaluatee.name} (${group})`} onClick={() => setConfirming(true)}>Ask again</Button>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void ask()}
        title={`Ask again about ${evaluatee.name}?`}
        message={`Each evaluator in this group (${group}) gets a new question now for every topic without accepted evidence, beyond their weekly limit, and one email today. Closed topics are reopened.`}
        confirmText="Ask again"
        variant="info"
      />
    </>
  )
}
