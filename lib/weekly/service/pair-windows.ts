// Pairs added after the quarter started: their five questions are spread over their own weeks. The window is made
// automatically from the week a pair first appears; HR can set the start week and the number of weeks.
import type { RelationshipType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { questionWeekCount, cycleWeeks } from '../calendar'
import type { PairWindowView } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, personRef, type WeeklyActor } from './context'
import { loadCycle, type CycleWithPeriod } from './cycles'
import { WeeklyError } from './errors'

export const pairWindowKey = (p: { evaluatorId: string; evaluateeId: string; relationshipType: string }) => `${p.evaluatorId}|${p.evaluateeId}|${p.relationshipType}`

/** The default window for a pair first seen in `week`: from then to the last question week. */
export function defaultWindow(cycle: Pick<CycleWithPeriod, 'questionWeeks'>, week: number): { startWeek: number; weeks: number } {
  const startWeek = Math.min(Math.max(1, week), cycle.questionWeeks)
  return { startWeek, weeks: cycle.questionWeeks - startWeek + 1 }
}

export async function pairWindows(cycleId: string): Promise<Map<string, { startWeek: number; weeks: number }>> {
  const rows = await prisma.weeklyPairWindow.findMany({ where: { cycleId }, select: { evaluatorId: true, evaluateeId: true, relationshipType: true, startWeek: true, weeks: true } })
  return new Map(rows.map((r) => [pairWindowKey(r), { startWeek: r.startWeek, weeks: r.weeks }]))
}

export async function pairWindowsView(actor: WeeklyActor, cycleId: string): Promise<PairWindowView[]> {
  assertHr(actor)
  await loadCycle(cycleId)
  const rows = await prisma.weeklyPairWindow.findMany({ where: { cycleId }, orderBy: { createdAt: 'asc' } })
  const people = await loadPeople(rows.flatMap((r) => [r.evaluatorId, r.evaluateeId]))
  return rows.map((r) => ({
    evaluator: personRef(people, r.evaluatorId), evaluatee: personRef(people, r.evaluateeId), relationshipType: r.relationshipType,
    startWeek: r.startWeek, weeks: r.weeks,
  }))
}

export interface PairWindowInput { evaluatorId: string; evaluateeId: string; relationshipType: RelationshipType; startWeek: number; weeks: number }

export async function setPairWindow(actor: WeeklyActor, cycleId: string, input: PairWindowInput): Promise<void> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status === 'CLOSED') throw new WeeklyError('This quarter is closed', 409)
  const questionWeeks = questionWeekCount(cycleWeeks(cycle))
  if (input.startWeek < 1 || input.startWeek > questionWeeks) throw new WeeklyError(`The start week must be between 1 and ${questionWeeks}`)
  const most = questionWeeks - input.startWeek + 1
  if (input.weeks < 1 || input.weeks > most) throw new WeeklyError(`Starting in week ${input.startWeek}, a pair can have at most ${most} weeks`)
  const key = { cycleId, evaluatorId: input.evaluatorId, evaluateeId: input.evaluateeId, relationshipType: input.relationshipType }
  const existing = await prisma.weeklyPairWindow.findUnique({ where: { cycleId_evaluatorId_evaluateeId_relationshipType: key } })
  if (!existing) throw new WeeklyError('Only a pair added during the quarter has its own weeks', 404)
  await prisma.$transaction(async (tx) => {
    await tx.weeklyPairWindow.update({ where: { id: existing.id }, data: { startWeek: input.startWeek, weeks: input.weeks, setById: actor.id } })
    await recordAudit(tx, {
      cycleId, actorId: actor.id, actorRole: 'HR', action: 'PAIR_WINDOW', objectType: 'User', objectId: input.evaluateeId,
      before: { startWeek: existing.startWeek, weeks: existing.weeks }, after: input,
    })
  })
}
