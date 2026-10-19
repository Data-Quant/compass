// Submitted multiple-choice answers with where each stands: being scored by the model, failed, waiting for HR, or
// decided. Only HR's decision on an answer's current revision counts; an edit sends it back through scoring and review.
import type { RelationshipType, WeeklyAiScore, WeeklyPromptKind, WeeklyScoreReview } from '@prisma/client'
import { prisma } from '@/lib/db'
import { perspectiveOf, type Perspective } from '../perspectives'
import { answerState, type AnswerState } from '../review-rules'
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
  /** The chosen statement's level: the model's starting point, not the score. */
  level: number
  job: { status: string; error: string | null } | null
  aiScore: WeeklyAiScore | null
  review: WeeklyScoreReview | null
  state: AnswerState
  /** HR's confirmed score; null until HR decides. */
  score: number | null
}

const latestFirst = <T extends { createdAt: Date }>(rows: readonly T[]) => [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

/** The first row for each answer revision (rows come latest first where that matters). */
function byRevision<T extends { responseId: string; revision: number }>(rows: readonly T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) {
    const key = `${row.responseId}:${row.revision}`
    if (!map.has(key)) map.set(key, row)
  }
  return map
}

/** Every submitted multiple-choice answer. Sequential queries on purpose: `db` may be an interactive transaction. */
export async function loadAnswerRecords(filter: { cycleId?: string; evaluateeId?: string; evaluatorId?: string; responseIds?: readonly string[] }, db: Db = prisma): Promise<AnswerRecord[]> {
  const prompts = await db.weeklyPrompt.findMany({
    where: {
      ...(filter.cycleId ? { cycleId: filter.cycleId } : {}),
      ...(filter.evaluateeId ? { evaluateeId: filter.evaluateeId } : {}),
      ...(filter.evaluatorId ? { evaluatorId: filter.evaluatorId } : {}),
      status: 'SUBMITTED',
      kind: 'STANDARD',
      response: { is: { level: { not: null }, ...(filter.responseIds ? { id: { in: [...filter.responseIds] } } : {}) } },
    },
    select: {
      id: true, cycleId: true, slotId: true, evaluatorId: true, evaluateeId: true, relationshipType: true, kind: true, weekIndex: true,
      response: { select: { id: true, submittedAt: true, level: true, revision: true } },
      slot: { select: { competencyId: true, competency: { select: { name: true, perspective: true } } } },
    },
    orderBy: [{ weekIndex: 'asc' }, { createdAt: 'asc' }],
  })
  const ids = prompts.flatMap((p) => (p.response ? [p.response.id] : []))
  if (ids.length === 0) return []
  const jobs = byRevision(await db.weeklyScoringJob.findMany({ where: { responseId: { in: ids } } }))
  const scores = byRevision(latestFirst(await db.weeklyAiScore.findMany({ where: { responseId: { in: ids } } })))
  const reviews = byRevision(latestFirst(await db.weeklyScoreReview.findMany({ where: { responseId: { in: ids } } })))
  return prompts.flatMap((p): AnswerRecord[] => {
    const r = p.response
    if (!r || r.level === null) return []
    const key = `${r.id}:${r.revision}`
    const job = jobs.get(key) ?? null
    const aiScore = scores.get(key) ?? null
    const review = reviews.get(key) ?? null
    return [{
      responseId: r.id, promptId: p.id, cycleId: p.cycleId, slotId: p.slotId, competencyId: p.slot?.competencyId ?? null,
      topic: p.slot?.competency.name ?? 'Question', perspective: perspectiveOf(p.relationshipType) ?? p.slot?.competency.perspective ?? 'PEER',
      evaluatorId: p.evaluatorId, evaluateeId: p.evaluateeId, relationshipType: p.relationshipType, kind: p.kind, weekIndex: p.weekIndex,
      revision: r.revision, submittedAt: r.submittedAt, level: r.level,
      job: job && { status: job.status, error: job.error }, aiScore, review,
      state: answerState({ jobStatus: job?.status ?? null, hasAiScore: aiScore !== null, hasReview: review !== null }),
      score: review?.finalScore ?? null,
    }]
  })
}
