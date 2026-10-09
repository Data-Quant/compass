// An evaluator's weekly questions (UX spec, section 8). Each question offers 8 statements in a shuffled order fixed at
// release; choosing one saves the answer with that statement's level and queues the model, whose score HR reviews. A
// note is required for the extreme statements. Answers can change until HR locks the quarter.
import type { Prisma, WeeklyPrompt, WeeklyResponse } from '@prisma/client'
import { prisma } from '@/lib/db'
import { afterNotObserved, canEditSubmitted, choiceProblem, commentProblem, evaluatorStatus, RECENTLY_SUBMITTED_MS } from '../answer-rules'
import { cycleWeeks, effectiveWeek } from '../calendar'
import { areWeeklyTestToolsEnabled } from '../flag'
import { parseOptions } from '../mcq'
import { perspectiveOf } from '../perspectives'
import { QUESTIONS_PER_PAIR } from '../scheduler'
import type { AnswerInput } from '../schemas'
import type { AnswerView, ChoiceView, EvaluateeProgress, HistoryGroup, HistoryResponse, InboxPrompt, InboxResponse } from '../view-types'
import { recordAudit } from './audit'
import { byName, isHrActor, loadPeople, personRef, type WeeklyActor } from './context'
import { cycleSummary, findRunningCycle, loadCycle, type CycleWithPeriod } from './cycles'
import { WeeklyError } from './errors'
import { queueScoring } from './scoring'

export interface InboxSubject { evaluatorId: string; actingAs: boolean }

const ANSWERED = 'This question was already answered'
const LOCKED = 'This quarter is locked, so answers can no longer change'
const WEEK_LOCKED = 'This week is locked. Only HR can change this answer now.'
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
  return { optionId: response.optionId, note: response.note, commentText: response.commentText }
}

/** The statements in the evaluator's order, without scores. */
const choicesOf = (prompt: WeeklyPrompt): ChoiceView[] => parseOptions(prompt.options).map((o) => ({ id: o.id, text: o.text }))

function topicOf(prompt: PromptRow): string {
  return prompt.kind === 'COMMENT' ? 'Comment (optional)' : prompt.slot?.competency.name ?? 'Question'
}

/** The round employees see: the running one, else the last one closed (its history stays readable until the next opens). */
async function employeeRound(): Promise<CycleWithPeriod | null> {
  const running = await findRunningCycle()
  if (running) return running
  const closed = await prisma.weeklyCycle.findFirst({ where: { status: 'CLOSED' }, orderBy: { closedAt: 'desc' }, select: { id: true } })
  return closed ? loadCycle(closed.id) : null
}

async function periodLocked(periodId: string): Promise<boolean> {
  return (await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { isLocked: true } }))?.isLocked ?? false
}

/** Per person: of the quarter's five questions, how many are answered or not observed, and how many with a choice. */
async function progressFor(cycleId: string, evaluatorId: string): Promise<EvaluateeProgress[]> {
  const [slots, prompts] = await Promise.all([
    prisma.weeklySlot.findMany({ where: { cycleId, evaluatorId, status: { not: 'CANCELLED' } }, select: { evaluateeId: true, relationshipType: true } }),
    prisma.weeklyPrompt.findMany({
      where: { cycleId, evaluatorId, kind: 'STANDARD', status: { in: ['SUBMITTED', 'NOT_OBSERVED'] } },
      select: { evaluateeId: true, relationshipType: true, status: true },
    }),
  ])
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
      satisfied: current.satisfied + (prompt.status === 'SUBMITTED' ? 1 : 0),
    })
  }
  return [...groups.values()].sort((a, b) => byName(a.evaluatee, b.evaluatee))
}

export async function inboxView(evaluatorId: string, now: Date): Promise<InboxResponse> {
  const cycle = await employeeRound()
  if (!cycle) return { cycle: null, prompts: [], progress: [] }
  const summary = cycleSummary(cycle, now)
  // A closed round has nothing to answer; the page says so and the history stays readable.
  if (cycle.status === 'CLOSED') return { cycle: summary, prompts: [], progress: await progressFor(cycle.id, evaluatorId) }
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
      perspective: perspectiveOf(p.relationshipType) ?? 'PEER', evaluatee: personRef(people, p.evaluateeId), options: choicesOf(p), answer: answerView(p.response),
      submittedAt: submittedAt?.toISOString() ?? null,
      canEdit: p.status === 'SUBMITTED' ? canEditSubmitted({ submittedAt, periodLocked: locked, weekOneStartsOn: cycle.weekOneStartsOn, now }) : !locked,
      overdue: p.weekIndex < summary.currentWeek,
    }
  })
  const submission = await prisma.weeklyWeekSubmission.findUnique({ where: { cycleId_evaluatorId_weekIndex: { cycleId: cycle.id, evaluatorId, weekIndex: summary.currentWeek } } })
  return { cycle: summary, prompts: view, progress, weekSubmittedAt: submission?.submittedAt.toISOString() ?? null }
}

