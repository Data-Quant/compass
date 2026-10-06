import type { Prisma, WeeklyPrompt, WeeklyResponse } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  afterNotObserved, answerProblem, canEditSubmitted, commentProblem, evaluatorStatus, RECENTLY_SUBMITTED_MS,
} from '../answer-rules'
import { cycleWeeks, effectiveWeek } from '../calendar'
import { areWeeklyTestToolsEnabled } from '../flag'
import { perspectiveOf } from '../perspectives'
import { isConfirmedAction, latestByResponse } from '../reviews'
import { QUESTIONS_PER_PAIR } from '../scheduler'
import type { AnswerInput } from '../schemas'
import type { AnswerView, EvaluateeProgress, HistoryGroup, HistoryResponse, InboxPrompt, InboxResponse } from '../view-types'
import { recordAudit } from './audit'
import { byName, isHrActor, loadPeople, personRef, type WeeklyActor } from './context'
import { cycleSummary, findRunningCycle, loadCycle } from './cycles'
import { WeeklyError } from './errors'

export interface InboxSubject { evaluatorId: string; actingAs: boolean }

const ANSWERED = 'This question was already answered'
const promptInclude = { response: true, slot: { select: { competency: { select: { name: true } } } } } as const satisfies Prisma.WeeklyPromptInclude
type PromptRow = WeeklyPrompt & { response: WeeklyResponse | null; slot: { competency: { name: string } } | null }

/** HR may open someone else's inbox only with the preview test tools on; every write is audited. */
export async function resolveSubject(actor: WeeklyActor, asUserId: string | null | undefined): Promise<InboxSubject> {
  if (!asUserId || asUserId === actor.id) return { evaluatorId: actor.id, actingAs: false }
  if (!areWeeklyTestToolsEnabled() || !isHrActor(actor)) throw new WeeklyError('Only HR can open someone else’s questions, and only with the test tools on', 403)
  const exists = await prisma.user.findUnique({ where: { id: asUserId }, select: { id: true } })
  if (!exists) throw new WeeklyError('Person not found', 404)
  return { evaluatorId: asUserId, actingAs: true }
}

export async function openPromptCount(cycleId: string, evaluatorId: string): Promise<number> {
  return prisma.weeklyPrompt.count({ where: { cycleId, evaluatorId, status: { in: ['OPEN', 'DRAFT'] } } })
}

function answerView(response: WeeklyResponse | null): AnswerView | null {
  if (!response) return null
  return { situation: response.situation, action: response.action, result: response.result, shortfall: response.shortfall, commentText: response.commentText }
}

function topicOf(prompt: PromptRow): string {
  return prompt.kind === 'COMMENT' ? 'Comment (optional)' : prompt.slot?.competency.name ?? 'Question'
}

const LOCKED = 'This quarter is locked, so answers can no longer change'

async function periodLocked(periodId: string): Promise<boolean> {
  return (await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { isLocked: true } }))?.isLocked ?? false
}

/** Per person: of the quarter's five questions, how many are answered (or not observed) and how many were accepted. */
async function progressFor(cycleId: string, evaluatorId: string): Promise<EvaluateeProgress[]> {
  const [slots, prompts] = await Promise.all([
    prisma.weeklySlot.findMany({ where: { cycleId, evaluatorId, status: { not: 'CANCELLED' } }, select: { evaluateeId: true, relationshipType: true } }),
    prisma.weeklyPrompt.findMany({
      where: { cycleId, evaluatorId, kind: 'STANDARD', status: { in: ['SUBMITTED', 'NOT_OBSERVED'] } },
      select: { evaluateeId: true, relationshipType: true, response: { select: { id: true } } },
    }),
  ])
  const responseIds = prompts.flatMap((p) => (p.response ? [p.response.id] : []))
  const reviews = responseIds.length
    ? await prisma.weeklyScoreReview.findMany({ where: { responseId: { in: responseIds } }, select: { id: true, responseId: true, createdAt: true, action: true } })
    : []
  const accepted = new Set([...latestByResponse(reviews).values()].filter((r) => isConfirmedAction(r.action)).map((r) => r.responseId))
  const people = await loadPeople(slots.map((s) => s.evaluateeId))
  const groups = new Map<string, EvaluateeProgress>()
  const keyOf = (row: { evaluateeId: string; relationshipType: string }) => `${row.evaluateeId}|${row.relationshipType}`
  for (const slot of slots) {
    if (groups.has(keyOf(slot))) continue
    groups.set(keyOf(slot), { evaluatee: personRef(people, slot.evaluateeId), perspective: perspectiveOf(slot.relationshipType) ?? 'PEER', answered: 0, satisfied: 0, total: QUESTIONS_PER_PAIR })
  }
  for (const prompt of prompts) {
    const current = groups.get(keyOf(prompt))
    if (!current) continue
    groups.set(keyOf(prompt), {
      ...current,
      answered: Math.min(QUESTIONS_PER_PAIR, current.answered + 1),
      satisfied: current.satisfied + (prompt.response && accepted.has(prompt.response.id) ? 1 : 0),
    })
  }
  return [...groups.values()].sort((a, b) => byName(a.evaluatee, b.evaluatee))
}

