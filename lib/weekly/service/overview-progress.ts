// HR's Performance Overview during a weekly quarter. Per person:
// - being evaluated: topics about them with accepted evidence, out of all their topics;
// - evaluating others: topics they have answered, out of all the topics they are asked about.
import { prisma } from '@/lib/db'

export interface PersonWeeklyProgress {
  /** Distinct evaluators asked about this person. */
  evaluators: number
  coveredTopics: number
  topics: number
  /** Distinct people this person evaluates. */
  evaluatees: number
  answeredTopics: number
  topicsToAnswer: number
}

const empty = (): PersonWeeklyProgress => ({ evaluators: 0, coveredTopics: 0, topics: 0, evaluatees: 0, answeredTopics: 0, topicsToAnswer: 0 })

/** Null when the period has no weekly cycle. */
export async function weeklyOverviewProgress(periodId: string): Promise<Map<string, PersonWeeklyProgress> | null> {
  const cycle = await prisma.weeklyCycle.findUnique({ where: { periodId }, select: { id: true } })
  if (!cycle) return null
  const [slots, submitted] = await Promise.all([
    prisma.weeklySlot.findMany({ where: { cycleId: cycle.id, status: { not: 'CANCELLED' } }, select: { id: true, evaluatorId: true, evaluateeId: true, status: true } }),
    prisma.weeklyPrompt.findMany({ where: { cycleId: cycle.id, status: 'SUBMITTED', slotId: { not: null } }, select: { slotId: true } }),
  ])
  const answeredSlots = new Set(submitted.map((p) => p.slotId))
  const progress = new Map<string, PersonWeeklyProgress>()
  const evaluatorsOf = new Map<string, Set<string>>()
  const evaluateesOf = new Map<string, Set<string>>()
  const at = (id: string) => progress.get(id) ?? empty()
  for (const slot of slots) {
    const covered = slot.status === 'SATISFIED'
    const evaluatee = at(slot.evaluateeId)
    progress.set(slot.evaluateeId, { ...evaluatee, topics: evaluatee.topics + 1, coveredTopics: evaluatee.coveredTopics + (covered ? 1 : 0) })
    const evaluator = at(slot.evaluatorId)
    const answered = covered || answeredSlots.has(slot.id)
    progress.set(slot.evaluatorId, { ...evaluator, topicsToAnswer: evaluator.topicsToAnswer + 1, answeredTopics: evaluator.answeredTopics + (answered ? 1 : 0) })
    evaluatorsOf.set(slot.evaluateeId, new Set([...(evaluatorsOf.get(slot.evaluateeId) ?? []), slot.evaluatorId]))
    evaluateesOf.set(slot.evaluatorId, new Set([...(evaluateesOf.get(slot.evaluatorId) ?? []), slot.evaluateeId]))
  }
  return new Map([...progress].map(([id, p]) => [id, { ...p, evaluators: evaluatorsOf.get(id)?.size ?? 0, evaluatees: evaluateesOf.get(id)?.size ?? 0 }]))
}


