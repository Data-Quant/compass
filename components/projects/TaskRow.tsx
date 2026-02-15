'use client'

import { UserAvatar } from '@/components/composed/UserAvatar'
import { Circle, CheckCircle2, Clock, Flag, MessageSquare, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PanelTask } from './TaskDetailPanel'

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
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors text-left group"
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
            isOverdue ? 'text-red-400' : 'text-muted-foreground'
          )}>
            <Calendar className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
