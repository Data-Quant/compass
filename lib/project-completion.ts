import { prisma } from '@/lib/db'
import type { ProjectStatus } from '@prisma/client'
import { calculateProjectProgress } from '@/lib/project-progress'

/**
 * Decides what a project's status should be given its task completion.
 *
 * - All non-backlog tasks done (and at least one active task) -> COMPLETED.
 * - Otherwise a COMPLETED project reverts to ACTIVE (only when `allowDemote`).
 * - ON_HOLD and ARCHIVED projects are never touched.
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
  if (current === 'ARCHIVED' || current === 'ON_HOLD') return null

  // Backlog-only work is excluded from progress and therefore must not reopen
  // a manually completed project.
  if (totalTasks === 0) return null

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

  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: {
      status: true,
      section: { select: { isBacklog: true } },
    },
  })
  const progress = calculateProjectProgress(tasks)

  const nextStatus = resolveProjectStatusForCompletion(project.status, progress.total, progress.completed, {
    allowDemote: true,
  })
  if (!nextStatus) return null

  await prisma.project.update({
    where: { id: projectId },
    data: { status: nextStatus },
  })
  return nextStatus
}
