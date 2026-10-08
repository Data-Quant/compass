// An evaluator's weekly questions (UX spec, section 8). Each question offers 8 statements in a shuffled order fixed at
// release; choosing one saves the answer with that statement's score. A note is required for 1, 1.5 and 4, and the
// 10% cap on 4s applies per relationship. Answers can change until HR locks the quarter.
import type { Prisma, WeeklyPrompt, WeeklyResponse } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isFourRatingCapExempt } from '@/lib/evaluation-rating-quota'
import { afterNotObserved, canEditSubmitted, choiceProblem, commentProblem, evaluatorStatus, RECENTLY_SUBMITTED_MS } from '../answer-rules'
import { cycleWeeks, effectiveWeek } from '../calendar'
import { areWeeklyTestToolsEnabled } from '../flag'
import { fourRatingLimit, parseOptions } from '../mcq'
import { perspectiveOf, type Perspective } from '../perspectives'
import { QUESTIONS_PER_PAIR } from '../scheduler'
import type { AnswerInput } from '../schemas'
import type { AnswerView, ChoiceView, EvaluateeProgress, HistoryGroup, HistoryResponse, InboxPrompt, InboxResponse } from '../view-types'
import { recordAudit } from './audit'
import { byName, isHrActor, loadPeople, personRef, type WeeklyActor } from './context'
import { cycleSummary, findRunningCycle, loadCycle } from './cycles'
import { WeeklyError } from './errors'

export interface InboxSubject { evaluatorId: string; actingAs: boolean }

const ANSWERED = 'This question was already answered'
const LOCKED = 'This quarter is locked, so answers can no longer change'
const TOP_SCORE = 4
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
      perspective: perspectiveOf(p.relationshipType) ?? 'PEER', evaluatee: personRef(people, p.evaluateeId), options: choicesOf(p), answer: answerView(p.response),
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

const CAP_NOUN: Record<Perspective, string> = { LEAD: 'your team members', UPWARD: 'your lead', PEER: 'peers' }

/** D-Q4: at most 10% of an evaluator's questions in one relationship may be 4s this quarter. */
async function assertFourAllowed(tx: Prisma.TransactionClient, prompt: { id: string; cycleId: string; evaluatorId: string; relationshipType: string }): Promise<void> {
  const perspective = perspectiveOf(prompt.relationshipType as Parameters<typeof perspectiveOf>[0]) ?? 'PEER'
  const evaluator = await tx.user.findUnique({ where: { id: prompt.evaluatorId }, select: { name: true, position: true } })
  if (evaluator && isFourRatingCapExempt(evaluator)) return
  // Serialises this evaluator's 4s, so two at once cannot both slip under the cap.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-fours:${prompt.cycleId}:${prompt.evaluatorId}`}))::text`
  const types = perspective === 'PEER' ? ['PEER', 'CROSS_DEPARTMENT'] : [prompt.relationshipType]
  const sameRelation = { cycleId: prompt.cycleId, evaluatorId: prompt.evaluatorId, relationshipType: { in: types as Prisma.EnumRelationshipTypeFilter['in'] } }
  const pairs = await tx.weeklySlot.findMany({ where: { ...sameRelation, status: { not: 'CANCELLED' } }, distinct: ['evaluateeId'], select: { evaluateeId: true } })
  const limit = fourRatingLimit(pairs.length * QUESTIONS_PER_PAIR)
  // Counted over the same pairs as the limit: a 4 about someone no longer evaluated does not use it up.
  const used = await tx.weeklyResponse.count({ where: { score: TOP_SCORE, prompt: { ...sameRelation, kind: 'STANDARD', status: 'SUBMITTED', id: { not: prompt.id }, slot: { status: { not: 'CANCELLED' } } } } })
  if (used >= limit) {
    throw new WeeklyError(`You've used your ${limit} top rating${limit === 1 ? '' : 's'} for ${CAP_NOUN[perspective]} this quarter. To choose this, change an earlier one.`, 409)
  }
}

export async function submitAnswer(actor: WeeklyActor, subject: InboxSubject, promptId: string, input: AnswerInput, now: Date): Promise<{ status: 'SUBMITTED'; revision: number }> {
  const prompt = await ownPrompt(subject.evaluatorId, promptId)
  if (prompt.status !== 'OPEN' && prompt.status !== 'DRAFT' && prompt.status !== 'SUBMITTED') throw new WeeklyError('This question can no longer be answered', 409)
  const comment = prompt.kind === 'COMMENT'
  const data = comment ? commentData(input) : choiceData(prompt.options, input)
  // An answer that already is a 4 can always be saved again (say, to fix its note).
  const alreadyFour = prompt.status === 'SUBMITTED' && prompt.response?.score === TOP_SCORE
  return prisma.$transaction(async (tx) => {
    // The cap before the note, so nobody writes a note for a 4 they cannot give.
    if (!comment && data.score === TOP_SCORE && !alreadyFour) await assertFourAllowed(tx, prompt)
    if (!comment) {
      const problem = choiceProblem({ score: data.score ?? 0, note: data.note })
      if (problem) throw new WeeklyError(problem)
    }
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
    if (!comment && prompt.slotId) await tx.weeklySlot.update({ where: { id: prompt.slotId }, data: { status: 'SATISFIED' } })
    if (subject.actingAs) {
      await recordAudit(tx, { cycleId: prompt.cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_ACT_AS_SUBMIT', objectType: 'WeeklyPrompt', objectId: promptId, after: { evaluatorId: subject.evaluatorId } })
    }
    return { status: 'SUBMITTED' as const, revision }
  })
}

function commentData(input: AnswerInput) {
  const problem = commentProblem(input.commentText)
  if (problem) throw new WeeklyError(problem)
  return { optionId: null, score: null, note: null, commentText: (input.commentText ?? '').trim() }
}

function choiceData(options: Prisma.JsonValue, input: AnswerInput) {
  const chosen = parseOptions(options).find((o) => o.id === input.optionId)
  if (!chosen) throw new WeeklyError('Choose one of the statements')
  return { optionId: chosen.id, score: chosen.score, note: input.note?.trim() || null, commentText: null }
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

export async function historyView(evaluatorId: string): Promise<HistoryResponse> {
  const cycle = await findRunningCycle()
  if (!cycle) return { cycle: null, groups: [] }
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
          canEdit: p.status === 'SUBMITTED' && canEditSubmitted({ submittedAt: p.response?.submittedAt ?? null, periodLocked: locked }),
        },
      ],
    })
  }
  return { cycle: cycleSummary(cycle, new Date()), groups: [...groups.values()].sort((a, b) => byName(a.evaluatee, b.evaluatee)) }
}
