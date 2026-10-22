// Quarters run on the earlier evaluations (no weekly round), finished from the Evaluation round page: HR fills in what
// is left in the quarter-end tables (partners' evaluations, its own HR forms), then closes the quarter (locks it) and
// releases its reports. Nobody else is emailed and nothing about the weekly rounds changes.
import { prisma } from '@/lib/db'
import type { EarlierQuarterView, RoundSummary } from '../view-types'
import { assertHr, type WeeklyActor } from './context'
import { WeeklyError } from './errors'
import { formsProgress } from './form-tables'
import { lateFormsProgress } from './late-forms'

/** Every quarter without a weekly round, newest first: open until HR closes it, then closed. */
export async function earlierQuarters(): Promise<RoundSummary[]> {
  const withRounds = (await prisma.weeklyCycle.findMany({ select: { periodId: true } })).map((c) => c.periodId)
  const periods = await prisma.evaluationPeriod.findMany({
    where: { id: { notIn: withRounds } },
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true, isLocked: true },
  })
  return periods.map((p) => ({ periodId: p.id, cycleId: '', name: p.name, stage: p.isLocked ? 'CLOSED' : 'OPEN', earlier: true }))
}

/** Whether a quarter has no weekly round (so it was run on the earlier evaluations). */
export async function isEarlierQuarter(periodId: string): Promise<boolean> {
  return (await prisma.weeklyCycle.count({ where: { periodId } })) === 0
}

export async function earlierQuarterView(actor: WeeklyActor, periodId: string, now: Date = new Date()): Promise<EarlierQuarterView> {
  assertHr(actor)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { id: true, name: true, startDate: true, endDate: true, isLocked: true } })
  if (!period) throw new WeeklyError('Quarter not found', 404)
  if (!(await isEarlierQuarter(periodId))) throw new WeeklyError('This quarter has a weekly round', 409)
  const [{ total, done }, lateForms] = await Promise.all([formsProgress(periodId, now), lateFormsProgress(periodId, now)])
  return {
    kind: 'earlier', periodId, name: period.name, startDate: period.startDate.toISOString(), endDate: period.endDate.toISOString(),
    locked: period.isLocked, forms: { total, done }, lateForms,
  }
}
