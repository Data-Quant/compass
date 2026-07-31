'use client'

import { UserAvatar } from '@/components/composed/UserAvatar'
import { Circle, CheckCircle2, Clock, Flag, MessageSquare, Calendar, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { calculateTaskVariance, PROJECT_TASK_TIME_ZONE } from '@/lib/project-progress'
import type { PanelTask } from './TaskDetailPanel'

const TASK_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  timeZone: PROJECT_TASK_TIME_ZONE,
  month: 'short',
  day: 'numeric',
})

const STATUS_ICON: Record<string, { icon: typeof Circle; color: string }> = {
  TODO: { icon: Circle, color: 'text-slate-400' },
  IN_PROGRESS: { icon: Clock, color: 'text-blue-400' },
  DONE: { icon: CheckCircle2, color: 'text-emerald-400' },
}

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-400',
  HIGH: 'bg-orange-400',
  URGENT: 'bg-red-500',
}

interface TaskRowProps {
  task: PanelTask
  onClick: () => void
  showProject?: { name: string; color: string | null }
}

export function TaskRow({ task, onClick, showProject }: TaskRowProps) {
  const StatusIcon = STATUS_ICON[task.status].icon
  const variance = calculateTaskVariance({
    status: task.status,
    dueDate: task.dueDate,
    section: { isBacklog: Boolean(task.section?.isBacklog) },
  })
  const isOverdue = variance.isOverdue
  const daysLate = variance.daysLate

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:bg-muted/30 transition-colors text-left group',
        isOverdue && 'border-red-500/20 bg-red-500/[0.07] hover:bg-red-500/10'
      )}
    >
      {/* Status icon */}
      <StatusIcon className={cn('w-4 h-4 shrink-0', STATUS_ICON[task.status].color)} />

      {/* Title + labels */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm truncate',
            task.status === 'DONE' && 'line-through text-muted-foreground'
          )}>
            {task.title}
          </span>
          {task.labelAssignments.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              {task.labelAssignments.slice(0, 2).map((la) => (
                <span
                  key={la.label.id}
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: la.label.color + '20', color: la.label.color }}
                >
                  {la.label.name}
                </span>
              ))}
              {task.labelAssignments.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{task.labelAssignments.length - 2}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Project badge (for My Tasks view) */}
      {showProject && (
        <span
          className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted/40 text-muted-foreground shrink-0"
        >
          {showProject.color && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: showProject.color }} />
          )}
          {showProject.name}
        </span>
      )}

      {/* Meta */}
      <div className="flex items-center gap-2 shrink-0">
        {isOverdue && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">
            <AlertTriangle className="h-3 w-3" />
            Overdue · {daysLate}d
          </span>
        )}

        {task.completedLate && task.status === 'DONE' && (
          <span className="hidden sm:inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            Completed late
          </span>
        )}

        {/* Comment count */}
        {task._count.comments > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <MessageSquare className="w-3 h-3" />
            {task._count.comments}
          </span>
        )}

        {/* Due date */}
        {task.dueDate && (
          <span className={cn(
            'flex items-center gap-1 text-[11px]',
            isOverdue ? 'font-semibold text-red-500' : 'text-muted-foreground'
          )}>
            <Calendar className="w-3 h-3" />
            {TASK_DATE_FORMATTER.format(new Date(task.dueDate))}
          </span>
        )}

        {/* Priority dot */}
        {task.priority !== 'MEDIUM' && (
          <span className={cn('w-2 h-2 rounded-full', PRIORITY_DOT[task.priority])} title={task.priority} />
        )}

        {/* Assignee */}
        {task.assignee && (
          <UserAvatar name={task.assignee.name} size="xs" />
        )}
      </div>
    </button>
  )
}
