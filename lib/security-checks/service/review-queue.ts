// Console views: the review queue and a task as seen by Security / Console Admins.
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { capabilitiesOf, canViewConsole, type SecurityActor, type SecurityCapabilities } from '../access'
import { nonCompliantQuestions } from '../answers'
import { canExemptExpired, canReopen, reviewDeadlineOf } from '../timeline'
import { isFinalTaskStatus, type TaskStatus } from '../types'
import { requireCapability } from './actor'
import { type Db } from './db'
import { peopleById, personOrUnknown, type PersonSummary } from './directory'
import { notFound } from './errors'
import { applyDueExpiries } from './expiry'
import { answersOf, TASK_DETAIL_INCLUDE, timelineOf, toTaskDetailView, type TaskDetailView } from './task-views'

export interface QueueItem {
  taskId: string
  owner: PersonSummary
  campaignId: string
  campaignName: string
  cycleNumber: number
  submittedAt: string | null
  reviewDueAt: string
  finalRound: boolean
  ownTask: boolean
  pendingSubtasks: number
  naRequests: number
  nonCompliant: boolean
  confirmationOnly: boolean
}

export async function reviewQueue(actor: SecurityActor, filters: { campaignId?: string }, now: Date, db: Db = prisma): Promise<QueueItem[]> {
  requireCapability(canViewConsole(actor))
  const where: Prisma.SecurityTaskWhereInput = { status: 'PENDING_REVIEW', ...(filters.campaignId ? { campaignId: filters.campaignId } : {}) }
  await applyDueExpiries(where, now, db)
  const tasks = await db.securityTask.findMany({
    where,
    include: {
      cycle: { include: { campaign: { include: { questions: true } } } },
      subtasks: { select: { status: true, naRequested: true, answers: true, source: true } },
    },
    orderBy: { lastSubmittedAt: 'asc' },
    take: 500,
  })
  const people = await peopleById(tasks.map((task) => task.userId), db)
  return tasks.map((task) => {
    const campaign = task.cycle.campaign
    const questions = campaign.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, compliantAnswer: q.compliantAnswer }))
    const pending = task.subtasks.filter((subtask) => subtask.status === 'PENDING_REVIEW')
    return {
      taskId: task.id,
      owner: personOrUnknown(people, task.userId) as PersonSummary,
      campaignId: campaign.id,
      campaignName: campaign.name,
      cycleNumber: task.cycle.number,
      submittedAt: task.lastSubmittedAt?.toISOString() ?? null,
      reviewDueAt: reviewDeadlineOf(task).toISOString(),
      finalRound: task.finalRoundAt !== null,
      ownTask: task.userId === actor.id,
      pendingSubtasks: pending.length,
      naRequests: pending.filter((subtask) => subtask.naRequested).length,
      nonCompliant: pending.some(
        (subtask) => subtask.source !== 'DECLARATION' && nonCompliantQuestions(questions, answersOf(subtask.answers)).length > 0,
      ),
      confirmationOnly: !campaign.evidenceRequired && campaign.subtaskMode === 'NONE',
    }
  })
}

export interface ConsoleTaskView extends TaskDetailView {
  owner: PersonSummary
  historyNames: Record<string, string>
  capabilities: SecurityCapabilities
  actions: { canReview: boolean; canReopen: boolean; canExtend: boolean; canExempt: boolean; canMarkNa: boolean; ownTask: boolean }
}

export async function getConsoleTask(actor: SecurityActor, taskId: string, now: Date, db: Db = prisma): Promise<ConsoleTaskView> {
  requireCapability(canViewConsole(actor))
  await applyDueExpiries({ id: taskId }, now, db)
  const task = await db.securityTask.findUnique({ where: { id: taskId }, include: TASK_DETAIL_INCLUDE })
  if (!task) throw notFound('Task not found')
  const view = toTaskDetailView(task, now, { isOwner: false })
  const actorIds = [task.userId, ...task.reviewActions.map((action) => action.reviewerId), ...task.submissions.map((entry) => entry.submittedById)]
  const people = await peopleById(actorIds, db)
  const capabilities = capabilitiesOf(actor)
  const status = task.status as TaskStatus
  const timeline = timelineOf(task)
  const final = isFinalTaskStatus(status)
  return {
    ...view,
    owner: personOrUnknown(people, task.userId) as PersonSummary,
    historyNames: Object.fromEntries([...people.values()].map((person) => [person.id, person.name])),
    capabilities,
    actions: {
      canReview: capabilities.review && status === 'PENDING_REVIEW',
      canReopen: capabilities.manageTasks && canReopen(timeline, now),
      canExtend: capabilities.manageTasks && !final,
      canExempt: capabilities.manageTasks && (!final || canExemptExpired(timeline, now)),
      canMarkNa: capabilities.manageTasks && !final,
      ownTask: task.userId === actor.id,
    },
  }
}
