// The Evaluation round page (UX spec, section 4): one round = one evaluation period and its weekly cycle. HR moves it
// Draft → Review → Open → Closed → Released; this service derives the stage, says what is next, and makes the moves.
import { prisma } from '@/lib/db'
import { parseCalendarDate } from '../../kpi/calendar'
import { cycleWeeks, effectiveWeek, startOfKarachiDay, weekStartsAt } from '../calendar'
import { renderRequestExpiredEmail } from '../emails'
import { roundStage, type RoundStage } from '../round-stage'
import type { RoundChecklistItem, RoundNextStep, RoundSummary, RoundView } from '../view-types'
import { recordAudit } from './audit'
import { readyCompetencyCount } from './content'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { createCycle, loadCycle, updateCycle, type CycleWithPeriod } from './cycles'
import { WeeklyError } from './errors'
import { formsProgress } from './form-tables'
import { deliverOnce, type WeeklySendMail } from './notifications'

const DAY_MS = 24 * 60 * 60 * 1000
/** Classic reports still read a period's "evaluations start" date; for a round it is a few days after the quarter. */
const REPORTS_AFTER_QUARTER_DAYS = 5

async function cycleForPeriod(periodId: string): Promise<CycleWithPeriod | null> {
  const row = await prisma.weeklyCycle.findUnique({ where: { periodId }, select: { id: true } })
  return row ? loadCycle(row.id) : null
}

async function stageOf(cycle: CycleWithPeriod): Promise<RoundStage> {
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: cycle.periodId }, select: { preEvaluationTriggeredAt: true } })
  return roundStage({ cycleStatus: cycle.status, reviewOpenedAt: period?.preEvaluationTriggeredAt ?? null, resultsPublishedAt: cycle.resultsPublishedAt })
}

/** The stage of the round a period belongs to; null when the period has no round (a classic quarter). */
export async function periodRoundStage(periodId: string): Promise<RoundStage | null> {
  const cycle = await cycleForPeriod(periodId)
  return cycle ? stageOf(cycle) : null
}

export async function roundsList(actor: WeeklyActor): Promise<RoundSummary[]> {
  assertHr(actor)
  const cycles = await prisma.weeklyCycle.findMany({ orderBy: { weekOneStartsOn: 'desc' }, select: { id: true } })
  return Promise.all(cycles.map(async ({ id }) => {
    const cycle = await loadCycle(id)
    return { periodId: cycle.periodId, cycleId: cycle.id, name: cycle.period.name, stage: await stageOf(cycle) }
  }))
}

export interface SetupRoundInput { name: string; startDate: string; endDate: string; weekOneStartsOn: string; questionWeeks?: number; reviewDeadline?: string }

/** Creates the quarter and its weekly cycle together, in Draft. */
export async function setupRound(actor: WeeklyActor, input: SetupRoundInput, now: Date): Promise<{ periodId: string; cycleId: string }> {
  assertHr(actor)
  const start = parseCalendarDate(input.startDate)
  const end = parseCalendarDate(input.endDate)
  if (!start || !end) throw new WeeklyError('Enter the quarter start and end dates (YYYY-MM-DD)')
  const startDate = startOfKarachiDay(start)
  const endDate = startOfKarachiDay(end)
  if (endDate < startDate) throw new WeeklyError('The quarter must end after it starts')
  const deadline = input.reviewDeadline ? parseCalendarDate(input.reviewDeadline) : null
  if (input.reviewDeadline && !deadline) throw new WeeklyError('Enter the review deadline as a date (YYYY-MM-DD)')
  const period = await prisma.evaluationPeriod.create({
    data: { name: input.name.trim(), startDate, endDate, reviewStartDate: new Date(endDate.getTime() + REPORTS_AFTER_QUARTER_DAYS * DAY_MS), isActive: false },
  })
  try {
    const cycle = await createCycle(actor, { periodId: period.id, weekOneStartsOn: input.weekOneStartsOn, questionWeeks: input.questionWeeks })
    // By default the review stage runs for a week from today.
    const reviewDeadline = deadline ? startOfKarachiDay(deadline) : new Date(now.getTime() + 7 * DAY_MS)
    await prisma.weeklyCycle.update({ where: { id: cycle.id }, data: { reviewDeadline } })
    await recordAudit(prisma, { cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'ROUND_SETUP', objectType: 'EvaluationPeriod', objectId: period.id, after: input })
    return { periodId: period.id, cycleId: cycle.id }
  } catch (error) {
    // The cycle's checks failed (e.g. week 1 is not a Monday): the period goes too, so nothing half-made is left.
    await prisma.evaluationPeriod.delete({ where: { id: period.id } }).catch(() => undefined)
    throw error
  }
}

const NEXT: Record<RoundStage, RoundNextStep | null> = {
  DRAFT: { action: 'open-review', label: 'Open review stage', sentence: 'Check everyone’s lists, then open the review stage so people can check theirs and leads can write their questions.' },
  REVIEW: { action: 'open-round', label: 'Open evaluation round', sentence: 'When the review stage is done, open the round. Weekly questions start on week 1.' },
  OPEN: { action: 'close-round', label: 'Close round', sentence: 'Weekly questions are running. Close the round once the last week is over and the quarter-end forms are in.' },
  CLOSED: { action: 'release', label: 'Release reports', sentence: 'Scores are final. Release the reports to employees.' },
  RELEASED: null,
}

