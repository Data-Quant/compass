'use client'

import { useState, useMemo } from 'react'
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverEvent, DragStartEvent, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'
import { UserAvatar } from '@/components/composed/UserAvatar'
import {
  Circle, Clock, CheckCircle2, Flag, MessageSquare, Calendar, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { PanelTask } from './TaskDetailPanel'

/* ─── Config ──────────────────────────────────────────────────────────── */

const COLUMNS = [
  { id: 'TODO', label: 'To Do', color: 'slate', icon: Circle },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'blue', icon: Clock },
  { id: 'DONE', label: 'Done', color: 'emerald', icon: CheckCircle2 },
] as const

const COL_COLORS: Record<string, { dot: string; bg: string; border: string }> = {
  slate: { dot: 'bg-slate-400', bg: 'bg-slate-400/5', border: 'border-slate-400/20' },
  blue: { dot: 'bg-blue-400', bg: 'bg-blue-400/5', border: 'border-blue-400/20' },
  emerald: { dot: 'bg-emerald-400', bg: 'bg-emerald-400/5', border: 'border-emerald-400/20' },
}

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-400',
  HIGH: 'bg-orange-400',
  URGENT: 'bg-red-500',
}

/* ─── Types ───────────────────────────────────────────────────────────── */

interface BoardViewProps {
  projectId: string
  tasks: PanelTask[]
  onTaskClick: (task: PanelTask) => void
  onTasksChange: () => void
}

/* ─── Board View ──────────────────────────────────────────────────────── */

export function BoardView({ projectId, tasks, onTaskClick, onTasksChange }: BoardViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localTasks, setLocalTasks] = useState<PanelTask[]>(tasks)

  // Sync when tasks prop changes
  useMemo(() => setLocalTasks(tasks), [tasks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeTask = activeId ? localTasks.find((t) => t.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeTask = localTasks.find((t) => t.id === active.id)
    if (!activeTask) return

    // Determine target column
    const overId = over.id as string
    let targetStatus: string | null = null

    // Check if hovering over a column directly
    if (['TODO', 'IN_PROGRESS', 'DONE'].includes(overId)) {
      targetStatus = overId
    } else {
      // Hovering over a task — find its status
      const overTask = localTasks.find((t) => t.id === overId)
      if (overTask) targetStatus = overTask.status
    }

    if (targetStatus && activeTask.status !== targetStatus) {
      setLocalTasks((prev) =>
        prev.map((t) => (t.id === activeTask.id ? { ...t, status: targetStatus as PanelTask['status'] } : t))
      )
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active } = event
    setActiveId(null)

    const task = localTasks.find((t) => t.id === active.id)
    const original = tasks.find((t) => t.id === active.id)

    if (!task || !original || task.status === original.status) return

    // Persist the status change
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, status: task.status }),
      })
      onTasksChange()
    } catch {
      toast.error('Failed to update task status')
      setLocalTasks(tasks)
    }
  }

  const handleAddTask = async (title: string, status: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, status }),
      })
      if (res.ok) onTasksChange()
    } catch {
      toast.error('Failed to create task')
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
        {COLUMNS.map((col) => {
          const colTasks = localTasks.filter((t) => t.status === col.id)
          return (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={colTasks}
              onTaskClick={onTaskClick}
              onAddTask={handleAddTask}
            />
          )
        })}
      </div>

      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} isDragging />}
      </DragOverlay>
    </DndContext>
  )
}

/* ─── Board Column ────────────────────────────────────────────────────── */

function BoardColumn({ column, tasks, onTaskClick, onAddTask }: {
  column: (typeof COLUMNS)[number]
  tasks: PanelTask[]
  onTaskClick: (task: PanelTask) => void
  onAddTask: (title: string, status: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const colors = COL_COLORS[column.color]

  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  const handleAdd = () => {
    if (newTitle.trim()) {
      onAddTask(newTitle.trim(), column.id)
      setNewTitle('')
    }
    setAdding(false)
  }

  return (
    <div className="flex-shrink-0 w-72">
      {/* Column header */}
      <div className="flex items-center gap-2 px-2 py-2 mb-2">
        <span className={cn('w-2.5 h-2.5 rounded-full', colors.dot)} />
        <span className="text-sm font-semibold">{column.label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          'rounded-xl border p-2 min-h-[200px] transition-colors duration-200',
          colors.border,
          isOver ? 'bg-primary/5 border-primary/30' : colors.bg
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
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

        {/* Add task */}
        {adding ? (
          <div className="mt-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
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

/* ─── Sortable Task Card ──────────────────────────────────────────────── */

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

/* ─── Task Card ───────────────────────────────────────────────────────── */

function TaskCard({ task, isDragging, onClick }: { task: PanelTask; isDragging?: boolean; onClick?: () => void }) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE'

  return (
    <div
      onClick={(e) => { if (!isDragging) onClick?.() }}
      className={cn(
        'bg-card border border-border/40 rounded-lg p-3 cursor-pointer hover:border-border/70 transition-all',
        isDragging && 'opacity-50 shadow-xl scale-105 rotate-2',
      )}
    >
      {/* Labels */}
      {task.labelAssignments.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labelAssignments.map((la) => (
            <span
              key={la.label.id}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ backgroundColor: la.label.color + '20', color: la.label.color }}
            >
              {la.label.name}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <p className={cn(
        'text-sm font-medium mb-2',
        task.status === 'DONE' && 'line-through text-muted-foreground'
      )}>
        {task.title}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Due date */}
        {task.dueDate && (
          <span className={cn(
            'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded',
            isOverdue ? 'text-red-400 bg-red-400/10' : 'text-muted-foreground bg-muted/30'
          )}>
            <Calendar className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}

        {/* Priority */}
        {task.priority !== 'MEDIUM' && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Flag className={cn('w-3 h-3', {
              'text-slate-400': task.priority === 'LOW',
              'text-orange-400': task.priority === 'HIGH',
              'text-red-500': task.priority === 'URGENT',
            })} />
          </span>
        )}

        {/* Comment count */}
        {task._count.comments > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <MessageSquare className="w-3 h-3" />
            {task._count.comments}
          </span>
        )}

        {/* Spacer + assignee */}
        <div className="flex-1" />
        {task.assignee && (
          <UserAvatar name={task.assignee.name} size="xs" />
        )}
      </div>
    </div>
  )
}
