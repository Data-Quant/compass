'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Loader2, Plus, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
import { AddTaskButton, BoardColumnEmpty, BoardColumnShell, BoardScroller } from './BoardColumn'

interface WorkspaceKanbanProps {
  projectViews: WorkspaceProjectView[]
  quickAddProjects: WorkspaceProject[]
  activeProjects: WorkspaceProject[]
  quickAddProjectId: string
  viewerId: string
  pendingTaskIds: Set<string>
  onOpenTask: (projectId: string, taskId: string) => void
  onMoveTask: (project: WorkspaceProject, task: WorkspaceTask, column: KanbanColumnId) => void
  onQuickAddProjectChange: (projectId: string) => void
  onQuickAdd: (title: string) => Promise<boolean>
  onCreateTask: (projectId: string, title: string, column: KanbanColumnId) => Promise<boolean>
}

// Hex dots so the shared column shell can take one color form for both boards.
const COLUMNS: Array<{
  id: KanbanColumnId
  label: string
  description: string
  color: string
}> = [
  { id: 'BACKLOG', label: 'Backlog', description: 'Future work', color: '#94a3b8' },
  { id: 'TODO', label: 'To Do', description: 'Ready to start', color: '#8b5cf6' },
  { id: 'IN_PROGRESS', label: 'In Progress', description: 'Work underway', color: '#3b82f6' },
  { id: 'DONE', label: 'Done', description: 'Completed work', color: '#10b981' },
]

interface KanbanTaskItem {
  project: WorkspaceProject
  task: WorkspaceTask
}

export function WorkspaceKanban({
  projectViews,
  quickAddProjects,
  activeProjects,
  quickAddProjectId,
  viewerId,
  pendingTaskIds,
  onOpenTask,
  onMoveTask,
  onQuickAddProjectChange,
  onQuickAdd,
  onCreateTask,
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
      <BoardScroller>
        {COLUMNS.map((column) => {
          const columnItems = sortTasksByDeadline(
            items.filter(({ project, task }) => columnForTask(project, task) === column.id),
            ({ task }) => task.dueDate,
          )
          const backlog = column.id === 'BACKLOG'
          return (
            <KanbanColumn
              key={column.id}
              column={column}
              items={columnItems}
              viewerId={viewerId}
              pendingTaskIds={pendingTaskIds}
              onOpenTask={onOpenTask}
              projects={backlog ? quickAddProjects : activeProjects}
              defaultProjectId={quickAddProjectId}
              onProjectChange={backlog ? onQuickAddProjectChange : undefined}
              onAdd={backlog
                ? (_projectId, title) => onQuickAdd(title)
                : (projectId, title) => onCreateTask(projectId, title, column.id)}
            />
          )
        })}
      </BoardScroller>

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
  projects,
  defaultProjectId,
  onProjectChange,
  onAdd,
}: {
  column: (typeof COLUMNS)[number]
  items: KanbanTaskItem[]
  viewerId: string
  pendingTaskIds: Set<string>
  onOpenTask: (projectId: string, taskId: string) => void
  projects: WorkspaceProject[]
  defaultProjectId: string
  onProjectChange?: (projectId: string) => void
  onAdd: (projectId: string, title: string) => Promise<boolean>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `kanban:${column.id}` })
  const [composing, setComposing] = useState(false)
  const [returnFocus, setReturnFocus] = useState(false)
  return (
    <BoardColumnShell
      id={`kanban-${column.id}`}
      name={column.label}
      color={column.color}
      description={column.description}
      count={items.length}
      isOver={isOver}
      dropRef={setNodeRef}
      top={composing ? (
        <KanbanComposer
          column={column}
          projects={projects}
          defaultProjectId={defaultProjectId}
          onProjectChange={onProjectChange}
          onAdd={onAdd}
          onClose={() => {
            setReturnFocus(true)
            setComposing(false)
          }}
        />
      ) : projects.length > 0 && (
        <AddTaskButton columnName={column.label} autoFocus={returnFocus} onClick={() => setComposing(true)} />
      )}
    >
      {items.length === 0 && <BoardColumnEmpty />}
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
    </BoardColumnShell>
  )
}

// Inline composer at the top of a column. The Backlog column keeps the shared quick-add
// project in sync; the other columns keep their own pick, starting from it.
function KanbanComposer({
  column,
  projects,
  defaultProjectId,
  onProjectChange,
  onAdd,
  onClose,
}: {
  column: (typeof COLUMNS)[number]
  projects: WorkspaceProject[]
  defaultProjectId: string
  onProjectChange?: (projectId: string) => void
  onAdd: (projectId: string, title: string) => Promise<boolean>
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [pickedProjectId, setPickedProjectId] = useState(defaultProjectId)
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // The input is disabled while adding, so focus it once adding has finished (also covers the first open).
  useEffect(() => {
    if (!adding) inputRef.current?.focus()
  }, [adding])
  const selectedId = onProjectChange ? defaultProjectId : pickedProjectId
  const projectId = projects.some((project) => project.id === selectedId) ? selectedId : projects[0]?.id || ''
  const isBacklog = column.id === 'BACKLOG'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle || !projectId || adding) return
    setAdding(true)
    try {
      if (await onAdd(projectId, cleanTitle)) setTitle('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        // Ignore Escape from the project Select's portal; Radix closes the menu itself.
        if (event.key === 'Escape' && !event.defaultPrevented && event.currentTarget.contains(event.target as Node)) onClose()
      }}
      className="space-y-1.5 rounded-md border border-border bg-card p-2"
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={isBacklog ? 'Add a backlog item...' : 'Task name...'}
        aria-label={isBacklog ? 'Backlog task title' : `New task in ${column.label}`}
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
        disabled={adding || projects.length === 0}
      />
      <div className="flex gap-1.5">
        <Select
          value={projectId}
          onValueChange={(value) => (onProjectChange ? onProjectChange(value) : setPickedProjectId(value))}
          disabled={adding || projects.length === 0}
        >
          <SelectTrigger aria-label="Project" className="h-8 min-w-0 flex-1 bg-background px-2 text-xs text-foreground">
            <SelectValue placeholder="No projects" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          type="submit"
          disabled={!title.trim() || !projectId || adding}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={isBacklog ? 'Add backlog task' : `Add task to ${column.label}`}
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
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

