'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, Flag, MessageSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { cn } from '@/lib/utils'
import type { PanelTask, ProjectStatusSection } from './TaskDetailPanel'

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
  onTaskClick: (task: PanelTask) => void
  onTasksChange: () => void
}

export function BoardView({ projectId, tasks, sections, onTaskClick, onTasksChange }: BoardViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localTasks, setLocalTasks] = useState<PanelTask[]>(tasks)
  const [addingStatus, setAddingStatus] = useState(false)
  const [newStatusName, setNewStatusName] = useState('')

  useEffect(() => {
    setLocalTasks(tasks)
  }, [tasks])

  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeTask = activeId ? localTasks.find((task) => task.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const draggedTask = localTasks.find((task) => task.id === active.id)
    if (!draggedTask) return

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
    const { active } = event
    setActiveId(null)

    const task = localTasks.find((item) => item.id === active.id)
    const original = tasks.find((item) => item.id === active.id)
    if (!task || !original || (task.sectionId === original.sectionId && task.status === original.status)) return

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
        body: JSON.stringify({ title, sectionId }),
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {sections.map((section) => (
          <BoardColumn
            key={section.id}
            section={section}
            tasks={localTasks.filter((task) => task.sectionId === section.id)}
            onTaskClick={onTaskClick}
            onAddTask={handleAddTask}
          />
        ))}

        <div className="flex-shrink-0 w-72 pt-10">
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
        </div>
      </div>

      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} isDragging />}
      </DragOverlay>
    </DndContext>
  )
}

function BoardColumn({
  section,
  tasks,
  onTaskClick,
  onAddTask,
}: {
  section: ProjectStatusSection
  tasks: PanelTask[]
  onTaskClick: (task: PanelTask) => void
  onAddTask: (title: string, sectionId: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const { setNodeRef, isOver } = useDroppable({ id: section.id })

  const handleAdd = () => {
    if (newTitle.trim()) {
      onAddTask(newTitle.trim(), section.id)
      setNewTitle('')
    }
    setAdding(false)
  }

  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center gap-2 px-2 py-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: section.color }} />
        <span className="text-sm font-semibold">{section.name}</span>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'rounded-xl border p-2 min-h-[200px] transition-colors duration-200',
          isOver ? 'bg-primary/5 border-primary/30' : 'border-border/40'
        )}
        style={!isOver ? { borderColor: `${section.color}33`, backgroundColor: `${section.color}0d` } : undefined}
      >
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </div>
        </SortableContext>

        {adding ? (
          <div className="mt-2">
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
            className="mt-2 w-full flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground/50 hover:text-muted-foreground rounded-lg hover:bg-card/50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add task
          </button>
        )}
      </div>
    </div>
  )
}

function SortableTaskCard({ task, onClick }: { task: PanelTask; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} isDragging={isDragging} onClick={onClick} />
    </div>
  )
}

function TaskCard({ task, isDragging, onClick }: { task: PanelTask; isDragging?: boolean; onClick?: () => void }) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE'

  return (
    <div
      onClick={() => { if (!isDragging) onClick?.() }}
      className={cn(
        'bg-card border border-border/40 rounded-lg p-3 cursor-pointer hover:border-border/70 transition-all',
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
            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
    </div>
  )
}
