'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TaskDetailView } from '@/lib/security-checks/service/task-views'
import { HistoryList } from './HistoryList'
import { InstructionsPanel } from './InstructionsPanel'
import { TaskStatusBadge } from './StatusBadge'
import { SubtaskCard, type SubtaskDraft } from './SubtaskCard'
import { dueLabel, formatDate } from './format'
import { errorMessage, scRequest } from './sc-api'

const EXPIRY_TEXT: Record<string, string> = {
  NO_SUBMISSION: 'Nothing was submitted by the deadline.',
  WINDOW_LAPSED: 'The resubmission window closed before a resubmission.',
  REJECTED_POST_CLOSE: 'The final resubmission was not accepted.',
  UNREVIEWED: 'The submission was not reviewed in time; the Security team has been notified.',
}

function draftOf(subtask: TaskDetailView['subtasks'][number]): SubtaskDraft {
  return {
    answers: { ...subtask.answers },
    declarationConfirmed: subtask.declarationConfirmed,
    naRequested: subtask.naRequested,
    naJustification: subtask.naJustification ?? '',
  }
}

function StatusSummary({ task }: { task: TaskDetailView }) {
  const lines: string[] = []
  if (task.status === 'NOT_STARTED' || task.status === 'IN_PROGRESS') lines.push(`${dueLabel(task.deadline)} (deadline ${formatDate(task.deadline)})`)
  if ((task.status === 'REJECTED' || task.status === 'REQUIRES_INFO') && task.resubmitDueAt) lines.push(`Resubmit by ${formatDate(task.resubmitDueAt)}`)
  if (task.status === 'PENDING_REVIEW') lines.push('Submitted — the Security team will review it.')
  if (task.status === 'VERIFIED') lines.push('Verified. Nothing more to do this cycle.')
  if (task.status === 'EXEMPT') lines.push(`Exempt this cycle${task.exemptionReason ? `: ${task.exemptionReason}` : ''}`)
  if (task.status === 'NOT_APPLICABLE') lines.push(`Not applicable${task.naReason ? `: ${task.naReason}` : ''}`)
  if (task.status === 'CANCELLED') lines.push(`Cancelled${task.cancelReason ? `: ${task.cancelReason}` : ''}`)
  if (task.status === 'EXPIRED' && task.expiryReason) lines.push(EXPIRY_TEXT[task.expiryReason] ?? 'Expired.')
  if (task.extension) lines.push(`Deadline extended to ${formatDate(task.deadline)}`)
  if (task.lateEnrollment) lines.push('You joined after this cycle opened, so you have your own deadline.')
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      {lines.map((line) => <p key={line}>{line}</p>)}
    </div>
  )
}

