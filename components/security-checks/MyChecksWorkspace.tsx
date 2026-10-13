'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Card, CardContent } from '@/components/ui/card'
import type { NotificationView } from '@/lib/security-checks/service/inbox'
import type { TaskListItem } from '@/lib/security-checks/service/task-views'
import { NotificationsCard } from './NotificationsCard'
import { TaskStatusBadge } from './StatusBadge'
import { dueLabel, formatDate } from './format'
import { errorMessage, scRequest } from './sc-api'

function TaskRow({ task }: { task: TaskListItem }) {
  const due = task.resubmitDueAt ?? task.deadline
  return (
    <Link
      href={`/security-checks/${task.id}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <p className="font-medium text-foreground">{task.campaignName}</p>
        <p className="text-sm text-muted-foreground">
          {task.control} · cycle {task.cycleNumber}
          {task.lateEnrollment && ' · late enrollment'}
          {task.extended && ' · extended'}
        </p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        {task.needsAction && <span className="text-muted-foreground">{dueLabel(due)}</span>}
        {!task.needsAction && <span className="text-muted-foreground">Deadline {formatDate(task.deadline)}</span>}
        <TaskStatusBadge status={task.status} />
      </div>
    </Link>
  )
}

function Section({ title, tasks, empty }: { title: string; tasks: TaskListItem[]; empty: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {tasks.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : tasks.map((task) => <TaskRow key={task.id} task={task} />)}
    </section>
  )
}

export function MyChecksWorkspace() {
  const [tasks, setTasks] = useState<TaskListItem[] | null>(null)
  const [notifications, setNotifications] = useState<NotificationView[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([scRequest<TaskListItem[]>('/api/security-checks/tasks'), scRequest<NotificationView[]>('/api/security-checks/notifications')])
      .then(([taskList, inbox]) => {
        setTasks(taskList)
        setNotifications(inbox)
        setError(null)
      })
      .catch((e: unknown) => setError(errorMessage(e, 'Could not load your security checks')))
  }, [])

  useEffect(load, [load])

  const markAllRead = () => {
    scRequest('/api/security-checks/notifications', { method: 'POST', body: { all: true } })
      .then(load)
      .catch((e: unknown) => setError(errorMessage(e, 'Could not update notifications')))
  }

  if (error && !tasks) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!tasks) return <LoadingScreen message="Loading security checks..." />

  const actionable = tasks.filter((task) => task.needsAction)
  const waiting = tasks.filter((task) => task.status === 'PENDING_REVIEW')
  const done = tasks.filter((task) => !task.needsAction && task.status !== 'PENDING_REVIEW')

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Confirm the security controls the Security team asks about, with a screenshot where needed.
      </p>
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Compass emails about security checks never contain links or codes. If you get one that does, report it to the Security team.
        </CardContent>
      </Card>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <Section title="Needs your action" tasks={actionable} empty="Nothing to do right now." />
          <Section title="Waiting for review" tasks={waiting} empty="Nothing waiting for review." />
          <Section title="History" tasks={done} empty="No completed checks yet." />
        </div>
        <NotificationsCard notifications={notifications} taskHref={(id) => `/security-checks/${id}`} onMarkAllRead={markAllRead} />
      </div>
    </div>
  )
}
