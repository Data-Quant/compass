// HR's live view of one person during the quarter: every answer about them, the AI's proposal as it arrives, and a
// provisional 1–4 score from the answers accepted so far. The score always belongs to the person the answers are about.
// It averages accepted scores per relationship and weights them with the scorer's own weights (read-only); the real
// PE score is still calculated by the classic scorer at quarter close.
import { prisma } from '@/lib/db'
import { getDynamicWeights } from '@/lib/scoring'
import { normalizeRelationshipTypeForWeighting, RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'
import { PERSPECTIVE_LABELS } from '../perspectives'
import { ANSWER_STATE_LABELS } from '../review-rules'
import { isConfirmedAction } from '../reviews'
import type { PersonScoreView } from '../view-types'
import { loadAnswerRecords, type AnswerRecord } from './answer-states'
import { assertHr, type WeeklyActor } from './context'
import { loadCycle } from './cycles'

const round2 = (value: number) => Math.round(value * 100) / 100
const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/** The score HR (or the 72-hour rule) settled on; an AI proposal alone never counts. */
export function acceptedScore(record: Pick<AnswerRecord, 'state' | 'latestReview'>): number | null {
  const review = record.latestReview
  return record.state === 'DECIDED' && review && isConfirmedAction(review.action) && review.finalScore !== null ? review.finalScore : null
}

export function provisionalScore(
  records: ReadonlyArray<Pick<AnswerRecord, 'relationshipType' | 'state' | 'latestReview'>>,
  weights: Record<string, number>,
): PersonScoreView['provisional'] {
  const groups = new Map<RelationshipType, number[]>()
  for (const record of records) {
    const score = acceptedScore(record)
    if (score === null) continue
    const type = normalizeRelationshipTypeForWeighting(record.relationshipType)
    groups.set(type, [...(groups.get(type) ?? []), score])
  }
  const byRelationship = [...groups].map(([relationshipType, scores]) => ({
    relationshipType, label: RELATIONSHIP_TYPE_LABELS[relationshipType], count: scores.length,
    average: round2(mean(scores)), weight: weights[relationshipType] ?? 0,
  }))
  if (byRelationship.length === 0) return { score: null, byRelationship }
  const weighted = byRelationship.filter((r) => r.weight > 0)
  const total = weighted.reduce((sum, r) => sum + r.weight, 0)
  // Only the relationships with accepted evidence share the weight, as the scorer redistributes missing ones.
  const score = total > 0 ? weighted.reduce((sum, r) => sum + r.average * r.weight, 0) / total : mean([...groups.values()].flat())
  return { score: round2(score), byRelationship }
}

export async function personScoreView(actor: WeeklyActor, cycleId: string, evaluateeId: string): Promise<PersonScoreView> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const [records, evaluatees] = await Promise.all([
    loadAnswerRecords({ cycleId, evaluateeId }),
    prisma.weeklyPrompt.findMany({ where: { cycleId }, select: { evaluateeId: true }, distinct: ['evaluateeId'] }),
  ])
  const ids = new Set([...evaluatees.map((e) => e.evaluateeId), evaluateeId, ...records.map((r) => r.evaluatorId)])
  const users = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, position: true, department: true } })
  const byId = new Map(users.map((u) => [u.id, u]))
  const ref = (id: string) => ({ id, name: byId.get(id)?.name ?? 'Unknown person', position: byId.get(id)?.position ?? null })
  const person = byId.get(evaluateeId)
  const weights = person ? await getDynamicWeights(evaluateeId, cycle.periodId) : {}
  const answers = [...records]
    .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0))
    .map((record) => ({
      responseId: record.responseId,
      evaluator: ref(record.evaluatorId),
      perspective: PERSPECTIVE_LABELS[record.perspective],
      topic: record.topic,
      weekIndex: record.weekIndex,
      submittedAt: record.submittedAt?.toISOString() ?? null,
      state: record.state,
      stateLabel: ANSWER_STATE_LABELS[record.state],
      aiScore: record.aiScore?.score ?? null,
      aiSufficiency: record.aiScore?.sufficiency ?? null,
      aiConfidence: record.aiScore?.confidence ?? null,
      aiRationale: record.aiScore?.rationale ?? null,
      model: record.aiScore?.model ?? null,
      finalScore: acceptedScore(record),
    }))
  return {
    cycleId,
    person: { ...ref(evaluateeId), department: person?.department ?? null },
    provisional: provisionalScore(records, weights),
    answers,
    people: evaluatees.map((e) => ref(e.evaluateeId)).sort((a, b) => a.name.localeCompare(b.name)),
  }
}
