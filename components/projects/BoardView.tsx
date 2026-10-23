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
  pointerWithin,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { calculateTaskVariance, isTaskAssignedTo } from '@/lib/project-progress'
import type { PanelTask, ProjectStatusSection } from './TaskDetailPanel'
import { TaskCard } from './TaskCard'
import { AddTaskButton, BoardColumnEmpty, BoardColumnShell, BoardScroller, ShowOlderButton, TASK_NAME_INPUT_CLASS } from './BoardColumn'
import { DONE_RECENT_DAYS, doneCountLabel, sortableCardKeyDown, sortTasksByDeadline, splitDoneTasks } from './workspace-utils'

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
  const scoped = {
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) => String(container.id).startsWith(SECTION_PREFIX) === isSectionDrag
    ),
  }
  // Whatever is under the pointer wins. closestCorners alone sends a card dropped
  // on an empty column to a neighbouring column whose cards' corners are nearer.
  const underPointer = pointerWithin(scoped)
  return underPointer.length > 0 ? underPointer : closestCorners(scoped)
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
  // A task dropped into Done locally has no completedAt until refetch; count it as just finished.
  const completedAtFor = (task: PanelTask) =>
    task.completedAt ?? (tasks.find((original) => original.id === task.id)?.sectionId !== task.sectionId ? new Date().toISOString() : null)
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
      if (data.task) onTaskClick(data.task)
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
      <BoardScroller>
        {localSections.map((section) => (
          <BoardColumn
            key={section.id}
            section={section}
            tasks={localTasks.filter((task) => task.sectionId === section.id)}
            completedAtFor={completedAtFor}
            viewerId={viewerId}
            canManage={canManage}
            canDelete={canManage && localSections.length > 1}
            deleting={deletingSectionId === section.id}
            onTaskClick={onTaskClick}
            onAddTask={handleAddTask}
            onDelete={() => void handleDeleteStatus(section)}
          />
        ))}

        {canManage && <div className="w-[288px] shrink-0 pt-9">
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
              className={TASK_NAME_INPUT_CLASS}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingStatus(true)}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-3.5 w-3.5" />
              Add status
            </button>
          )}
        </div>}
      </BoardScroller>
      </SortableContext>

      <DragOverlay>
        {activeTask && (
          <div className="w-72 rotate-1 opacity-95 shadow-2xl">
            <BoardTaskCard task={activeTask} compact={Boolean(activeTask.section?.isDone || activeTask.section?.canonicalStatus === 'DONE')} dragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function BoardColumn({
  section,
  tasks: sectionTasks,
  completedAtFor,
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
  completedAtFor: (task: PanelTask) => string | null | undefined
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
  const [returnFocus, setReturnFocus] = useState(false)
  const [showOlder, setShowOlder] = useState(false)
  const isDoneColumn = section.isDone || section.canonicalStatus === 'DONE'
  const done = isDoneColumn ? splitDoneTasks(sectionTasks, completedAtFor) : null
  const tasks = done ? (showOlder ? [...done.recent, ...done.older] : done.recent) : sortTasksByDeadline(sectionTasks)
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
    <BoardColumnShell
      id={section.id}
      name={section.name}
      color={section.color}
      count={sectionTasks.length}
      countTitle={done ? doneCountLabel(sectionTasks.length, done.recent.length) : undefined}
      isOver={isOver}
      dropRef={setNodeRef}
      outerRef={setSortableRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'z-10 opacity-60')}
      headerStart={canManage && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Move ${section.name} section`}
          className="-ml-1 inline-flex h-7 w-5 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 opacity-0 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-hover/col:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      headerEnd={canManage && (
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete || deleting}
          aria-label={`Remove ${section.name} section`}
          title={canDelete ? `Remove ${section.name}` : 'Add another section before removing this one'}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30 group-hover/col:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      top={adding ? (
        <input
          autoFocus
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setReturnFocus(true)
              handleAdd()
            }
            if (event.key === 'Escape') {
              setReturnFocus(true)
              setAdding(false)
              setNewTitle('')
            }
          }}
          onBlur={handleAdd}
          placeholder="Task name..."
          aria-label={`New task in ${section.name}`}
          className={TASK_NAME_INPUT_CLASS}
        />
      ) : (
        <AddTaskButton
          columnName={section.name}
          autoFocus={returnFocus}
          onClick={() => {
            setReturnFocus(false)
            setAdding(true)
          }}
        />
      )}
    >
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        {tasks.length === 0 && <BoardColumnEmpty label={sectionTasks.length > 0 ? `Nothing finished in the last ${DONE_RECENT_DAYS} days` : undefined} />}
        {tasks.map((task) => (
          <SortableTaskCard
            key={task.id}
            task={task}
            compact={isDoneColumn}
            disabled={!canManage && !isTaskAssignedTo(task, viewerId)}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </SortableContext>
      {done && <ShowOlderButton count={done.older.length} expanded={showOlder} onToggle={() => setShowOlder((value) => !value)} />}
    </BoardColumnShell>
  )
}

function SortableTaskCard({ task, disabled, compact, onClick }: { task: PanelTask; disabled: boolean; compact?: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    // Title button is tabIndex -1 so the wrapper is the card's single tab stop (see sortableCardKeyDown).
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onKeyDown={(event) => sortableCardKeyDown(event, { isDragging, onOpen: onClick, onDragKey: (keyEvent) => listeners?.onKeyDown?.(keyEvent) })}
      className={cn('rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', isDragging && 'opacity-25', disabled && 'cursor-default')}
    >
      <BoardTaskCard task={task} compact={compact} titleTabIndex={-1} onOpen={() => { if (!isDragging) onClick() }} />
    </div>
  )
}

function BoardTaskCard({ task, dragging, compact, titleTabIndex, onOpen }: { task: PanelTask; dragging?: boolean; compact?: boolean; titleTabIndex?: number; onOpen?: () => void }) {
  const overdue = calculateTaskVariance({
    status: task.status,
    dueDate: task.dueDate,
    section: { isBacklog: Boolean(task.section?.isBacklog) },
  }).isOverdue
  return <TaskCard task={task} overdue={overdue} done={task.status === 'DONE'} dragging={dragging} compact={compact} titleTabIndex={titleTabIndex} onOpen={onOpen} />
}
