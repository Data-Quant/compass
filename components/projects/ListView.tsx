'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { OpenedProjectTaskTable } from './WorkspaceTaskTable'
import type { PanelTask } from './TaskDetailPanel'
import type {
  TaskOptimisticPatch,
  TaskPatchRequest,
  WorkspaceProject,
} from './workspace-types'

interface ListViewProps {
  project: WorkspaceProject
  viewerId: string
  onTaskClick: (task: PanelTask) => void
  onTasksChange: () => Promise<void> | void
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

function responseError(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === 'string' && data.error ? data.error : fallback
}

export function ListView({ project, viewerId, onTaskClick, onTasksChange }: ListViewProps) {
  const [selectedIds, setSelectedIds] = useState(new Set<string>())
  const [pendingTaskIds, setPendingTaskIds] = useState(new Set<string>())
  const [creatingTask, setCreatingTask] = useState(false)

  const setTaskPending = (taskId: string, pending: boolean) => {
    setPendingTaskIds((current) => {
      const next = new Set(current)
      if (pending) next.add(taskId)
      else next.delete(taskId)
      return next
    })
  }

  const patchTask = async (
    projectId: string,
    taskId: string,
    request: TaskPatchRequest,
    _optimistic: TaskOptimisticPatch,
  ) => {
    setTaskPending(taskId, true)
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, ...request }),
      })
      const data = await responseJson(response)
      if (!response.ok || data.success !== true) {
        throw new Error(responseError(data, 'Failed to update the task'))
      }
      await onTasksChange()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update the task')
      return false
    } finally {
      setTaskPending(taskId, false)
    }
  }

  const createTask = async (parentTaskId: string | null, title: string) => {
    const parentTask = parentTaskId
      ? project.tasks.find((task) => task.id === parentTaskId)
      : null
    const todoSection = project.sections.find((section) => !section.isBacklog && section.canonicalStatus === 'TODO')
      || project.sections.find((section) => !section.isBacklog)
      || project.sections[0]

    if (!parentTaskId) setCreatingTask(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          sectionId: parentTask?.sectionId || todoSection?.id || null,
          priority: 'MEDIUM',
          ...(parentTaskId ? { parentTaskId } : {}),
          ...(!project.canManage ? { assigneeId: viewerId } : {}),
        }),
      })
      const data = await responseJson(response)
      if (!response.ok || data.success !== true) {
        throw new Error(responseError(data, parentTaskId ? 'Failed to create the subtask' : 'Failed to create the task'))
      }
      await onTasksChange()
      return true
    } catch (error) {
      toast.error(error instanceof Error
        ? error.message
        : parentTaskId ? 'Failed to create the subtask' : 'Failed to create the task')
      return false
    } finally {
      if (!parentTaskId) setCreatingTask(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-card shadow-none">
      <OpenedProjectTaskTable
        project={project}
        tasks={project.tasks}
        viewerId={viewerId}
        selectedIds={selectedIds}
        pendingTaskIds={pendingTaskIds}
        creatingTask={creatingTask}
        defaultExpandAll
        onToggleSelected={(taskId, selected) => setSelectedIds((current) => {
          const next = new Set(current)
          if (selected) next.add(taskId)
          else next.delete(taskId)
          return next
        })}
        onPatchTask={patchTask}
        onOpenTask={(_projectId, taskId) => {
          const task = project.tasks.find((candidate) => candidate.id === taskId)
          if (task) onTaskClick(task)
        }}
        onCreateTask={createTask}
      />
    </div>
  )
}
