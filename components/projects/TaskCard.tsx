'use client'

import Link from 'next/link'
import { CalendarDays, CheckCircle2, CornerDownRight, GripVertical, ListChecks, Loader2, MessageSquare } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PeopleStack } from './PeopleStack'
import type { PanelTask } from './TaskDetailPanel'
import { dueState, PRIORITY_ICON, PRIORITY_LABEL, type DueStateKind } from './workspace-utils'

interface TaskCardProps {
  task: PanelTask
  overdue: boolean
  done: boolean
  /** Overall board only: renders the project chip. */
  project?: { id: string; name: string; color: string | null }
  onOpen?: () => void
  /** Overall board only: renders the grip. */
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  /** DragOverlay copy. */
  dragging?: boolean
  pending?: boolean
  /** Per-project board: -1 so the sortable wrapper is the card's only tab stop. */
  titleTabIndex?: number
}

const DUE_CLASS: Record<DueStateKind, string> = {
  none: 'text-muted-foreground',
  normal: 'text-muted-foreground',
  soon: 'font-medium text-amber-700 dark:text-amber-400',
  overdue: 'rounded-[4px] bg-red-500/10 px-1.5 py-0.5 font-medium text-red-600 dark:text-red-400',
  done: 'text-muted-foreground',
}

export function TaskCard({ task, overdue, done, project, onOpen, dragHandleProps, dragging, pending, titleTabIndex }: TaskCardProps) {
  const due = dueState(task.dueDate, { done, overdue })
  const { icon: PriorityIcon, className: priorityTone } = PRIORITY_ICON[task.priority]
  const assistants = task.assistants ?? []
  const labels = task.labelAssignments
  const children = task.childTasks ?? []
  const childrenDone = children.filter((child) => child.status === 'DONE').length
  const comments = task._count.comments

  const srPeople = task.assignee
    ? `Assigned to ${task.assignee.name}${assistants.length ? `, with ${assistants.map((a) => a.user.name).join(', ')}` : ''}.`
    : 'Unassigned.'
  const srDue = due.kind === 'none' ? 'No due date.' : `Due ${due.label}${due.lateLabel ? `, ${due.lateLabel}` : ''}.`

  return (
    <Card
      aria-busy={pending || undefined}
      className={cn(
        'group/card relative flex flex-col gap-2 rounded-lg border-border/60 bg-card p-3 text-left shadow-sm transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
        dragging && 'border-primary/40',
        pending && 'opacity-60',
      )}
    >
      {(project || dragHandleProps || pending) && (
        <div className="flex items-start gap-2">
          {project && (
            <Link
              href={`/projects/${project.id}`}
              className="relative z-10 inline-flex min-w-0 max-w-full items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: project.color || '#94a3b8' }} />
              <span className="truncate">{project.name}</span>
            </Link>
          )}
          {pending ? (
            <Loader2 aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : dragHandleProps && (
            <button
              type="button"
              {...dragHandleProps}
              className="relative z-10 -mr-1 -mt-1 ml-auto touch-none rounded p-1 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover/card:opacity-100 [@media(hover:none)]:opacity-100"
              aria-label={`Move ${task.title}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Stretched button: its ::after covers the card, so the whole card opens the task. */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        tabIndex={titleTabIndex}
        className={cn(
          'line-clamp-2 break-words text-left text-sm font-medium leading-5 after:absolute after:inset-0 after:content-[\'\'] focus-visible:outline-none disabled:cursor-default',
          done ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {task.title}
        <span className="sr-only"> {srPeople} {srDue}</span>
      </button>

      {task.parentTask && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CornerDownRight aria-hidden className="h-3 w-3 shrink-0" />
          <span className="truncate">{task.parentTask.title}</span>
        </div>
      )}

      {labels.length > 0 && (
        <div className="flex gap-1 overflow-hidden">
          {labels.slice(0, 3).map(({ label }) => (
            <span
              key={label.id}
              className="shrink-0 rounded-[4px] px-1.5 py-px text-[11px] font-medium leading-4"
              style={{ backgroundColor: `${label.color}1f`, color: label.color }}
            >
              {label.name}
            </span>
          ))}
          {labels.length > 3 && <span className="text-[11px] text-muted-foreground">+{labels.length - 3}</span>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="relative z-10 flex min-w-0 items-center">
          <PeopleStack assignee={task.assignee} assistants={assistants} size="sm" />
        </span>
        <span className={cn('ml-auto inline-flex shrink-0 items-center gap-1 text-xs tabular-nums', DUE_CLASS[due.kind])} title={due.title}>
          <CalendarDays aria-hidden className="h-3.5 w-3.5" />
          {due.label}
          {due.lateLabel && <span>{due.lateLabel}</span>}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <PriorityIcon aria-hidden className={cn('h-3.5 w-3.5 shrink-0', priorityTone)} />
          {PRIORITY_LABEL[task.priority]}
        </span>
        <span className="ml-auto flex items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground">
          {children.length > 0 && (
            <span className="inline-flex items-center gap-1" title="Subtasks done">
              <ListChecks aria-hidden className="h-3.5 w-3.5" />
              {childrenDone}/{children.length}
            </span>
          )}
          {comments > 0 && (
            <span className="inline-flex items-center gap-1" title="Comments">
              <MessageSquare aria-hidden className="h-3.5 w-3.5" />
              {comments}
            </span>
          )}
          {task.completedLate && <span className="text-orange-700 dark:text-orange-400">Completed late</span>}
          {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Done" />}
        </span>
      </div>
    </Card>
  )
}
