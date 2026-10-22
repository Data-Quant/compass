'use client'

import { useMemo, useState } from 'react'
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
import { Loader2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type {
  KanbanColumnId,
  WorkspaceProject,
  WorkspaceProjectView,
  WorkspaceTask,
} from './workspace-types'
import {
  columnForTask,
  isDoneTask,
  isTaskOverdue,
  sortTasksByDeadline,
} from './workspace-utils'
import { TaskCard } from './TaskCard'

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
            const columnItems = sortTasksByDeadline(
              items.filter(({ project, task }) => columnForTask(project, task) === column.id),
              ({ task }) => task.dueDate,
            )
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
            <KanbanTaskCard project={activeItem.project} task={activeItem.task} dragging />
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
            pending={pendingTaskIds.has(task.id)}
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
  pending,
  onOpen,
}: {
  project: WorkspaceProject
  task: WorkspaceTask
  disabled: boolean
  pending: boolean
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && 'opacity-25')}
    >
      <KanbanTaskCard
        project={project}
        task={task}
        pending={pending}
        onOpen={onOpen}
        dragHandleProps={disabled ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  )
}

function KanbanTaskCard({ project, task, ...props }: {
  project: WorkspaceProject
  task: WorkspaceTask
  onOpen?: () => void
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>
  dragging?: boolean
  pending?: boolean
}) {
  return <TaskCard task={task} project={project} overdue={isTaskOverdue(project, task)} done={isDoneTask(project, task)} {...props} />
}

