'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarDays, CheckCircle2, CircleAlert, GripVertical, Loader2, MessageSquare, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { cn } from '@/lib/utils'
import type {
  KanbanColumnId,
  WorkspaceProject,
  WorkspaceProjectView,
  WorkspaceTask,
} from './workspace-types'
import {
  columnForTask,
  displayDueDate,
  isTaskOverdue,
  overdueDays,
  PRIORITY_CLASS,
  PRIORITY_LABEL,
  relativeDueDate,
} from './workspace-utils'

interface WorkspaceKanbanProps {
  projectViews: WorkspaceProjectView[]
  quickAddProjects: WorkspaceProject[]
  quickAddProjectId: string
  quickAdding: boolean
  viewerId: string
  pendingTaskIds: Set<string>
  onOpenTask: (projectId: string, taskId: string) => void
  onMoveTask: (project: WorkspaceProject, task: WorkspaceTask, column: KanbanColumnId) => void
  onQuickAddProjectChange: (projectId: string) => void
  onQuickAdd: (title: string) => Promise<boolean>
}

const COLUMNS: Array<{
  id: KanbanColumnId
  label: string
  description: string
  tone: string
  dot: string
}> = [
  { id: 'BACKLOG', label: 'Backlog', description: 'Future work', tone: 'border-slate-400/25 bg-slate-500/[0.04]', dot: 'bg-slate-400' },
  { id: 'TODO', label: 'To Do', description: 'Ready to start', tone: 'border-violet-500/20 bg-violet-500/[0.04]', dot: 'bg-violet-500' },
  { id: 'IN_PROGRESS', label: 'In Progress', description: 'Work underway', tone: 'border-blue-500/20 bg-blue-500/[0.04]', dot: 'bg-blue-500' },
  { id: 'DONE', label: 'Done', description: 'Completed work', tone: 'border-emerald-500/20 bg-emerald-500/[0.04]', dot: 'bg-emerald-500' },
]

interface KanbanTaskItem {
  project: WorkspaceProject
  task: WorkspaceTask
}

export function WorkspaceKanban({
  projectViews,
  quickAddProjects,
  quickAddProjectId,
  quickAdding,
  viewerId,
  pendingTaskIds,
  onOpenTask,
  onMoveTask,
  onQuickAddProjectChange,
  onQuickAdd,
}: WorkspaceKanbanProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const items = useMemo(
    () => projectViews.flatMap(({ project, visibleActiveTasks, visibleBacklogTasks }) =>
      [...visibleBacklogTasks, ...visibleActiveTasks].map((task) => ({ project, task })),
    ),
    [projectViews],
  )
  const activeItem = activeId ? items.find(({ task }) => task.id === activeId) || null : null

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    if (!event.over) return
    const item = items.find(({ task }) => task.id === String(event.active.id))
    if (!item) return
    const target = String(event.over.id).replace('kanban:', '') as KanbanColumnId
    if (!COLUMNS.some((column) => column.id === target)) return
    if (columnForTask(item.project, item.task) === target) return
    onMoveTask(item.project, item.task, target)
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-4">
        <div className="grid min-w-[1160px] grid-cols-4 gap-4">
          {COLUMNS.map((column) => {
            const columnItems = items.filter(({ project, task }) => columnForTask(project, task) === column.id)
            return (
              <KanbanColumn
                key={column.id}
                column={column}
                items={columnItems}
                viewerId={viewerId}
                pendingTaskIds={pendingTaskIds}
                onOpenTask={onOpenTask}
                quickAdd={column.id === 'BACKLOG' ? {
                  projects: quickAddProjects,
                  projectId: quickAddProjectId,
                  adding: quickAdding,
                  onProjectChange: onQuickAddProjectChange,
                  onAdd: onQuickAdd,
                } : undefined}
              />
            )
          })}
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
        {activeItem ? (
          <div className="w-72 rotate-1 opacity-95 shadow-2xl">
            <KanbanTaskCardContent project={activeItem.project} task={activeItem.task} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({
  column,
  items,
  viewerId,
  pendingTaskIds,
  onOpenTask,
  quickAdd,
}: {
  column: (typeof COLUMNS)[number]
  items: KanbanTaskItem[]
  viewerId: string
  pendingTaskIds: Set<string>
  onOpenTask: (projectId: string, taskId: string) => void
  quickAdd?: {
    projects: WorkspaceProject[]
    projectId: string
    adding: boolean
    onProjectChange: (projectId: string) => void
    onAdd: (title: string) => Promise<boolean>
  }
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `kanban:${column.id}` })
  return (
    <section aria-labelledby={`kanban-heading-${column.id}`} className="min-w-0">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('h-2.5 w-2.5 rounded-full', column.dot)} />
        <div>
          <h2 id={`kanban-heading-${column.id}`} className="text-sm font-semibold">{column.label}</h2>
          <p className="text-[10px] text-muted-foreground">{column.description}</p>
        </div>
        <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[440px] space-y-2 rounded-xl border p-2 transition-colors',
          column.tone,
          isOver && 'border-primary/45 bg-primary/[0.07] ring-2 ring-primary/15',
        )}
      >
        {quickAdd && <KanbanQuickAdd {...quickAdd} />}
        {items.length === 0 && (
          <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border/50 px-4 text-center text-xs text-muted-foreground">
            Drop tasks here
          </div>
        )}
        {items.map(({ project, task }) => (
          <DraggableTaskCard
            key={task.id}
            project={project}
            task={task}
            disabled={pendingTaskIds.has(task.id) || (
              !project.canManage
              && task.assigneeId !== viewerId
              && !task.assistants?.some((assistant) => assistant.user.id === viewerId)
            )}
            onOpen={() => onOpenTask(project.id, task.id)}
          />
        ))}
      </div>
    </section>
  )
}

