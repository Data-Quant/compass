// Spec 9.4 option C: HR asks everyone in a low-evidence group again, now, outside the weekly schedule.
import { prisma } from '@/lib/db'
import { cycleWeeks, effectiveWeek } from '../calendar'
import { renderMoreEvidenceEmail } from '../emails'
import type { Perspective } from '../perspectives'
import { nextVariant } from '../scheduler'
import { awaitingDecisionSlotIds } from './answer-states'
import { recordAudit } from './audit'
import { assertHr, type WeeklyActor } from './context'
import { loadCycle } from './cycles'
import { WeeklyError } from './errors'
import { deliverOnce, weeklyDedupeKey, type WeeklySendMail, type WeeklySendResult } from './notifications'
import { syncSlots } from './release'

export interface MoreEvidenceResult { reopened: number; prompts: number; evaluators: number; emails: WeeklySendResult | null }

const NOT_RUNNING = 'Only a running quarter can ask for more evidence'
const pairKey = (s: { evaluatorId: string; evaluateeId: string; relationshipType: string }) => `${s.evaluatorId}|${s.evaluateeId}|${s.relationshipType}`

export async function requestMoreEvidence(
  actor: WeeklyActor,
  cycleId: string,
  input: { evaluateeId: string; perspective: Perspective; /** Narrows the group to one evaluator (the preview's "Ask this pair now"). */ evaluatorId?: string },
  now: Date,
  send: WeeklySendMail,
  appUrl: string,
): Promise<MoreEvidenceResult> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'RUNNING') throw new WeeklyError(NOT_RUNNING, 409)
  // Today's assignments first, so leavers and removed pairs are not asked.
  const live = new Set((await syncSlots(cycle, now)).pairs.map(pairKey))
  const week = Math.min(cycleWeeks(cycle), Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now)))
  const done = await prisma.$transaction(async (tx) => {
    // Serialises with a second "Ask again" and with the close, which locks the same row.
    const [row] = await tx.$queryRaw<Array<{ status: string }>>`SELECT status::text AS status FROM "WeeklyCycle" WHERE id = ${cycleId} FOR UPDATE`
    if (row?.status !== 'RUNNING') throw new WeeklyError(NOT_RUNNING, 409)
    const slots = (await tx.weeklySlot.findMany({
      where: {
        cycleId, evaluateeId: input.evaluateeId, ...(input.evaluatorId ? { evaluatorId: input.evaluatorId } : {}),
        competency: { perspective: input.perspective }, status: { notIn: ['CANCELLED', 'SATISFIED'] },
      },
      include: { competency: { include: { prompts: { where: { isActive: true }, orderBy: { variant: 'asc' } } } } },
      orderBy: { id: 'asc' },
    })).filter((slot) => live.has(pairKey(slot)))
    const asked = slots.length === 0 ? [] : await tx.weeklyPrompt.findMany({ where: { slotId: { in: slots.map((s) => s.id) } }, select: { slotId: true, status: true, promptVariantId: true } })
    const hasOpenPrompt = new Set(asked.filter((p) => p.status === 'OPEN' || p.status === 'DRAFT').flatMap((p) => (p.slotId ? [p.slotId] : [])))
    const awaiting = await awaitingDecisionSlotIds(cycleId, tx)
    let reopened = 0
    const evaluatorIds: string[] = []
    for (const slot of slots) {
      if (slot.status !== 'OPEN') reopened += 1
      const variant = hasOpenPrompt.has(slot.id) || awaiting.has(slot.id)
        ? null
        : nextVariant(slot.competency.prompts, asked.flatMap((p) => (p.slotId === slot.id && p.promptVariantId ? [p.promptVariantId] : [])))
      await tx.weeklySlot.update({ where: { id: slot.id }, data: { status: 'OPEN', snoozedUntilWeek: null, ...(variant ? { lastAskedWeek: week } : {}) } })
      if (!variant) continue
      await tx.weeklyPrompt.create({
        data: {
          cycleId, slotId: slot.id, evaluatorId: slot.evaluatorId, evaluateeId: slot.evaluateeId, relationshipType: slot.relationshipType,
          weekIndex: week, kind: 'STANDARD', promptVariantId: variant.id, textSnapshot: variant.text, releasedAt: now,
        },
      })
      evaluatorIds.push(slot.evaluatorId)
    }
    await recordAudit(tx, {
      cycleId, actorId: actor.id, actorRole: 'HR', action: 'MORE_EVIDENCE', objectType: 'User', objectId: input.evaluateeId,
      after: { perspective: input.perspective, reopened, prompts: evaluatorIds.length, week },
    })
    return { reopened, evaluatorIds }
  }, { timeout: 30_000 })
  const perEvaluator = new Map<string, number>()
  for (const id of done.evaluatorIds) perEvaluator.set(id, (perEvaluator.get(id) ?? 0) + 1)
  // One email per evaluator per Karachi day, however many groups HR asks about.
  const emails = perEvaluator.size === 0 ? null : await deliverOnce([...perEvaluator].map(([userId, count]) => ({
    userId, kind: 'weekly-more-evidence' as const, dedupeKey: weeklyDedupeKey('weekly-more-evidence', userId, now),
    render: (name: string) => renderMoreEvidenceEmail({ name, count, appUrl }),
  })), send)
  return { reopened: done.reopened, prompts: done.evaluatorIds.length, evaluators: perEvaluator.size, emails }
}