export async function inboxView(evaluatorId: string, now: Date): Promise<InboxResponse> {
  const cycle = await findRunningCycle()
  if (!cycle) return { cycle: null, prompts: [], progress: [] }
  const summary = cycleSummary(cycle, now)
  const prompts: PromptRow[] = await prisma.weeklyPrompt.findMany({
    where: {
      cycleId: cycle.id, evaluatorId,
      OR: [{ status: { in: ['OPEN', 'DRAFT'] } }, { status: 'SUBMITTED', response: { submittedAt: { gte: new Date(now.getTime() - RECENTLY_SUBMITTED_MS) } } }],
    },
    include: promptInclude,
    orderBy: [{ weekIndex: 'asc' }, { createdAt: 'asc' }],
  })
  const [people, locked, progress] = await Promise.all([
    loadPeople(prompts.map((p) => p.evaluateeId)),
    periodLocked(cycle.periodId),
    progressFor(cycle.id, evaluatorId),
  ])
  const view: InboxPrompt[] = prompts.map((p) => {
    const submittedAt = p.response?.submittedAt ?? null
    return {
      id: p.id, weekIndex: p.weekIndex, kind: p.kind, status: p.status as InboxPrompt['status'], text: p.textSnapshot, topic: topicOf(p),
      perspective: perspectiveOf(p.relationshipType) ?? 'PEER', evaluatee: personRef(people, p.evaluateeId), answer: answerView(p.response),
      submittedAt: submittedAt?.toISOString() ?? null,
      canEdit: p.status === 'SUBMITTED' ? canEditSubmitted({ submittedAt, periodLocked: locked }) : !locked,
      overdue: p.weekIndex < summary.currentWeek,
    }
  })
  return { cycle: summary, prompts: view, progress }
}

async function ownPrompt(evaluatorId: string, promptId: string) {
  const prompt = await prisma.weeklyPrompt.findUnique({ where: { id: promptId }, include: { response: true, cycle: { select: { status: true, periodId: true } } } })
  if (!prompt || prompt.evaluatorId !== evaluatorId) throw new WeeklyError('Question not found', 404)
  if (prompt.cycle.status !== 'RUNNING') throw new WeeklyError('This quarter’s weekly evaluations are closed', 409)
  if (await periodLocked(prompt.cycle.periodId)) throw new WeeklyError(LOCKED, 409)
  return prompt
}

function draftFields(input: AnswerInput) {
  return { situation: input.situation, action: input.action, result: input.result, shortfall: input.shortfall ?? null, commentText: input.commentText ?? null }
}

export async function saveDraft(actor: WeeklyActor, subject: InboxSubject, promptId: string, input: AnswerInput, now: Date): Promise<{ savedAt: string }> {
  const prompt = await ownPrompt(subject.evaluatorId, promptId)
  if (prompt.status !== 'OPEN' && prompt.status !== 'DRAFT') throw new WeeklyError(ANSWERED, 409)
  await prisma.$transaction(async (tx) => {
    // The guarded status change locks the row, so a concurrent submit cannot be overwritten.
    const moved = await tx.weeklyPrompt.updateMany({ where: { id: promptId, status: { in: ['OPEN', 'DRAFT'] } }, data: { status: 'DRAFT' } })
    if (moved.count === 0) throw new WeeklyError(ANSWERED, 409)
    await tx.weeklyResponse.upsert({ where: { promptId }, create: { promptId, ...draftFields(input) }, update: draftFields(input) })
  })
  return { savedAt: now.toISOString() }
}