function KanbanQuickAdd({
  projects,
  projectId,
  adding,
  onProjectChange,
  onAdd,
}: {
  projects: WorkspaceProject[]
  projectId: string
  adding: boolean
  onProjectChange: (projectId: string) => void
  onAdd: (title: string) => Promise<boolean>
}) {
  const [title, setTitle] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle || !projectId || adding) return
    if (await onAdd(cleanTitle)) setTitle('')
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-dashed border-slate-400/40 bg-background/70 p-2.5">
      <label htmlFor="kanban-backlog-title" className="sr-only">Backlog task title</label>
      <input
        id="kanban-backlog-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Add a backlog item..."
        className="h-8 w-full rounded-md border border-border/60 bg-background px-2.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
        disabled={adding || projects.length === 0}
      />
      <div className="flex gap-1.5">
        <label htmlFor="kanban-backlog-project" className="sr-only">Project</label>
        <select
          id="kanban-backlog-project"
          value={projectId}
          onChange={(event) => onProjectChange(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
          disabled={adding || projects.length === 0}
        >
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <button
          type="submit"
          disabled={!title.trim() || !projectId || adding}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Add backlog task"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </button>
      </div>
    </form>
  )
}

function DraggableTaskCard({
  project,
  task,
  disabled,
  onOpen,
}: {
  project: WorkspaceProject
  task: WorkspaceTask
  disabled: boolean
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && 'opacity-25', disabled && 'opacity-60')}
    >
      <KanbanTaskCardContent
        project={project}
        task={task}
        onOpen={onOpen}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

function KanbanTaskCardContent({
  project,
  task,
  onOpen,
  dragHandleProps,
  dragging,
}: {
  project: WorkspaceProject
  task: WorkspaceTask
  onOpen?: () => void
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  dragging?: boolean
}) {
  const overdue = isTaskOverdue(project, task)
  const daysLate = overdueDays(project, task)
  return (
    <Card className={cn(
      'group overflow-hidden border-border/60 bg-card p-3 shadow-sm transition-all hover:border-primary/30 hover:shadow-md',
      overdue && 'border-red-500/30 bg-red-500/[0.055]',
      dragging && 'border-primary/40',
    )}>
      <div className="mb-2 flex items-start gap-2">
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className="min-w-0 flex-1 rounded text-left text-sm font-semibold leading-snug text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-foreground"
        >
          {task.title}
        </button>
        {dragHandleProps && (
          <button
            type="button"
            {...dragHandleProps}
            className="touch-none rounded p-1 text-muted-foreground opacity-60 transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
            aria-label={`Move ${task.title}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-primary"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: project.color || '#94a3b8' }} />
          <span className="truncate">{project.name}</span>
        </Link>
        <Badge variant="outline" className={cn('text-[10px]', PRIORITY_CLASS[task.priority])}>
          {PRIORITY_LABEL[task.priority]}
        </Badge>
        {task.completedLate && (
          <Badge variant="outline" className="border-orange-500/25 bg-orange-500/10 text-[10px] text-orange-600 dark:text-orange-300">
            Completed late
          </Badge>
        )}
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarDays className={cn('h-3.5 w-3.5 shrink-0', overdue && 'text-red-500')} />
          <span className={cn(overdue && 'font-semibold text-red-600 dark:text-red-300')} title={displayDueDate(task.dueDate)}>
            {task.dueDate ? relativeDueDate(task.dueDate) : 'No due date'}
          </span>
          {overdue && (
            <Badge className="ml-auto border border-red-500/20 bg-red-500/10 text-[10px] text-red-600 hover:bg-red-500/10 dark:text-red-300">
              Overdue · {daysLate}d
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.assignee ? (
            <>
              <UserAvatar name={task.assignee.name} size="xs" />
              <span className="truncate">{task.assignee.name}</span>
            </>
          ) : (
            <>
              <CircleAlert className="h-3.5 w-3.5" />
              <span>Unassigned</span>
            </>
          )}
          {task._count.comments > 0 && (
            <span className="ml-auto inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> {task._count.comments}
            </span>
          )}
          {task.status === 'DONE' && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" aria-label="Done" />}
        </div>
      </div>
    </Card>
  )
}
