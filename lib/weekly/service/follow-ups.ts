import type { Prisma } from '@prisma/client'
import { effectiveWeek, totalWeeks } from '../calendar'
import { MAX_FOLLOW_UPS } from '../review-rules'
import { loadCycle } from './cycles'

export type FollowUpOutcome = 'CREATED' | 'SLOT_CLOSED' | 'NOT_NEEDED'

/**
 * Spec 5.3: a thin answer gets a follow-up question on the same slot, at most two per slot; after that the
 * slot closes as "insufficient" with no score. Satisfied, closed or cancelled slots get nothing.
 */
export async function requestFollowUp(tx: Prisma.TransactionClient, input: { promptId: string; text: string; now: Date }): Promise<FollowUpOutcome> {
  const prompt = await tx.weeklyPrompt.findUnique({ where: { id: input.promptId }, include: { slot: true } })
  const slot = prompt?.slot
  if (!prompt || !slot || slot.status !== 'OPEN') return 'NOT_NEEDED'
  if (slot.followUpCount >= MAX_FOLLOW_UPS) {
    await tx.weeklySlot.update({ where: { id: slot.id }, data: { status: 'CLOSED_INSUFFICIENT' } })
    return 'SLOT_CLOSED'
  }
  if ((await tx.weeklyPrompt.count({ where: { slotId: slot.id, status: { in: ['OPEN', 'DRAFT'] } } })) > 0) return 'NOT_NEEDED'
  const cycle = await loadCycle(prompt.cycleId, tx)
  const total = totalWeeks(cycle.weekOneStartsOn, cycle.period.endDate)
  const week = Math.min(total, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, input.now)))
  await tx.weeklyPrompt.create({
    data: {
      cycleId: prompt.cycleId, slotId: slot.id, evaluatorId: prompt.evaluatorId, evaluateeId: prompt.evaluateeId,
      relationshipType: prompt.relationshipType, weekIndex: week, kind: 'FOLLOW_UP', textSnapshot: input.text, releasedAt: input.now,
    },
  })
  await tx.weeklySlot.update({ where: { id: slot.id }, data: { followUpCount: { increment: 1 }, lastAskedWeek: week } })
  return 'CREATED'
}
