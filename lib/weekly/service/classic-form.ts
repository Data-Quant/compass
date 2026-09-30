// Spec 13.3 step 8: HR can reopen the classic questionnaire for a running weekly quarter; the weekly module keeps running.
import { prisma } from '@/lib/db'
import { pairKey } from '../aggregation'
import { recordAudit } from './audit'
import { assertHr, type WeeklyActor } from './context'
import { loadCycle } from './cycles'
import type { Db } from './db'
import { WeeklyError } from './errors'

/** The question banks weekly evidence is written into. */
const WEEKLY_BANKS = ['DIRECT_REPORT', 'TEAM_LEAD', 'PEER'] as const

/** Pairs (evaluator, person) with a submitted classic answer in the weekly banks: they keep those rows at close. */
export async function classicPairKeys(db: Db, periodId: string): Promise<Set<string>> {
  const rows = await db.evaluation.findMany({
    where: {
      periodId, source: 'MANUAL', submittedAt: { not: null },
      OR: [{ question: { relationshipType: { in: [...WEEKLY_BANKS] } } }, { leadQuestionId: { not: null } }],
    },
    select: { evaluatorId: true, evaluateeId: true },
    distinct: ['evaluatorId', 'evaluateeId'],
  })
  return new Set(rows.map(pairKey))
}

export async function setClassicForm(actor: WeeklyActor, cycleId: string, open: boolean, now: Date): Promise<{ open: boolean }> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'RUNNING') throw new WeeklyError('The classic questionnaire can only be reopened or closed while the quarter runs', 409)
  if (cycle.classicFormOpen === open) return { open }
  await prisma.$transaction(async (tx) => {
    // Guarded on the current value: of two HR users clicking at once, one makes the change and is audited.
    const moved = await tx.weeklyCycle.updateMany({
      where: { id: cycleId, status: 'RUNNING', classicFormOpen: !open },
      data: { classicFormOpen: open, classicFormOpenedAt: open ? now : null },
    })
    if (moved.count === 0) return
    await recordAudit(tx, {
      cycleId, actorId: actor.id, actorRole: 'HR', action: open ? 'CLASSIC_FORM_OPEN' : 'CLASSIC_FORM_CLOSE',
      objectType: 'WeeklyCycle', objectId: cycleId, after: { at: now.toISOString() },
    })
  })
  return { open }
}
