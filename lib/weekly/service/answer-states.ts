import type { Prisma, RelationshipType, WeeklyAiScore, WeeklyPromptKind, WeeklyScoreReview } from '@prisma/client'
import { prisma } from '@/lib/db'
import { perspectiveOf, type Perspective } from '../perspectives'
import { answerState, type AnswerState, type ReviewReason } from '../review-rules'
import { latestByResponse } from '../reviews'
import { trustedModelNames } from './calibration-gate'
import type { Db } from './db'

export interface AnswerRecord {
  responseId: string
  promptId: string
  cycleId: string
  slotId: string | null
  competencyId: string | null
  topic: string
  perspective: Perspective
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  kind: WeeklyPromptKind
  weekIndex: number
  revision: number
  submittedAt: Date | null
  job: { id: string; status: string; updatedAt: Date; error: string | null } | null
  /** The latest AI score for the current revision. */
  aiScore: WeeklyAiScore | null
  latestReview: WeeklyScoreReview | null
  humanReviewed: boolean
  /** Tokens across every AI score of this answer. */
  tokens: number
  state: AnswerState
  reasons: ReviewReason[]
}

export const AWAITING_DECISION: ReadonlySet<AnswerState> = new Set<AnswerState>(['SCORING', 'FAILED', 'NEEDS_REVIEW', 'AUTO_ACCEPT_PENDING'])

export function jsonStrings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** The audit action written when HR corrects an answer's text; it marks the answer as handled by a person. */
export const ANSWER_CORRECTED = 'ANSWER_CORRECTED'

/** Answers whose text HR has corrected: they go back to HR after re-scoring, and the evaluator can no longer edit them. */
export async function correctedResponseIds(responseIds: readonly string[], db: Db = prisma): Promise<Set<string>> {
  if (responseIds.length === 0) return new Set()
  const events = await db.weeklyAuditEvent.findMany({
    where: { action: ANSWER_CORRECTED, objectType: 'WeeklyResponse', objectId: { in: [...responseIds] } },
    select: { objectId: true },
  })
  return new Set(events.flatMap((e) => (e.objectId ? [e.objectId] : [])))
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row])
  return groups
}

/** Every submitted, scored-type answer (standard and follow-up) with its job, AI score, reviews and state. No answer text. */
export async function loadAnswerRecords(filter: { cycleId?: string; responseIds?: readonly string[] }, db: Db = prisma): Promise<AnswerRecord[]> {
  const prompts = await db.weeklyPrompt.findMany({
    where: {
      ...(filter.cycleId ? { cycleId: filter.cycleId } : {}),
      status: 'SUBMITTED',
      kind: { not: 'COMMENT' },
      response: filter.responseIds ? { is: { id: { in: [...filter.responseIds] } } } : { isNot: null },
    },
    select: {
      id: true, cycleId: true, slotId: true, evaluatorId: true, evaluateeId: true, relationshipType: true, kind: true, weekIndex: true,
      response: { select: { id: true, revision: true, submittedAt: true } },
      slot: { select: { competencyId: true, competency: { select: { name: true, perspective: true } } } },
    },
    orderBy: [{ weekIndex: 'asc' }, { createdAt: 'asc' }],
  })
  const ids = prompts.flatMap((p) => (p.response ? [p.response.id] : []))
  if (ids.length === 0) return []
  // Sequential on purpose: `db` may be an interactive transaction.
  const jobs = await db.weeklyScoringJob.findMany({ where: { responseId: { in: ids } }, orderBy: { createdAt: 'asc' } })
  const scores = await db.weeklyAiScore.findMany({ where: { responseId: { in: ids } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  const reviews = await db.weeklyScoreReview.findMany({ where: { responseId: { in: ids } } })
  const corrected = await correctedResponseIds(ids, db)
  // D10: worked out once per call; a score from an untrusted model is never auto-accepted.
  const trusted = await trustedModelNames(db)
  const jobByRevision = new Map(jobs.map((j) => [`${j.responseId}|${j.revision}`, j]))
  const scoresByResponse = groupBy(scores, (s) => s.responseId)
  const latest = latestByResponse(reviews)
  const human = new Set(reviews.filter((r) => r.reviewerId !== null).map((r) => r.responseId))
  return prompts.flatMap((p): AnswerRecord[] => {
    const response = p.response
    if (!response) return []
    const job = jobByRevision.get(`${response.id}|${response.revision}`) ?? null
    const all = scoresByResponse.get(response.id) ?? []
    const aiScore = all.filter((s) => s.revision === response.revision).slice(-1)[0] ?? null
    const latestReview = latest.get(response.id) ?? null
    const { state, reasons } = answerState({
      responseId: response.id,
      job: job && { status: job.status, updatedAt: job.updatedAt },
      aiScore: aiScore && { createdAt: aiScore.createdAt, sufficiency: aiScore.sufficiency, score: aiScore.score, confidence: aiScore.confidence, flags: jsonStrings(aiScore.flags) },
      latestReview,
      humanReviewedBefore: human.has(response.id) || corrected.has(response.id),
      modelTrusted: aiScore ? trusted.has(aiScore.model) : true,
    })
    return [{
      responseId: response.id, promptId: p.id, cycleId: p.cycleId, slotId: p.slotId, competencyId: p.slot?.competencyId ?? null,
      topic: p.slot?.competency.name ?? 'Question', perspective: perspectiveOf(p.relationshipType) ?? p.slot?.competency.perspective ?? 'PEER',
      evaluatorId: p.evaluatorId, evaluateeId: p.evaluateeId, relationshipType: p.relationshipType, kind: p.kind, weekIndex: p.weekIndex,
      revision: response.revision, submittedAt: response.submittedAt,
      job: job && { id: job.id, status: job.status, updatedAt: job.updatedAt, error: job.error },
      aiScore, latestReview, humanReviewed: human.has(response.id),
      tokens: all.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0),
      state, reasons,
    }]
  })
}

/** Slots whose answer is still being scored, failed, or waits for HR or the 72-hour accept: not asked again meanwhile. */
export async function awaitingDecisionSlotIds(cycleId: string, db: Db = prisma): Promise<Set<string>> {
  const records = await loadAnswerRecords({ cycleId }, db)
  return new Set(records.flatMap((r) => (r.slotId && AWAITING_DECISION.has(r.state) ? [r.slotId] : [])))
}
