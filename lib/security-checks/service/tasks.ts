// §5 Employee flow: see own tasks, save drafts, submit and resubmit.
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { SecurityActor } from '../access'
import { sanitizeAnswers } from '../answers'
import type { DraftInput } from '../schemas'
import { canRequestNa, isSubtaskEditable, subtaskCompletionProblems } from '../submission'
import { canEmployeeEdit, checkSubmission } from '../timeline'
import type { SubtaskStatus, TaskStatus } from '../types'
import { actorEntry, actorRoleLabel } from './actor'
import { appendAudit } from './audit'
import { type Db, inTransaction, toJson } from './db'
import { conflict, notFound, SecurityChecksError } from './errors'
import { applyDueExpiries } from './expiry'
import { touchTask, transitionTask } from './task-transition'
import {
  answersOf,
  questionDefs,
  TASK_DETAIL_INCLUDE,
  timelineOf,
  toTaskDetailView,
  toTaskListItem,
  type TaskDetailView,
  type TaskListItem,
  type TaskWithDetail,
} from './task-views'

/** Loads a task the actor owns; anyone else gets 404 so task ids cannot be probed. */
export async function loadOwnTask(db: Db, actor: SecurityActor, taskId: string): Promise<TaskWithDetail> {
  const task = await db.securityTask.findUnique({ where: { id: taskId }, include: TASK_DETAIL_INCLUDE })
  if (!task || task.userId !== actor.id) throw notFound('Task not found')
  return task
}

export async function listMyTasks(actor: SecurityActor, now: Date, db: Db = prisma): Promise<TaskListItem[]> {
  await applyDueExpiries({ userId: actor.id }, now, db)
  const tasks = await db.securityTask.findMany({
    where: { userId: actor.id },
    include: { cycle: { include: { campaign: { select: { name: true, control: true } } } } },
    orderBy: { deadline: 'desc' },
    take: 200,
  })
  return tasks.map((task) => toTaskListItem(task, now))
}

export async function getMyTask(actor: SecurityActor, taskId: string, now: Date, db: Db = prisma): Promise<TaskDetailView> {
  await applyDueExpiries({ id: taskId, userId: actor.id }, now, db)
  return toTaskDetailView(await loadOwnTask(db, actor, taskId), now, { isOwner: true })
}

function ownerAudit(actor: SecurityActor) {
  return { actorId: actor.id, actorRole: actorRoleLabel(actor) }
}

function taskRef(task: TaskWithDetail) {
  return { id: task.id, status: task.status as TaskStatus, version: task.version, campaignId: task.campaignId, cycleId: task.cycleId }
}

export async function saveDraft(actor: SecurityActor, taskId: string, input: DraftInput, now: Date, db: Db = prisma): Promise<TaskDetailView> {
  await applyDueExpiries({ id: taskId, userId: actor.id }, now, db)
  await inTransaction(db, async (tx) => {
    const task = await loadOwnTask(tx, actor, taskId)
    if (!canEmployeeEdit(timelineOf(task), now)) throw conflict('This task can no longer be edited')
    const questions = questionDefs(task)
    const subtasks = new Map(task.subtasks.map((subtask) => [subtask.id, subtask]))
    for (const change of input.subtasks) {
      const subtask = subtasks.get(change.id)
      if (!subtask) throw notFound('Subtask not found')
      if (!isSubtaskEditable(task.status as TaskStatus, subtask.status as SubtaskStatus)) {
        throw conflict(`“${subtask.name}” is not open for changes`)
      }
      const data: Prisma.SecuritySubtaskUpdateInput = {}
      if (change.answers !== undefined && subtask.source !== 'DECLARATION') data.answers = toJson(sanitizeAnswers(questions, change.answers))
      if (change.declarationConfirmed !== undefined && subtask.source === 'DECLARATION') data.declarationConfirmed = change.declarationConfirmed
      if (change.naRequested !== undefined) {
        if (change.naRequested && !canRequestNa(subtask)) throw new SecurityChecksError(`N/A cannot be requested for “${subtask.name}”`, 400)
        data.naRequested = change.naRequested
        if (!change.naRequested) data.naJustification = null
      }
      if (change.naJustification !== undefined && (change.naRequested ?? subtask.naRequested)) {
        data.naJustification = change.naJustification?.trim() || null
      }
      await tx.securitySubtask.update({ where: { id: subtask.id }, data })
    }
    if (task.status === 'NOT_STARTED') await transitionTask(tx, taskRef(task), 'IN_PROGRESS', 'SAVE_DRAFT', ownerAudit(actor))
    else await touchTask(tx, task, {})
  })
  return getMyTask(actor, taskId, now, db)
}