export async function submitAnswer(actor: WeeklyActor, subject: InboxSubject, promptId: string, input: AnswerInput, now: Date): Promise<{ status: 'SUBMITTED'; revision: number }> {
  const prompt = await ownPrompt(subject.evaluatorId, promptId)
  const comment = prompt.kind === 'COMMENT'
  const problem = comment ? commentProblem(input.commentText) : answerProblem(input)
  if (problem) throw new WeeklyError(problem)
  const data = comment
    ? { situation: '', action: '', result: '', shortfall: null, commentText: (input.commentText ?? '').trim() }
    : { situation: input.situation.trim(), action: input.action.trim(), result: input.result.trim(), shortfall: input.shortfall?.trim() || null, commentText: null }
  return prisma.$transaction(async (tx) => {
    let revision: number
    if (prompt.status === 'OPEN' || prompt.status === 'DRAFT') {
      const moved = await tx.weeklyPrompt.updateMany({ where: { id: promptId, status: { in: ['OPEN', 'DRAFT'] } }, data: { status: 'SUBMITTED' } })
      if (moved.count === 0) throw new WeeklyError(ANSWERED, 409)
      revision = (prompt.response?.revision ?? 0) + 1
      await tx.weeklyResponse.upsert({ where: { promptId }, create: { promptId, ...data, revision, submittedAt: now }, update: { ...data, revision, submittedAt: now } })
    } else if (prompt.status === 'SUBMITTED' && prompt.response) {
      // Editable until the quarter is locked (checked above). An answer HR already decided is scored again and, because
      // a person judged it, comes back to HR rather than being accepted automatically.
      const updated = await tx.weeklyResponse.updateMany({ where: { id: prompt.response.id, revision: prompt.response.revision }, data: { ...data, revision: { increment: 1 } } })
      if (updated.count === 0) throw new WeeklyError('This answer changed since you opened it; reload and try again', 409)
      revision = prompt.response.revision + 1
      await tx.weeklyScoringJob.updateMany({ where: { responseId: prompt.response.id, status: 'PENDING' }, data: { status: 'CANCELLED' } })
    } else {
      throw new WeeklyError('This question can no longer be answered', 409)
    }
    if (!comment) {
      const response = await tx.weeklyResponse.findUniqueOrThrow({ where: { promptId } })
      await tx.weeklyScoringJob.create({ data: { responseId: response.id, revision } })
    }
    if (subject.actingAs) {
      await recordAudit(tx, { cycleId: prompt.cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_ACT_AS_SUBMIT', objectType: 'WeeklyPrompt', objectId: promptId, after: { evaluatorId: subject.evaluatorId } })
    }
    return { status: 'SUBMITTED' as const, revision }
  })
}

export async function markNotObserved(actor: WeeklyActor, subject: InboxSubject, promptId: string, now: Date): Promise<void> {
  const prompt = await ownPrompt(subject.evaluatorId, promptId)
  if (prompt.status !== 'OPEN' && prompt.status !== 'DRAFT') throw new WeeklyError(ANSWERED, 409)
  const cycle = await loadCycle(prompt.cycleId)
  const week = Math.min(cycleWeeks(cycle), effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now))
  await prisma.$transaction(async (tx) => {
    const moved = await tx.weeklyPrompt.updateMany({ where: { id: promptId, status: { in: ['OPEN', 'DRAFT'] } }, data: { status: 'NOT_OBSERVED' } })
    if (moved.count === 0) throw new WeeklyError(ANSWERED, 409)
    if (prompt.slotId) {
      const slot = await tx.weeklySlot.findUniqueOrThrow({ where: { id: prompt.slotId } })
      const outcome = afterNotObserved(slot.notObservedCount, week)
      await tx.weeklySlot.update({
        where: { id: slot.id },
        // A slot that already has confirmed evidence stays satisfied.
        data: { status: slot.status === 'SATISFIED' ? 'SATISFIED' : outcome.status, snoozedUntilWeek: outcome.snoozedUntilWeek, notObservedCount: outcome.notObservedCount },
      })
    }
    if (subject.actingAs) {
      await recordAudit(tx, { cycleId: prompt.cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_ACT_AS_NOT_OBSERVED', objectType: 'WeeklyPrompt', objectId: promptId })
    }
  })
}

export async function historyView(evaluatorId: string): Promise<HistoryResponse> {
  const cycle = await findRunningCycle()
  if (!cycle) return { cycle: null, groups: [] }
  const prompts: PromptRow[] = await prisma.weeklyPrompt.findMany({ where: { cycleId: cycle.id, evaluatorId }, include: promptInclude, orderBy: [{ weekIndex: 'desc' }, { createdAt: 'desc' }] })
  const responseIds = prompts.flatMap((p) => (p.response ? [p.response.id] : []))
  const [people, locked, reviews] = await Promise.all([
    loadPeople(prompts.map((p) => p.evaluateeId)),
    periodLocked(cycle.periodId),
    prisma.weeklyScoreReview.findMany({ where: { responseId: { in: responseIds } }, select: { id: true, responseId: true, createdAt: true, action: true } }),
  ])
  const latest = latestByResponse(reviews)
  const groups = new Map<string, HistoryGroup>()
  for (const p of prompts) {
    const key = `${p.evaluateeId}|${p.relationshipType}`
    const group = groups.get(key) ?? { evaluatee: personRef(people, p.evaluateeId), perspective: perspectiveOf(p.relationshipType) ?? 'PEER', entries: [] }
    const responseId = p.response?.id ?? ''
    groups.set(key, {
      ...group,
      entries: [
        ...group.entries,
        {
          id: p.id, weekIndex: p.weekIndex, kind: p.kind, topic: topicOf(p), text: p.textSnapshot,
          status: evaluatorStatus({ promptStatus: p.status, latestReviewAction: latest.get(responseId)?.action ?? null }),
          answer: answerView(p.response), submittedAt: p.response?.submittedAt?.toISOString() ?? null,
          canEdit: p.status === 'SUBMITTED' && canEditSubmitted({ submittedAt: p.response?.submittedAt ?? null, periodLocked: locked }),
        },
      ],
    })
  }
  return { cycle: cycleSummary(cycle, new Date()), groups: [...groups.values()].sort((a, b) => byName(a.evaluatee, b.evaluatee)) }
}
