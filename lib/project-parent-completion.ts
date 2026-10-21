import { prisma } from '@/lib/db'
import type { TaskStatus } from '@prisma/client'
import { shouldMarkTaskCompletedLate } from '@/lib/project-progress'
import { getTaskStatusForSection, resolveTaskStatusSection } from '@/lib/project-status-sections'
import { recordTaskActivity } from '@/lib/project-task-activity'

export const MAX_PARENT_SYNC_DEPTH = 10

type TaskLike = { status: TaskStatus; isBacklog: boolean }

/**
 * Decides what a parent task's status should be given its subtasks.
 *
 * - Every non-backlog child done (and at least one) -> DONE.
 * - A DONE parent with an open child -> IN_PROGRESS. Open parents are otherwise left alone.
 * - Backlog parents are never touched; backlog children are ignored.
 *
 * Returns the new status, or null when no change is needed.
 */
export function resolveParentTaskStatus(
  parent: TaskLike,
  children: TaskLike[]
): 'DONE' | 'IN_PROGRESS' | null {
  if (parent.isBacklog) return null
  const counted = children.filter((c) => !c.isBacklog)
  if (counted.length === 0) return null

  if (counted.every((c) => c.status === 'DONE')) return parent.status === 'DONE' ? null : 'DONE'
  return parent.status === 'DONE' ? 'IN_PROGRESS' : null
}

/**
 * Walks up from `parentTaskId`, applying resolveParentTaskStatus to each ancestor
 * and persisting changes. Returns the changed ancestor ids, nearest first.
 * Failures are the caller's responsibility to swallow — the sync must not break
 * the task mutation that triggered it.
 */
export async function syncParentTaskStatus(input: {
  parentTaskId: string | null
  actorId: string
  origin: string
}): Promise<string[]> {
  const changed: string[] = []
  const visited = new Set<string>()
  let currentId = input.parentTaskId

  while (currentId && visited.size < MAX_PARENT_SYNC_DEPTH && !visited.has(currentId)) {
    visited.add(currentId)

    const parent = await prisma.task.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        projectId: true,
        status: true,
        dueDate: true,
        completedAt: true,
        completedLate: true,
        parentTaskId: true,
        section: { select: { isBacklog: true, isDone: true, canonicalStatus: true } },
      },
    })
    if (!parent) break

    const children = await prisma.task.findMany({
      where: { parentTaskId: parent.id },
      select: { status: true, section: { select: { isBacklog: true } } },
    })
    const next = resolveParentTaskStatus(
      { status: parent.status, isBacklog: parent.section?.isBacklog ?? false },
      children.map((c) => ({ status: c.status, isBacklog: c.section?.isBacklog ?? false }))
    )
    if (!next) break

    const section = await resolveTaskStatusSection({
      projectId: parent.projectId,
      sectionId: null,
      status: next,
      fallbackStatus: next,
    })
    if (!section) break

    const nextStatus = getTaskStatusForSection(section)
    await prisma.task.update({
      where: { id: parent.id },
      data: {
        sectionId: section.id,
        status: nextStatus,
        completedAt: nextStatus === 'DONE' ? new Date() : null,
        completedLate: shouldMarkTaskCompletedLate({
          wasCompletedLate: parent.completedLate,
          previousStatus: parent.status,
          nextStatus,
          dueDate: parent.dueDate,
          section,
        }),
      },
    })
    await recordTaskActivity({
      taskId: parent.id,
      actorId: input.actorId,
      kind: 'status',
      summary:
        next === 'DONE'
          ? 'Moved to Done automatically because all subtasks are done'
          : 'Reopened automatically because a subtask is open again',
      origin: input.origin,
      notify: false, // recordTaskActivity emails unless notify is false
    })

    changed.push(parent.id)
    currentId = parent.parentTaskId
  }

  return changed
}
