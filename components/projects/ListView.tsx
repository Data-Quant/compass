'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { SectionGroup } from './SectionGroup'
import type { PanelTask } from './TaskDetailPanel'
import { TaskRow } from './TaskRow'
import { getTaskStatusForSectionName } from '@/lib/project-task-utils'

interface Section {
  id: string
  name: string
  orderIndex: number
}

interface ListViewProps {
  projectId: string
  tasks: PanelTask[]
  sections: Section[]
  onTaskClick: (task: PanelTask) => void
  onTasksChange: () => void
}

const UNSECTIONED_CONTAINER_ID = 'section:unsectioned'

function getSectionContainerId(sectionId: string | null) {
  return sectionId ? `section:${sectionId}` : UNSECTIONED_CONTAINER_ID
}

function parseSectionContainerId(containerId: string) {
  if (!containerId.startsWith('section:')) return undefined
  const value = containerId.slice('section:'.length)
  return value === 'unsectioned' ? null : value
}

export function ListView({ projectId, tasks, sections, onTaskClick, onTasksChange }: ListViewProps) {
  const [addingSectionName, setAddingSectionName] = useState('')
  const [showSectionInput, setShowSectionInput] = useState(false)
  const [localTasks, setLocalTasks] = useState<PanelTask[]>(tasks)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    setLocalTasks(tasks)
  }, [tasks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const sectionStatusById = useMemo(() => {
    const map = new Map<string, PanelTask['status']>()
    for (const section of sections) {
      const status = getTaskStatusForSectionName(section.name)
      if (status) map.set(section.id, status)
    }
    return map
  }, [sections])

  const activeTask = activeId ? localTasks.find((task) => task.id === activeId) : null

  const getTargetSectionId = (overId: string, sourceTasks = localTasks) => {
    const containerSectionId = parseSectionContainerId(overId)
    if (containerSectionId !== undefined) return containerSectionId

    const overTask = sourceTasks.find((task) => task.id === overId)
    return overTask ? overTask.sectionId : undefined
  }

  // Group tasks by section
  const unsectionedTasks = localTasks.filter((t) => !t.sectionId)
  const sectionedTasks = sections.map((s) => ({
    ...s,
    tasks: localTasks.filter((t) => t.sectionId === s.id),
  }))

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeTaskId = String(active.id)
    const targetSectionId = getTargetSectionId(String(over.id))
    if (targetSectionId === undefined) return

    setLocalTasks((prev) => {
      const task = prev.find((item) => item.id === activeTaskId)
      if (!task) return prev

      const targetStatus = targetSectionId
        ? sectionStatusById.get(targetSectionId) || task.status
        : task.status

      if (task.sectionId === targetSectionId && task.status === targetStatus) {
        return prev
      }

      return prev.map((item) =>
        item.id === activeTaskId
          ? { ...item, sectionId: targetSectionId, status: targetStatus }
          : item
      )
    })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const activeTaskId = String(active.id)
    setActiveId(null)

    if (!over) {
      setLocalTasks(tasks)
      return
    }

    const task = localTasks.find((item) => item.id === activeTaskId)
    const original = tasks.find((item) => item.id === activeTaskId)
    if (!task || !original) return

    const sectionChanged = task.sectionId !== original.sectionId
    const statusChanged = task.status !== original.status
    if (!sectionChanged && !statusChanged) return

    const targetSectionTasks = tasks.filter((item) => item.id !== task.id && item.sectionId === task.sectionId)
    const maxOrderIndex = Math.max(0, ...targetSectionTasks.map((item) => Number(item.orderIndex) || 0))

    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          sectionId: task.sectionId,
          status: task.status,
          ...(sectionChanged ? { orderIndex: maxOrderIndex + 1 } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update task')
      }
      onTasksChange()
    } catch (error) {
      setLocalTasks(tasks)
      toast.error(error instanceof Error ? error.message : 'Failed to move task')
    }
  }

  const handleAddTask = async (title: string, sectionId: string | null) => {
    const status = sectionId ? sectionStatusById.get(sectionId) : undefined

    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, sectionId, ...(status ? { status } : {}) }),
      })
      const data = await res.json()
      if (data.success) {
        onTasksChange()
      }
    } catch {
      toast.error('Failed to create task')
    }
  }

  const handleAddSection = async () => {
    if (!addingSectionName.trim()) {
      setShowSectionInput(false)
      return
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addingSectionName.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        onTasksChange()
        setAddingSectionName('')
        setShowSectionInput(false)
      }
    } catch {
      toast.error('Failed to create section')
    }
  }

  const handleDeleteSection = async (sectionId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sections?sectionId=${sectionId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        onTasksChange()
        toast.success('Section deleted')
      }
    } catch {
      toast.error('Failed to delete section')
    }
  }

  const handleRenameSection = async (sectionId: string, name: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId, name }),
      })
      const data = await res.json()
      if (data.success) onTasksChange()
    } catch {
      toast.error('Failed to rename section')
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
      <div className="space-y-1">
      {/* Unsectioned tasks */}
      {(unsectionedTasks.length > 0 || sections.length === 0) && (
        <SortableContext items={unsectionedTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <SectionGroup
            sectionId={null}
            sectionName="Tasks"
            tasks={unsectionedTasks}
            onTaskClick={onTaskClick}
            onAddTask={handleAddTask}
            collapsible={sections.length > 0}
            containerId={getSectionContainerId(null)}
          />
        </SortableContext>
      )}

      {/* Sections */}
      {sectionedTasks.map((section) => (
        <SortableContext key={section.id} items={section.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <SectionGroup
            sectionId={section.id}
            sectionName={section.name}
            tasks={section.tasks}
            onTaskClick={onTaskClick}
            onAddTask={handleAddTask}
            onDeleteSection={handleDeleteSection}
            onRenameSection={handleRenameSection}
            containerId={getSectionContainerId(section.id)}
          />
        </SortableContext>
      ))}

      {/* Add section */}
      {showSectionInput ? (
        <div className="flex items-center gap-2 px-4 py-2">
          <input
            autoFocus
            value={addingSectionName}
            onChange={(e) => setAddingSectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddSection()
              if (e.key === 'Escape') { setShowSectionInput(false); setAddingSectionName('') }
            }}
            onBlur={handleAddSection}
            placeholder="Section name"
            className="flex-1 bg-transparent border-b border-primary/40 outline-none text-sm font-semibold py-1 placeholder:text-muted-foreground/40"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowSectionInput(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/20 rounded-lg transition-colors w-full"
        >
          <Plus className="w-4 h-4" />
          Add section
        </button>
      )}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rounded-lg border border-border/50 bg-card shadow-xl">
            <TaskRow task={activeTask} onClick={() => undefined} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
