// §10 Employee-added subtasks: add / rename / delete only before the task's
// first submission (each change logged); locked afterwards, so a rejected
// subtask can never be deleted to hide an unapproved tool.
import { prisma } from '@/lib/db'
import type { SecurityActor } from '../access'
import { allowsEmployeeSubtasks, type EmployeeSubtaskInput } from '../schemas'
import { canEmployeeEdit } from '../timeline'
import { LIMITS } from '../types'
import { actorEntry } from './actor'
import { appendAudit } from './audit'
import { type Db, inTransaction } from './db'
import { conflict, notFound, SecurityChecksError } from './errors'
import type { BlobStore } from './blob-store'
import { applyDueExpiries } from './expiry'
import { touchTask } from './task-transition'
import { timelineOf } from './task-views'
import { loadOwnTask } from './tasks'

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export async function manageEmployeeSubtask(
  actor: SecurityActor,
  taskId: string,
  input: EmployeeSubtaskInput,
  now: Date,
  store: BlobStore,
  db: Db = prisma,
): Promise<void> {
  await applyDueExpiries({ id: taskId, userId: actor.id }, now, db)
  const blobsToRemove = await inTransaction(db, async (tx) => {
    const task = await loadOwnTask(tx, actor, taskId)
    if (!allowsEmployeeSubtasks(task.cycle.campaign.subtaskMode)) throw conflict('This campaign does not take your own subtasks')
    if (task.firstSubmittedAt || task.subtasksLockedAt) throw conflict('Subtasks are locked after the first submission')
    if (!canEmployeeEdit(timelineOf(task), now)) throw conflict('This task can no longer be edited')
    const audit = (action: string, details: Record<string, unknown>, subtaskId: string) =>
      appendAudit(tx, actorEntry(actor, action, 'SUBTASK', { targetId: subtaskId, taskId, campaignId: task.campaignId, cycleId: task.cycleId, details }))

    if (input.action === 'add') {
      if (task.subtasks.length >= LIMITS.maxSubtasksPerTask) {
        throw new SecurityChecksError(`A task can have at most ${LIMITS.maxSubtasksPerTask} subtasks`, 400)
      }
      if (task.subtasks.some((subtask) => sameName(subtask.name, input.name))) throw new SecurityChecksError('You already listed that tool', 400)
      const position = Math.max(-1, ...task.subtasks.map((subtask) => subtask.position)) + 1
      const created = await tx.securitySubtask.create({ data: { taskId, position, name: input.name, source: 'EMPLOYEE' } })
      await audit('EMPLOYEE_SUBTASK_ADDED', { name: input.name }, created.id)
      await touchTask(tx, task, {})
      return []
    }

    const subtask = task.subtasks.find((entry) => entry.id === input.subtaskId)
    if (!subtask) throw notFound('Subtask not found')
    if (subtask.source !== 'EMPLOYEE') throw conflict('Only subtasks you added can be changed')

    if (input.action === 'rename') {
      if (task.subtasks.some((entry) => entry.id !== subtask.id && sameName(entry.name, input.name))) {
        throw new SecurityChecksError('You already listed that tool', 400)
      }
      await tx.securitySubtask.update({ where: { id: subtask.id }, data: { name: input.name } })
      await audit('EMPLOYEE_SUBTASK_RENAMED', { from: subtask.name, to: input.name }, subtask.id)
      await touchTask(tx, task, {})
      return []
    }

    // Never-submitted draft: its files were never part of a submission.
    const paths = subtask.files.filter((file) => file.deletedAt === null).map((file) => file.storagePath)
    await tx.securityEvidenceFile.deleteMany({ where: { subtaskId: subtask.id } })
    await tx.securitySubtask.delete({ where: { id: subtask.id } })
    await audit('EMPLOYEE_SUBTASK_DELETED', { name: subtask.name, filesRemoved: paths.length }, subtask.id)
    await touchTask(tx, task, {})
    return paths
  })
  for (const path of blobsToRemove) await store.remove(path)
}