export async function submitTask(actor: SecurityActor, taskId: string, now: Date, db: Db = prisma): Promise<TaskDetailView> {
  await applyDueExpiries({ id: taskId, userId: actor.id }, now, db)
  await inTransaction(db, async (tx) => {
    const task = await loadOwnTask(tx, actor, taskId)
    const check = checkSubmission(timelineOf(task), now)
    if (!check.ok) throw conflict(check.error)
    const status = task.status as TaskStatus
    const targets = task.subtasks.filter((subtask) => isSubtaskEditable(status, subtask.status as SubtaskStatus))
    if (targets.length === 0) throw conflict('There is nothing to submit')

    const questions = questionDefs(task)
    const evidenceRequired = task.cycle.campaign.evidenceRequired
    const activeFiles = (subtask: TaskWithDetail['subtasks'][number]) => subtask.files.filter((file) => file.deletedAt === null)
    const problems = targets.flatMap((subtask) =>
      subtaskCompletionProblems(
        { ...subtask, answers: answersOf(subtask.answers), activeFileCount: activeFiles(subtask).length },
        subtask.source === 'DECLARATION' ? [] : questions,
        evidenceRequired,
      ),
    )
    if (problems.length > 0) throw new SecurityChecksError(problems.join('; '), 400)

    const round = task.submissions.length + 1
    const submission = await tx.securitySubmission.create({
      data: {
        taskId,
        round,
        submittedById: actor.id,
        confirmed: true,
        isFinal: check.isFinal,
        snapshot: toJson(
          targets.map((subtask) => ({
            subtaskId: subtask.id,
            name: subtask.name,
            source: subtask.source,
            answers: answersOf(subtask.answers),
            declarationConfirmed: subtask.declarationConfirmed,
            naRequested: subtask.naRequested,
            naJustification: subtask.naJustification,
            fileIds: activeFiles(subtask).map((file) => file.id),
          })),
        ),
      },
    })
    const targetIds = targets.map((subtask) => subtask.id)
    await tx.securitySubtask.updateMany({ where: { id: { in: targetIds } }, data: { status: 'PENDING_REVIEW' } })
    await tx.securityEvidenceFile.updateMany({
      where: { subtaskId: { in: targetIds }, submissionId: null, deletedAt: null },
      data: { submissionId: submission.id },
    })
    await transitionTask(tx, taskRef(task), 'PENDING_REVIEW', check.isResubmission ? 'RESUBMIT' : 'SUBMIT', ownerAudit(actor), {
      firstSubmittedAt: task.firstSubmittedAt ?? now,
      lastSubmittedAt: now,
      subtasksLockedAt: task.subtasksLockedAt ?? now,
      resubmitDueAt: null,
      ...(check.isFinal ? { finalRoundAt: now } : {}),
    })
    await appendAudit(tx, actorEntry(actor, 'TASK_SUBMITTED', 'SUBMISSION', {
      targetId: submission.id,
      taskId,
      campaignId: task.campaignId,
      cycleId: task.cycleId,
      details: { round, isFinal: check.isFinal, subtaskIds: targetIds },
    }))
  })
  return getMyTask(actor, taskId, now, db)
}
