import { prisma } from '@/lib/db'
import type { ProjectStatus } from '@prisma/client'

/**
 * Decides what a project's status should be given its task completion.
 *
 * - All tasks done (and at least one task) -> COMPLETED.
 * - Otherwise a COMPLETED project reverts to ACTIVE (only when `allowDemote`).
 * - ARCHIVED projects are never touched.
 *
 * Returns the new status, or null when no change is needed. Progress mirrors the
 * dashboard definition: a task counts as done when its status is DONE.
 */
export function resolveProjectStatusForCompletion(
  current: ProjectStatus,
  totalTasks: number,
  doneTasks: number,
  options: { allowDemote?: boolean } = {}
): ProjectStatus | null {
  if (current === 'ARCHIVED') return null

  const allDone = totalTasks > 0 && doneTasks >= totalTasks
  if (allDone) {
    return current === 'COMPLETED' ? null : 'COMPLETED'
  }

  if (current === 'COMPLETED' && options.allowDemote) {
    return 'ACTIVE'
  }
  return null
}

/**
 * Recomputes a single project's completion status from its tasks and persists
 * any change. Call after creating, updating, or deleting a task. Failures are
 * the caller's responsibility to swallow — status sync must not break the task
 * mutation that triggered it.
 */
export async function syncProjectCompletion(projectId: string): Promise<ProjectStatus | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  })
  if (!project) return null

  const [totalTasks, doneTasks] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.task.count({ where: { projectId, status: 'DONE' } }),
  ])

  const nextStatus = resolveProjectStatusForCompletion(project.status, totalTasks, doneTasks, {
    allowDemote: true,
  })
  if (!nextStatus) return null

  await prisma.project.update({
    where: { id: projectId },
    data: { status: nextStatus },
  })
  return nextStatus
}
