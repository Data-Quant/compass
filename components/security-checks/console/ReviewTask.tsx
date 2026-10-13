'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ConsoleTaskView } from '@/lib/security-checks/service/review-queue'
import { HistoryList } from '../HistoryList'
import { TaskStatusBadge } from '../StatusBadge'
import { formatDate } from '../format'
import { errorMessage, scRequest } from '../sc-api'
import { SubtaskReview } from './SubtaskReview'
import { TaskAdminActions } from './TaskAdminActions'

export function ReviewTask({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<ConsoleTaskView | null>(null)
  const [justification, setJustification] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    scRequest<ConsoleTaskView>(`/api/security-checks/console/tasks/${taskId}`)
      .then(setTask)
      .catch((e: unknown) => setError(errorMessage(e, 'Could not load this task')))
  }, [taskId])
  useEffect(load, [load])

  const act = async (action: string, body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const selfReview = task?.actions.ownTask && justification.trim() ? { selfReviewJustification: justification.trim() } : {}
      setTask(await scRequest<ConsoleTaskView>(`/api/security-checks/console/tasks/${taskId}/${action}`, { method: 'POST', body: { ...body, ...(action === 'prohibited' ? {} : selfReview) } }))
    } catch (e: unknown) {
      setError(errorMessage(e, 'The action failed'))
    } finally {
      setBusy(false)
    }
  }

  if (error && !task) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!task) return <LoadingScreen message="Loading task..." />
  const showNames = task.subtasks.some((subtask) => subtask.source !== 'TASK')
  const pendingCount = task.subtasks.filter((subtask) => subtask.status === 'PENDING_REVIEW').length

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
      <Link href="/security-checks/console/review" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Review queue</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{task.owner.name}</h1>
          <p className="text-sm text-muted-foreground">{task.owner.department ?? 'No department'} · {task.campaign.name} · cycle {task.cycle.number}</p>
          <p className="text-sm text-muted-foreground">
            Deadline {formatDate(task.deadline)} · task close {formatDate(task.taskCloseAt)} · wrap-up ends {formatDate(task.wrapUpEndAt)}
            {task.reviewDueAt && ` · review by ${formatDate(task.reviewDueAt)}`}
            {task.finalRoundAt && ' · final round'}
          </p>
        </div>
        <TaskStatusBadge status={task.status} />
      </div>
      {task.unreviewedFlag && <p className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" /> Expired without a review.</p>}
      {!task.capabilities.review && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Read-only access. Every evidence view is logged.</p>}

      {task.actions.ownTask && task.capabilities.review && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm text-destructive">This is your own task. Only act on it as a last-resort self-review (the other Security Admin is deactivated, on leave, or has not reviewed for 5 business days). It will be flagged and reported.</p>
            <Label htmlFor="justification">Self-review justification</Label>
            <Textarea id="justification" value={justification} maxLength={1000} onChange={(event) => setJustification(event.target.value)} />
          </CardContent>
        </Card>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {task.actions.canReview && pendingCount > 1 && (
        <Button disabled={busy} onClick={() => void act('approve-all', {})}>Approve all ({pendingCount})</Button>
      )}
      <div className="space-y-3">
        {task.subtasks.map((subtask) => (
          <SubtaskReview
            key={subtask.id}
            subtask={subtask}
            questions={subtask.source === 'DECLARATION' ? [] : task.campaign.questions}
            showName={showNames}
            canReview={task.actions.canReview}
            canDownload={task.capabilities.review}
            busy={busy}
            onVerdict={(action, reason) => void act('verdict', { subtaskId: subtask.id, action, ...(reason.trim() ? { reason: reason.trim() } : {}) })}
            onProhibited={(fileId, reason) => void act('prohibited', { fileId, reason: reason.trim() })}
          />
        ))}
      </div>

      <TaskAdminActions task={task} busy={busy} onAction={(action, body) => void act(action, body)} />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent><HistoryList entries={task.history} names={task.historyNames} /></CardContent>
      </Card>
    </div>
  )
}