/**
 * "Submit this week" (UX spec, section 5): once every question asked so far has an answer (or is marked not observed).
 * Answers already count as they are saved; this marks the week done. Submitting again keeps the first time.
 */
export async function submitWeek(subject: InboxSubject, now: Date): Promise<{ submittedAt: string }> {
  const cycle = await findRunningCycle()
  if (!cycle) throw new WeeklyError('Weekly evaluations are not running right now', 409)
  if (await periodLocked(cycle.periodId)) throw new WeeklyError(LOCKED, 409)
  const week = cycleSummary(cycle, now).currentWeek
  const unanswered = await prisma.weeklyPrompt.count({ where: { cycleId: cycle.id, evaluatorId: subject.evaluatorId, kind: 'STANDARD', weekIndex: { lte: week }, status: { in: ['OPEN', 'DRAFT'] } } })
  if (unanswered > 0) throw new WeeklyError(`Answer every question first: ${unanswered} still ${unanswered === 1 ? 'needs' : 'need'} an answer`, 409)
  const key = { cycleId: cycle.id, evaluatorId: subject.evaluatorId, weekIndex: week }
  const row = await prisma.weeklyWeekSubmission.upsert({ where: { cycleId_evaluatorId_weekIndex: key }, create: { ...key, submittedAt: now }, update: {} })
  return { submittedAt: row.submittedAt.toISOString() }
}

async function ownPrompt(evaluatorId: string, promptId: string) {
  const prompt = await prisma.weeklyPrompt.findUnique({ where: { id: promptId }, include: { response: true, cycle: { select: { status: true, periodId: true, weekOneStartsOn: true } } } })
  if (!prompt || prompt.evaluatorId !== evaluatorId) throw new WeeklyError('Question not found', 404)
  if (prompt.cycle.status !== 'RUNNING') throw new WeeklyError('This quarter’s weekly evaluations are closed', 409)
  if (await periodLocked(prompt.cycle.periodId)) throw new WeeklyError(LOCKED, 409)
  return prompt
}

/** Keeps a note or comment typed before the answer is complete. Does not score anything. */
export async function saveDraft(actor: WeeklyActor, subject: InboxSubject, promptId: string, input: AnswerInput, now: Date): Promise<{ savedAt: string }> {
  void actor
  const prompt = await ownPrompt(subject.evaluatorId, promptId)
  if (prompt.status !== 'OPEN' && prompt.status !== 'DRAFT') throw new WeeklyError(ANSWERED, 409)
  const optionId = prompt.kind === 'STANDARD' && input.optionId && parseOptions(prompt.options).some((o) => o.id === input.optionId) ? input.optionId : null
  const data = { optionId, note: input.note?.trim() || null, commentText: input.commentText ?? null }
  await prisma.$transaction(async (tx) => {
    // The guarded status change locks the row, so a concurrent submit cannot be overwritten.
    const moved = await tx.weeklyPrompt.updateMany({ where: { id: promptId, status: { in: ['OPEN', 'DRAFT'] } }, data: { status: 'DRAFT' } })
    if (moved.count === 0) throw new WeeklyError(ANSWERED, 409)
    await tx.weeklyResponse.upsert({ where: { promptId }, create: { promptId, ...data }, update: data })
  })
  return { savedAt: now.toISOString() }
}