export function TaskWorkspace({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<TaskDetailView | null>(null)
  const [drafts, setDrafts] = useState<Record<string, SubtaskDraft>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attested, setAttested] = useState(false)
  const [newTool, setNewTool] = useState('')
  const attestId = useId()

  /** keepDrafts preserves unsaved answers when only files changed. */
  const apply = useCallback((next: TaskDetailView, keepDrafts: boolean) => {
    setTask(next)
    setDrafts((previous) =>
      Object.fromEntries(next.subtasks.map((subtask) => [subtask.id, keepDrafts && previous[subtask.id] ? previous[subtask.id] : draftOf(subtask)])),
    )
  }, [])

  const reload = useCallback(
    (keepDrafts: boolean) =>
      scRequest<TaskDetailView>(`/api/security-checks/tasks/${taskId}`)
        .then((next) => apply(next, keepDrafts))
        .catch((e: unknown) => setError(errorMessage(e, 'Could not load this check'))),
    [apply, taskId],
  )

  useEffect(() => {
    void reload(false)
  }, [reload])

  const run = async (work: () => Promise<TaskDetailView | void>, keepDrafts = false) => {
    setBusy(true)
    setError(null)
    try {
      const next = await work()
      if (next) apply(next, keepDrafts)
      else await reload(keepDrafts)
    } catch (e: unknown) {
      setError(errorMessage(e, 'Something went wrong'))
    } finally {
      setBusy(false)
    }
  }

  const saveBody = () => ({
    subtasks: (task?.subtasks ?? [])
      .filter((subtask) => subtask.editable)
      .map((subtask) => ({ id: subtask.id, ...drafts[subtask.id], naJustification: drafts[subtask.id]?.naJustification || null })),
  })
  const save = () => run(() => scRequest<TaskDetailView>(`/api/security-checks/tasks/${taskId}`, { method: 'PATCH', body: saveBody() }))
  const submit = () =>
    run(async () => {
      await scRequest(`/api/security-checks/tasks/${taskId}`, { method: 'PATCH', body: saveBody() })
      const next = await scRequest<TaskDetailView>(`/api/security-checks/tasks/${taskId}/submit`, { method: 'POST', body: { confirmed: true } })
      setAttested(false)
      return next
    })
  const manageSubtask = (body: Record<string, string>) =>
    run(() => scRequest<TaskDetailView>(`/api/security-checks/tasks/${taskId}/subtasks`, { method: 'POST', body }), true)

  if (error && !task) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!task) return <LoadingScreen message="Loading security check..." />
  const showNames = task.subtasks.some((subtask) => subtask.source !== 'TASK')

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <Link href="/security-checks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All security checks
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{task.campaign.name}</h1>
          <StatusSummary task={task} />
        </div>
        <TaskStatusBadge status={task.status} />
      </div>
      <InstructionsPanel campaign={task.campaign} />
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {task.subtasks.map((subtask) => (
          <SubtaskCard
            key={subtask.id}
            taskId={task.id}
            subtask={subtask}
            draft={drafts[subtask.id] ?? draftOf(subtask)}
            questions={task.campaign.questions}
            evidenceRequired={task.campaign.evidenceRequired}
            fileLimit={task.campaign.fileLimit}
            showName={showNames}
            canManage={task.canManageSubtasks}
            onChange={(draft) => setDrafts((previous) => ({ ...previous, [subtask.id]: draft }))}
            onFilesChanged={() => void reload(true)}
            onRemoveFile={(fileId) => void run(() => scRequest(`/api/security-checks/evidence/${fileId}`, { method: 'DELETE' }).then(() => undefined), true)}
            onRename={(name) => void manageSubtask({ action: 'rename', subtaskId: subtask.id, name })}
            onDelete={() => void manageSubtask({ action: 'delete', subtaskId: subtask.id })}
          />
        ))}
      </div>

      {task.canManageSubtasks && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-2 p-4">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label htmlFor="new-tool">Add a tool you use</Label>
              <Input id="new-tool" value={newTool} maxLength={200} placeholder="e.g. Notion" onChange={(event) => setNewTool(event.target.value)} />
            </div>
            <Button disabled={busy || newTool.trim().length < 2} onClick={() => void manageSubtask({ action: 'add', name: newTool.trim() }).then(() => setNewTool(''))}>
              Add
            </Button>
            <p className="w-full text-xs text-muted-foreground">You can add, rename or remove tools until you first submit. After that the list is locked.</p>
          </CardContent>
        </Card>
      )}

      {task.canEdit && (
        <Card>
          <CardContent className="space-y-3 p-4">
            {task.submitWillBeFinal && (
              <p className="rounded-md bg-destructive/5 p-3 text-sm text-destructive">
                This will be your final resubmission. If it is not accepted, the task closes and is checked again next cycle.
              </p>
            )}
            <div className="flex items-start gap-2">
              <Checkbox id={attestId} checked={attested} onCheckedChange={(value) => setAttested(value === true)} />
              <Label htmlFor={attestId} className="font-normal leading-snug">
                I confirm my answers and evidence are accurate and contain no codes, QR codes, secrets or passwords.
              </Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void save()}>Save draft</Button>
              <Button disabled={busy || !attested || !task.canSubmit} onClick={() => void submit()}>
                {task.status === 'REJECTED' || task.status === 'REQUIRES_INFO' ? 'Resubmit' : 'Submit'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent><HistoryList entries={task.history} /></CardContent>
      </Card>
    </div>
  )
}
