'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, Flag, GripVertical, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { cn } from '@/lib/utils'
import { calculateTaskVariance, isTaskAssignedTo, PROJECT_TASK_TIME_ZONE } from '@/lib/project-progress'
import type { PanelTask, ProjectStatusSection } from './TaskDetailPanel'
import { sortTasksByDeadline } from './workspace-utils'

const TASK_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  timeZone: PROJECT_TASK_TIME_ZONE,
  month: 'short',
  day: 'numeric',
})

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-400',
  HIGH: 'bg-orange-400',
  URGENT: 'bg-red-500',
}

interface BoardViewProps {
  projectId: string
  tasks: PanelTask[]
  sections: ProjectStatusSection[]
  viewerId: string
  canManage: boolean
  onTaskClick: (task: PanelTask) => void
  onTasksChange: () => void
}

const SECTION_PREFIX = 'section:'

// Section drags only collide with other columns; task drags ignore the column sort targets.
const collisionDetection: CollisionDetection = (args) => {
  const isSectionDrag = args.active.data.current?.type === 'section'
  return closestCorners({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) => String(container.id).startsWith(SECTION_PREFIX) === isSectionDrag
    ),
  })
}

export function BoardView({ projectId, tasks, sections, viewerId, canManage, onTaskClick, onTasksChange }: BoardViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localTasks, setLocalTasks] = useState<PanelTask[]>(tasks)
  const [localSections, setLocalSections] = useState<ProjectStatusSection[]>(sections)
  const [addingStatus, setAddingStatus] = useState(false)
  const [newStatusName, setNewStatusName] = useState('')
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null)

  useEffect(() => {
    setLocalTasks(tasks)
  }, [tasks])

  useEffect(() => {
    setLocalSections(sections)
  }, [sections])

  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const activeTask = activeId ? localTasks.find((task) => task.id === activeId) : null
  const canEditTask = (task: PanelTask) => canManage || isTaskAssignedTo(task, viewerId)

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'section') return
    const task = localTasks.find((candidate) => candidate.id === event.active.id)
    if (!task || !canEditTask(task)) return
    setActiveId(task.id)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.data.current?.type === 'section') return

    const draggedTask = localTasks.find((task) => task.id === active.id)
    if (!draggedTask || !canEditTask(draggedTask)) return

    const overId = String(over.id)
    const targetSectionId = sectionById.has(overId)
      ? overId
      : localTasks.find((task) => task.id === overId)?.sectionId

    const targetSection = targetSectionId ? sectionById.get(targetSectionId) : null
    if (!targetSection || draggedTask.sectionId === targetSection.id) return

    setLocalTasks((prev) =>
      prev.map((task) =>
        task.id === draggedTask.id
          ? {
              ...task,
              sectionId: targetSection.id,
              section: targetSection,
              status: targetSection.canonicalStatus,
            }
          : task
      )
    )
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (active.data.current?.type === 'section') {
      if (!canManage || !over || active.id === over.id) return
      const from = localSections.findIndex((section) => `${SECTION_PREFIX}${section.id}` === active.id)
      const to = localSections.findIndex((section) => `${SECTION_PREFIX}${section.id}` === over.id)
      if (from < 0 || to < 0) return
      const reordered = arrayMove(localSections, from, to)
      setLocalSections(reordered)
      try {
        const res = await fetch(`/api/projects/${projectId}/sections`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedSectionIds: reordered.map((section) => section.id) }),
        })
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to reorder sections')
        }
        onTasksChange()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to reorder sections')
        setLocalSections(sections)
      }
      return
    }

    const task = localTasks.find((item) => item.id === active.id)
    const original = tasks.find((item) => item.id === active.id)
    if (!task || !original || (task.sectionId === original.sectionId && task.status === original.status)) return
    if (!canEditTask(original)) {
      setLocalTasks(tasks)
      return
    }

    if (
      original.section?.isBacklog &&
      !task.section?.isBacklog &&
      (!original.assigneeId || !original.dueDate)
    ) {
      setLocalTasks(tasks)
      toast.error('Add an assignee and due date before moving this task out of Backlog')
      onTaskClick(original)
      return
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, sectionId: task.sectionId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update task status')
      }
      onTasksChange()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update task status')
      setLocalTasks(tasks)
    }
  }

  const handleAddTask = async (title: string, sectionId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          sectionId,
          ...(!canManage ? { assigneeId: viewerId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create task')
      }
      onTasksChange()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create task')
    }
  }

  const handleAddStatus = async () => {
    if (!canManage) return
    if (!newStatusName.trim()) {
      setAddingStatus(false)
      return
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStatusName.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create status')
      }
      setNewStatusName('')
      setAddingStatus(false)
      onTasksChange()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create status')
    }
  }

  const handleDeleteStatus = async (section: ProjectStatusSection) => {
    if (!canManage || deletingSectionId) return
    const taskCount = localTasks.filter((task) => task.sectionId === section.id).length
    const confirmed = window.confirm(
      taskCount > 0
        ? `Remove “${section.name}”? Its ${taskCount} task${taskCount === 1 ? '' : 's'} will move to another remaining section.`
        : `Remove “${section.name}” from this board?`,
    )
    if (!confirmed) return

    setDeletingSectionId(section.id)
    try {
      const res = await fetch(`/api/projects/${projectId}/sections?sectionId=${encodeURIComponent(section.id)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove section')
      }
      const movedCount = typeof data.movedTaskCount === 'number' ? data.movedTaskCount : 0
      const targetName = typeof data.targetSection?.name === 'string' ? data.targetSection.name : ''
      toast.success(
        movedCount > 0 && targetName
          ? `Removed ${section.name}; moved ${movedCount} task${movedCount === 1 ? '' : 's'} to ${targetName}`
          : `Removed ${section.name}`,
      )
      onTasksChange()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove section')
    } finally {
      setDeletingSectionId(null)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={localSections.map((section) => `${SECTION_PREFIX}${section.id}`)} strategy={horizontalListSortingStrategy}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {localSections.map((section) => (
          <BoardColumn
            key={section.id}
            section={section}
            tasks={sortTasksByDeadline(localTasks.filter((task) => task.sectionId === section.id))}
            viewerId={viewerId}
            canManage={canManage}
            canDelete={canManage && localSections.length > 1}
            deleting={deletingSectionId === section.id}
            onTaskClick={onTaskClick}
            onAddTask={handleAddTask}
            onDelete={() => void handleDeleteStatus(section)}
          />
        ))}

        {canManage && <div className="flex-shrink-0 w-72 pt-10">
          {addingStatus ? (
            <input
              autoFocus
              value={newStatusName}
              onChange={(event) => setNewStatusName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAddStatus()
                if (event.key === 'Escape') {
                  setAddingStatus(false)
                  setNewStatusName('')
                }
              }}
              onBlur={handleAddStatus}
              placeholder="Status name"
              className="w-full rounded-lg border border-border/40 bg-card px-3 py-2 text-sm outline-none focus:border-primary/40"
            />
          ) : (
            <button
              onClick={() => setAddingStatus(true)}
              className="w-full rounded-xl border border-dashed border-border/50 px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              + Add status
            </button>
          )}
        </div>}
      </div>
      </SortableContext>

      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} isDragging />}
      </DragOverlay>
    </DndContext>
  )
}

function BoardColumn({
  section,
  tasks,
  viewerId,
  canManage,
  canDelete,
  deleting,
  onTaskClick,
  onAddTask,
  onDelete,
}: {
  section: ProjectStatusSection
  tasks: PanelTask[]
  viewerId: string
  canManage: boolean
  canDelete: boolean
  deleting: boolean
  onTaskClick: (task: PanelTask) => void
  onAddTask: (title: string, sectionId: string) => void
  onDelete: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const { setNodeRef, isOver } = useDroppable({ id: section.id })
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${SECTION_PREFIX}${section.id}`, data: { type: 'section' }, disabled: !canManage })

  const handleAdd = () => {
    if (newTitle.trim()) {
      onAddTask(newTitle.trim(), section.id)
      setNewTitle('')
    }
    setAdding(false)
  }

  return (
    <div
      ref={setSortableRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex-shrink-0 w-72', isDragging && 'opacity-60 z-10')}
    >
      <div className="group flex items-center gap-2 px-2 py-2 mb-2">
        {canManage && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Move ${section.name} section`}
            className="inline-flex h-7 w-5 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: section.color }} />
        <span className="text-sm font-semibold">{section.name}</span>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
        {canManage && (
          <button
            type="button"
            onClick={onDelete}
            disabled={!canDelete || deleting}
            aria-label={`Remove ${section.name} section`}
            title={canDelete ? `Remove ${section.name}` : 'Add another section before removing this one'}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'rounded-xl border p-2 min-h-[200px] transition-colors duration-200',
          isOver ? 'bg-primary/5 border-primary/30' : 'border-border/40'
        )}
        style={!isOver ? { borderColor: `${section.color}33`, backgroundColor: `${section.color}0d` } : undefined}
      >
        {adding ? (
          <div className="mb-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleAdd()
                if (event.key === 'Escape') {
                  setAdding(false)
                  setNewTitle('')
                }
              }}
              onBlur={handleAdd}
              placeholder="Task name"
              className="w-full bg-card border border-border/40 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40"
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mb-2 w-full flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground/50 hover:text-muted-foreground rounded-lg hover:bg-card/50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add task
          </button>
        )}

        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                disabled={!canManage && !isTaskAssignedTo(task, viewerId)}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

function SortableTaskCard({ task, disabled, onClick }: { task: PanelTask; disabled: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={disabled ? 'cursor-default' : undefined}>
      <TaskCard task={task} isDragging={isDragging} onClick={onClick} />
    </div>
  )
}

function TaskCard({ task, isDragging, onClick }: { task: PanelTask; isDragging?: boolean; onClick?: () => void }) {
  const isOverdue = calculateTaskVariance({
    status: task.status,
    dueDate: task.dueDate,
    section: { isBacklog: Boolean(task.section?.isBacklog) },
  }).isOverdue

  return (
    <button
      type="button"
      onClick={() => { if (!isDragging) onClick?.() }}
      className={cn(
        'w-full bg-card border border-border/40 rounded-lg p-3 cursor-pointer hover:border-border/70 transition-all text-left',
        isOverdue && 'border-red-500/30 bg-red-500/[0.07] hover:border-red-500/50',
        isDragging && 'opacity-50 shadow-xl scale-105 rotate-2',
      )}
    >
      {task.labelAssignments.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labelAssignments.map((assignment) => (
            <span
              key={assignment.label.id}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ backgroundColor: `${assignment.label.color}20`, color: assignment.label.color }}
            >
              {assignment.label.name}
            </span>
          ))}
        </div>
      )}

      <p className={cn(
        'text-sm font-medium mb-2',
        task.status === 'DONE' && 'line-through text-muted-foreground'
      )}>
        {task.title}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {task.dueDate && (
          <span className={cn(
            'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded',
            isOverdue ? 'text-red-400 bg-red-400/10' : 'text-muted-foreground bg-muted/30'
          )}>
            <Calendar className="w-3 h-3" />
            {TASK_DATE_FORMATTER.format(new Date(task.dueDate))}
          </span>
        )}

        {task.priority !== 'MEDIUM' && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Flag className={cn('w-3 h-3', {
              'text-slate-400': task.priority === 'LOW',
              'text-orange-400': task.priority === 'HIGH',
              'text-red-500': task.priority === 'URGENT',
            })} />
            <span className={cn('w-2 h-2 rounded-full', PRIORITY_DOT[task.priority])} />
          </span>
        )}

        {task._count.comments > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <MessageSquare className="w-3 h-3" />
            {task._count.comments}
          </span>
        )}

        <div className="flex-1" />
        {task.assignee && <UserAvatar name={task.assignee.name} size="xs" />}
      </div>
    </button>
  )
}