export async function submitAnswer(actor: WeeklyActor, subject: InboxSubject, promptId: string, input: AnswerInput, now: Date): Promise<{ status: 'SUBMITTED'; revision: number }> {
  const prompt = await ownPrompt(subject.evaluatorId, promptId)
  if (prompt.status !== 'OPEN' && prompt.status !== 'DRAFT' && prompt.status !== 'SUBMITTED') throw new WeeklyError('This question can no longer be answered', 409)
  const comment = prompt.kind === 'COMMENT'
  const data = comment ? commentData(input) : choiceData(prompt.options, input)
  if (!comment) {
    const problem = choiceProblem({ score: data.level ?? 0, note: data.note })
    if (problem) throw new WeeklyError(problem)
  }
  if (prompt.status === 'SUBMITTED' && !canEditSubmitted({ submittedAt: prompt.response?.submittedAt ?? null, periodLocked: false, weekOneStartsOn: prompt.cycle.weekOneStartsOn, now })) {
    throw new WeeklyError(WEEK_LOCKED, 409)
  }
  // Saving the same choice, note or comment again changes nothing, so HR's decision stands.
  const current = prompt.response
  if (prompt.status === 'SUBMITTED' && current && current.optionId === data.optionId && (current.note ?? null) === data.note && (current.commentText ?? null) === data.commentText) {
    return { status: 'SUBMITTED' as const, revision: current.revision }
  }
  return prisma.$transaction(async (tx) => {
    const revision = (prompt.response?.revision ?? 0) + 1
    if (prompt.status === 'SUBMITTED') {
      // Guarded on the revision, so two edits at once cannot both win.
      const updated = await tx.weeklyResponse.updateMany({ where: { promptId, revision: prompt.response?.revision ?? 0 }, data: { ...data, revision } })
      if (updated.count === 0) throw new WeeklyError('This answer changed since you opened it; reload and try again', 409)
    } else {
      const moved = await tx.weeklyPrompt.updateMany({ where: { id: promptId, status: { in: ['OPEN', 'DRAFT'] } }, data: { status: 'SUBMITTED' } })
      if (moved.count === 0) throw new WeeklyError(ANSWERED, 409)
      await tx.weeklyResponse.upsert({ where: { promptId }, create: { promptId, ...data, revision, submittedAt: now }, update: { ...data, revision, submittedAt: now } })
    }
    if (!comment) {
      // The model scores this revision; HR then reviews it.
      const response = await tx.weeklyResponse.findUniqueOrThrow({ where: { promptId }, select: { id: true } })
      await queueScoring(tx, response.id, revision)
      if (prompt.slotId) await tx.weeklySlot.update({ where: { id: prompt.slotId }, data: { status: 'SATISFIED' } })
    }
    if (subject.actingAs) {
      await recordAudit(tx, { cycleId: prompt.cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_ACT_AS_SUBMIT', objectType: 'WeeklyPrompt', objectId: promptId, after: { evaluatorId: subject.evaluatorId } })
    }
    return { status: 'SUBMITTED' as const, revision }
  })
}

function commentData(input: AnswerInput) {
  const problem = commentProblem(input.commentText)
  if (problem) throw new WeeklyError(problem)
  return { optionId: null, level: null, note: null, commentText: (input.commentText ?? '').trim() }
}

function choiceData(options: Prisma.JsonValue, input: AnswerInput) {
  const chosen = parseOptions(options).find((o) => o.id === input.optionId)
  if (!chosen) throw new WeeklyError('Choose one of the statements')
  return { optionId: chosen.id, level: chosen.score, note: input.note?.trim() || null, commentText: null }
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
        // A topic already answered stays answered.
        data: { status: slot.status === 'SATISFIED' ? 'SATISFIED' : outcome.status, snoozedUntilWeek: outcome.snoozedUntilWeek, notObservedCount: outcome.notObservedCount },
      })
    }
    if (subject.actingAs) {
      await recordAudit(tx, { cycleId: prompt.cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_ACT_AS_NOT_OBSERVED', objectType: 'WeeklyPrompt', objectId: promptId })
    }
  })
}

export async function historyView(evaluatorId: string, now: Date = new Date()): Promise<HistoryResponse> {
  const cycle = await employeeRound()
  if (!cycle) return { cycle: null, groups: [] }
  const closed = cycle.status === 'CLOSED'
  const prompts: PromptRow[] = await prisma.weeklyPrompt.findMany({ where: { cycleId: cycle.id, evaluatorId }, include: promptInclude, orderBy: [{ weekIndex: 'desc' }, { createdAt: 'desc' }] })
  const [people, locked] = await Promise.all([loadPeople(prompts.map((p) => p.evaluateeId)), periodLocked(cycle.periodId)])
  const groups = new Map<string, HistoryGroup>()
  for (const p of prompts) {
    const key = `${p.evaluateeId}|${p.relationshipType}`
    const group = groups.get(key) ?? { evaluatee: personRef(people, p.evaluateeId), perspective: perspectiveOf(p.relationshipType) ?? 'PEER', entries: [] }
    groups.set(key, {
      ...group,
      entries: [
        ...group.entries,
        {
          id: p.id, weekIndex: p.weekIndex, kind: p.kind, topic: topicOf(p), text: p.textSnapshot, status: evaluatorStatus(p.status),
          options: choicesOf(p), answer: answerView(p.response), submittedAt: p.response?.submittedAt?.toISOString() ?? null,
          canEdit: !closed && p.status === 'SUBMITTED' && canEditSubmitted({ submittedAt: p.response?.submittedAt ?? null, periodLocked: locked, weekOneStartsOn: cycle.weekOneStartsOn, now }),
        },
      ],
    })
  }
  return { cycle: cycleSummary(cycle, now), groups: [...groups.values()].sort((a, b) => byName(a.evaluatee, b.evaluatee)) }
}
