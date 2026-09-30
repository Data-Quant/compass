'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatKarachiDateTime } from '@/lib/weekly/format'
import type { CloseViewResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

/** Spec 13.3 step 8: the fallback when weekly questions cannot be used. */
export function ClassicFormCard({ cycleId, classic, onChanged }: { cycleId: string; classic: CloseViewResponse['classicForm']; onChanged: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const pairs = `${classic.pairs} evaluator–person pair${classic.pairs === 1 ? '' : 's'}`

  async function set(open: boolean) {
    setConfirming(false)
    setBusy(true)
    try {
      await weeklyRequest('/api/admin/weekly/close', { method: 'POST', body: { action: 'classic-form', cycleId, open } })
      toast.success(open ? 'The classic questionnaire is open for this quarter' : 'The classic questionnaire is closed again')
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change the classic questionnaire'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <h2 className="font-semibold">Classic questionnaire</h2>
        {classic.open ? (
          <>
            <p className="text-sm">
              The classic questionnaire is open{classic.openedAt ? ` (since ${formatKarachiDateTime(classic.openedAt)})` : ''}. {pairs} have classic answers; at close they keep them, and their weekly answers are not used.
            </p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void set(false)}>Close it again</Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              If the weekly questions cannot be used, reopen the classic questionnaire. Weekly questions keep running.{classic.pairs > 0 ? ` ${pairs} already have classic answers.` : ''}
            </p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(true)}>Reopen the classic questionnaire for this quarter</Button>
          </>
        )}
      </CardContent>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void set(true)}
        title="Reopen the classic questionnaire?"
        message="Evaluators can fill in the classic questionnaire for this quarter again, and weekly questions keep running. At close, every evaluator–person pair with classic answers keeps them instead of their weekly evidence. Closing the quarter closes the questionnaire again."
        confirmText="Reopen classic questionnaire"
        variant="warning"
      />
    </Card>
  )
}
