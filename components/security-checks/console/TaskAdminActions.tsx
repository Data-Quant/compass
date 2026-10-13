'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ConsoleTaskView } from '@/lib/security-checks/service/review-queue'

interface TaskAdminActionsProps {
  task: ConsoleTaskView
  busy: boolean
  onAction: (action: 'reopen' | 'extend' | 'exempt' | 'not-applicable', body: Record<string, string>) => void
}

/** Reopen, extend (max 30 days past the original deadline), exempt, task-level N/A. */
export function TaskAdminActions({ task, busy, onAction }: TaskAdminActionsProps) {
  const [reason, setReason] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const { actions } = task
  if (!actions.canReopen && !actions.canExtend && !actions.canExempt && !actions.canMarkNa) return null
  const needsReason = reason.trim().length < 3
  const maxDate = new Date(new Date(task.originalDeadline).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Task actions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="admin-reason">Reason (logged)</Label>
          <Input id="admin-reason" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {actions.canExtend && (
            <>
              <div className="space-y-1">
                <Label htmlFor="new-deadline">New deadline (by {maxDate})</Label>
                <Input id="new-deadline" type="date" max={maxDate} value={newDeadline} onChange={(event) => setNewDeadline(event.target.value)} />
              </div>
              <Button variant="outline" disabled={busy || needsReason || !newDeadline} onClick={() => onAction('extend', { newDeadline, reason })}>Extend</Button>
            </>
          )}
          {actions.canExempt && <Button variant="outline" disabled={busy || needsReason} onClick={() => onAction('exempt', { reason })}>Exempt this cycle</Button>}
          {actions.canMarkNa && <Button variant="outline" disabled={busy || needsReason} onClick={() => onAction('not-applicable', { reason })}>Mark not applicable</Button>}
          {actions.canReopen && <Button variant="outline" disabled={busy || needsReason} onClick={() => onAction('reopen', { reason })}>Reopen for review</Button>}
        </div>
      </CardContent>
    </Card>
  )
}