async function checklist(cycle: CycleWithPeriod, stage: RoundStage): Promise<RoundChecklistItem[]> {
  const items: RoundChecklistItem[] = []
  if (stage === 'DRAFT') {
    const topics = await readyCompetencyCount()
    items.push({ key: 'topics', label: topics > 0 ? `${topics} question topics ready` : 'No question topics are ready yet', done: topics > 0, count: topics, tab: 'advanced' })
  }
  if (stage === 'REVIEW' || stage === 'OPEN') {
    const preps = await prisma.preEvaluationLeadPrep.findMany({ where: { periodId: cycle.periodId }, select: { questionsSubmittedAt: true, questionsCarriedForwardAt: true } })
    const written = preps.filter((p) => p.questionsSubmittedAt || p.questionsCarriedForwardAt).length
    items.push({ key: 'lead-questions', label: `${written} of ${preps.length} leads wrote their team questions`, done: written === preps.length, count: preps.length - written, tab: 'people' })
  }
  if (stage === 'REVIEW') {
    const pending = await prisma.peerChangeRequest.count({ where: { periodId: cycle.periodId, status: 'PENDING' } })
    items.push({ key: 'requests', label: pending ? `${pending} change ${pending === 1 ? 'request' : 'requests'} waiting for a decision` : 'No change requests waiting', done: pending === 0, count: pending, tab: 'people' })
  }
  if (stage === 'OPEN') {
    const forms = await formsProgress(cycle.periodId)
    const left = forms.total - forms.done
    items.push({ key: 'forms', label: left ? `${left} quarter-end ${left === 1 ? 'form' : 'forms'} left` : 'Quarter-end forms done', done: left === 0, count: left, tab: 'forms' })
  }
  if (stage === 'CLOSED') {
    const sent = await prisma.emailQueue.count({ where: { report: { periodId: cycle.periodId }, emailStatus: 'SENT' } })
    items.push({ key: 'reports', label: sent ? `${sent} reports sent; release the rest` : 'Reports not released yet', done: false, count: sent, tab: 'results' })
  }
  return items
}

export async function roundView(actor: WeeklyActor, periodId: string, now: Date): Promise<RoundView> {
  assertHr(actor)
  const cycle = await cycleForPeriod(periodId)
  if (!cycle) throw new WeeklyError('This quarter has no evaluation round', 404)
  const stage = await stageOf(cycle)
  const period = await prisma.evaluationPeriod.findUniqueOrThrow({ where: { id: periodId }, select: { preEvaluationTriggeredAt: true, isLocked: true } })
  const total = cycleWeeks(cycle)
  return {
    periodId, cycleId: cycle.id, name: cycle.period.name, stage, locked: period.isLocked,
    startDate: cycle.period.startDate.toISOString(), endDate: cycle.period.endDate.toISOString(),
    weekOneStartsOn: cycle.weekOneStartsOn.toISOString(), closesOn: new Date(weekStartsAt(cycle.weekOneStartsOn, total + 1).getTime() - 1).toISOString(),
    reviewOpenedAt: period.preEvaluationTriggeredAt?.toISOString() ?? null, reviewDeadline: cycle.reviewDeadline?.toISOString() ?? null,
    questionWeeks: cycle.questionWeeks, totalWeeks: total,
    currentWeek: stage === 'OPEN' ? Math.min(total, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now))) : null,
    next: NEXT[stage], checklist: await checklist(cycle, stage),
  }
}

/** Review → Open: undecided requests expire (their people are told), the cycle starts and the quarter becomes active. */
export async function openRound(actor: WeeklyActor, periodId: string, now: Date, send: WeeklySendMail, appUrl: string): Promise<void> {
  assertHr(actor)
  const cycle = await cycleForPeriod(periodId)
  if (!cycle) throw new WeeklyError('This quarter has no evaluation round', 404)
  const stage = await stageOf(cycle)
  if (stage === 'DRAFT') throw new WeeklyError('Open the review stage first, so people can check their lists', 409)
  if (stage !== 'REVIEW') throw new WeeklyError('This round is already open', 409)
  await updateCycle(actor, cycle.id, { action: 'start' })
  const pending = await prisma.peerChangeRequest.findMany({ where: { periodId, status: 'PENDING' } })
  if (pending.length) await prisma.peerChangeRequest.updateMany({ where: { id: { in: pending.map((r) => r.id) } }, data: { status: 'EXPIRED', decidedAt: now } })
  await prisma.$transaction([
    prisma.evaluationPeriod.updateMany({ where: { id: { not: periodId } }, data: { isActive: false } }),
    prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isActive: true } }),
  ])
  const people = await loadPeople(pending.flatMap((r) => [r.requesterId, r.peerId]))
  await deliverOnce(pending.map((r) => ({
    userId: r.requesterId, kind: 'peer-request-outcome' as const, dedupeKey: `peer-request-expired:${r.id}`,
    render: (name: string) => renderRequestExpiredEmail({ name, otherName: people.get(r.peerId)?.name ?? 'the person', appUrl }),
  })), send)
  await recordAudit(prisma, { cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'ROUND_OPEN', objectType: 'EvaluationPeriod', objectId: periodId, after: { expired: pending.length } })
}
