// The Evaluation round page (UX spec, section 4): one round = one evaluation period and its weekly cycle. HR moves it
// Draft → Review → Open → Closed → Released; this service derives the stage, says what is next, and makes the moves.
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments, snapshotEvaluationPeriodAssignments } from '@/lib/evaluation-assignments'
import { cycleWeeks, effectiveWeek, parseCalendarDate, startOfKarachiDay, weekStartsAt } from '../calendar'
import { evaluateeExclusion, isOutsideRedesign } from '../eligibility'
import { renderRequestExpiredEmail } from '../emails'
import { isWeeklyRelationshipType } from '../perspectives'
import { OPEN_REQUEST_STATUSES } from '../request-status'
import { roundStage, type RoundStage } from '../round-stage'
import type { RoundChecklistItem, RoundNextStep, RoundSummary, RoundView } from '../view-types'
import { recordAudit } from './audit'
import { readyCompetencyCount } from './content'
import { assertHr, loadPeople, personRef, type WeeklyActor } from './context'
import { checkQuestionWeeks, checkWeekOne, createCycle, loadCycle, roundOpensAt, updateCycle, type CycleWithPeriod } from './cycles'
import { WeeklyError } from './errors'
import { loadAnswerRecords } from './answer-states'
import { formsProgress } from './form-tables'
import { deliverSafely, type WeeklySendMail } from './notifications'
import { roundHealth, roundOpenedMessages } from './round-notices'
import { formsOpenDate, formsOpenFor } from './forms'
import { earlierQuarters } from './earlier-quarter'
import { formatKarachiDate } from '../format'

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

/** The weekly rounds, newest first, then the earlier quarters (run on the earlier evaluations) so all of them are here. */
export async function roundsList(actor: WeeklyActor): Promise<RoundSummary[]> {
  assertHr(actor)
  const cycles = await prisma.weeklyCycle.findMany({ orderBy: { weekOneStartsOn: 'desc' }, select: { id: true } })
  const rounds = await Promise.all(cycles.map(async ({ id }) => {
    const cycle = await loadCycle(id)
    return { periodId: cycle.periodId, cycleId: cycle.id, name: cycle.period.name, stage: await stageOf(cycle) }
  }))
  return [...rounds, ...(await earlierQuarters())]
}

export interface SetupRoundInput { name: string; startDate: string; endDate: string; weekOneStartsOn: string; questionWeeks?: number; reviewDeadline?: string }

/** The quarter's dates from the form; the review deadline only when HR gave one. */
function parseQuarter(input: SetupRoundInput): { startDate: Date; endDate: Date; reviewDeadline: Date | null } {
  const start = parseCalendarDate(input.startDate)
  const end = parseCalendarDate(input.endDate)
  if (!start || !end) throw new WeeklyError('Enter the quarter start and end dates (YYYY-MM-DD)')
  const startDate = startOfKarachiDay(start)
  const endDate = startOfKarachiDay(end)
  if (endDate < startDate) throw new WeeklyError('The quarter must end after it starts')
  const deadline = input.reviewDeadline ? parseCalendarDate(input.reviewDeadline) : null
  if (input.reviewDeadline && !deadline) throw new WeeklyError('Enter the review deadline as a date (YYYY-MM-DD)')
  return { startDate, endDate, reviewDeadline: deadline ? startOfKarachiDay(deadline) : null }
}

const reportsStart = (endDate: Date) => new Date(endDate.getTime() + REPORTS_AFTER_QUARTER_DAYS * DAY_MS)

/** Creates the quarter and its weekly cycle together, in Draft. */
export async function setupRound(actor: WeeklyActor, input: SetupRoundInput, now: Date): Promise<{ periodId: string; cycleId: string }> {
  assertHr(actor)
  const { startDate, endDate, reviewDeadline: deadline } = parseQuarter(input)
  const period = await prisma.evaluationPeriod.create({
    data: { name: input.name.trim(), startDate, endDate, reviewStartDate: reportsStart(endDate), isActive: false },
  })
  try {
    const cycle = await createCycle(actor, { periodId: period.id, weekOneStartsOn: input.weekOneStartsOn, questionWeeks: input.questionWeeks })
    // By default the review stage runs for a week from today.
    const reviewDeadline = deadline ?? new Date(now.getTime() + 7 * DAY_MS)
    await prisma.weeklyCycle.update({ where: { id: cycle.id }, data: { reviewDeadline } })
    await recordAudit(prisma, { cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'ROUND_SETUP', objectType: 'EvaluationPeriod', objectId: period.id, after: input })
    return { periodId: period.id, cycleId: cycle.id }
  } catch (error) {
    // The cycle's checks failed (e.g. week 1 is on a weekend): the period goes too, so nothing half-made is left.
    await prisma.evaluationPeriod.delete({ where: { id: period.id } }).catch(() => undefined)
    throw error
  }
}

const NOT_OPEN_YET = 'This round is already open, so its dates are fixed and it cannot be deleted'

/** A round that has not opened yet (Draft or Review), or a 409. */
async function unopenedRound(periodId: string): Promise<CycleWithPeriod> {
  const cycle = await cycleForPeriod(periodId)
  if (!cycle) throw new WeeklyError('This quarter has no evaluation round', 404)
  if (cycle.status !== 'SETUP') throw new WeeklyError(NOT_OPEN_YET, 409)
  return cycle
}

/** Changes the quarter and the weekly schedule of a round that has not opened yet. */
export async function updateRound(actor: WeeklyActor, periodId: string, input: SetupRoundInput): Promise<void> {
  assertHr(actor)
  const cycle = await unopenedRound(periodId)
  const { startDate, endDate, reviewDeadline } = parseQuarter(input)
  const weekOneStartsOn = checkWeekOne(input.weekOneStartsOn, endDate)
  const questionWeeks = checkQuestionWeeks(input.questionWeeks, weekOneStartsOn, endDate)
  await prisma.$transaction(async (tx) => {
    // Guarded on status, so a round opened at the same moment keeps its dates.
    const moved = await tx.weeklyCycle.updateMany({ where: { id: cycle.id, status: 'SETUP' }, data: { weekOneStartsOn, questionWeeks, ...(reviewDeadline ? { reviewDeadline } : {}) } })
    if (moved.count === 0) throw new WeeklyError(NOT_OPEN_YET, 409)
    await tx.evaluationPeriod.update({ where: { id: periodId }, data: { name: input.name.trim(), startDate, endDate, reviewStartDate: reportsStart(endDate) } })
    await recordAudit(tx, {
      cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'ROUND_EDIT', objectType: 'EvaluationPeriod', objectId: periodId,
      before: { name: cycle.period.name, startDate: cycle.period.startDate.toISOString(), endDate: cycle.period.endDate.toISOString(), weekOneStartsOn: cycle.weekOneStartsOn.toISOString(), questionWeeks: cycle.questionWeeks },
      after: { ...input, questionWeeks },
    })
  })
}

/** What deleting an unopened round undoes, for HR's confirmation: requests, confirmations and approved list changes. */
export async function draftContents(periodId: string): Promise<{ requests: number; confirmations: number; listChanges: number }> {
  const [requests, confirmations, listChanges] = await Promise.all([
    prisma.peerChangeRequest.count({ where: { periodId } }),
    prisma.mappingConfirmation.count({ where: { periodId } }),
    prisma.evaluationPeriodAssignmentOverride.count({ where: { periodId } }),
  ])
  return { requests, confirmations, listChanges }
}

/**
 * Deletes a round that has not opened yet, with its quarter, so HR can set it up again (and send the list emails
 * again). Lead and team changes already went into the org chart and stay; this round's peer changes, requests and
 * confirmations go. The audit trail stays.
 */
export async function deleteRound(actor: WeeklyActor, periodId: string): Promise<void> {
  assertHr(actor)
  const cycle = await unopenedRound(periodId)
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ status: string }>>`SELECT status::text AS status FROM "WeeklyCycle" WHERE id = ${cycle.id} FOR UPDATE`
    if (row?.status !== 'SETUP') throw new WeeklyError(NOT_OPEN_YET, 409)
    if ((await tx.weeklyPrompt.count({ where: { cycleId: cycle.id } })) > 0) throw new WeeklyError('This round already has questions, so it cannot be deleted', 409)
    const where = { cycleId: cycle.id }
    await tx.weeklyRelease.deleteMany({ where })
    await tx.weeklySlot.deleteMany({ where })
    await tx.weeklyParticipantOverride.deleteMany({ where })
    await tx.weeklyPairWindow.deleteMany({ where })
    await tx.roundWarningAcceptance.deleteMany({ where })
    await tx.weeklyAggregationRun.deleteMany({ where })
    // Topics written for this round only (leads' questions), with their wordings.
    const topics = (await tx.weeklyCompetency.findMany({ where, select: { id: true } })).map((t) => t.id)
    await tx.weeklyCompetencyPrompt.deleteMany({ where: { competencyId: { in: topics } } })
    await tx.weeklyCompetency.deleteMany({ where: { id: { in: topics } } })
    await tx.weeklyCycle.delete({ where: { id: cycle.id } })
    const byPeriod = { where: { periodId } }
    await tx.peerChangeRequest.deleteMany(byPeriod)
    await tx.mappingConfirmation.deleteMany(byPeriod)
    await tx.surveyResponse.deleteMany(byPeriod)
    await tx.surveyCompletion.deleteMany(byPeriod)
    await tx.surveyQuestion.deleteMany(byPeriod)
    await tx.selfReview.deleteMany(byPeriod)
    await tx.selfReviewQuestion.deleteMany(byPeriod)
    // The rest (list overrides, snapshots) goes with the quarter.
    await tx.evaluationPeriod.delete({ where: { id: periodId } })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: 'ROUND_DELETE', objectType: 'EvaluationPeriod', objectId: periodId, before: { name: cycle.period.name, cycleId: cycle.id } })
  })
}

const NEXT: Record<RoundStage, RoundNextStep | null> = {
  DRAFT: { action: 'open-review', label: 'Open review stage', sentence: 'Check everyone’s lists, then open the review stage so people can check theirs and leads can write their questions.' },
  REVIEW: { action: 'open-round', label: 'Open evaluation round', sentence: 'When the review stage is done, open the round. Weekly questions start on week 1.' },
  OPEN: { action: 'close-round', label: 'Close round', sentence: 'Weekly questions are running. Close the round once the last week is over and the quarter-end forms are in.' },
  CLOSED: { action: 'release', label: 'Release reports', sentence: 'Scores are final. Release the reports to employees.' },
  RELEASED: null,
}

/** How many people with lists said they look right. A count only: it never blocks opening the round. */
async function confirmationsItem(periodId: string): Promise<RoundChecklistItem> {
  const assignments = (await getResolvedEvaluationAssignments(periodId)).filter((a) => isWeeklyRelationshipType(a.relationshipType))
  const people = await loadPeople(assignments.flatMap((a) => [a.evaluatorId, a.evaluateeId]))
  const mapped = [...people.values()].filter((p) => p.payrollActive && !isOutsideRedesign(p)).map((p) => p.id)
  const confirmed = await prisma.mappingConfirmation.count({ where: { periodId, userId: { in: mapped } } })
  return { key: 'confirmations', label: `${confirmed} of ${mapped.length} people said their lists look right`, done: confirmed >= mapped.length, count: mapped.length - confirmed, tab: 'people' }
}

async function checklist(cycle: CycleWithPeriod, stage: RoundStage, now: Date): Promise<RoundChecklistItem[]> {
  const items: RoundChecklistItem[] = []
  if (stage === 'DRAFT') {
    const topics = await readyCompetencyCount()
    items.push({ key: 'topics', label: topics > 0 ? `${topics} question topics ready` : 'No question topics are ready yet', done: topics > 0, count: topics, tab: 'advanced' })
  }
  if (stage === 'REVIEW') {
    const open = await prisma.peerChangeRequest.findMany({ where: { periodId: cycle.periodId, status: { in: OPEN_REQUEST_STATUSES } }, select: { remindedAt: true, approverVote: true } })
    const late = open.filter((r) => r.remindedAt && r.approverVote === 'PENDING').length
    const waiting = open.length ? `${open.length} change ${open.length === 1 ? 'request' : 'requests'} waiting for a decision${late ? ` (${late} past 2 working days)` : ''}` : 'No change requests waiting'
    items.push({ key: 'requests', label: waiting, done: open.length === 0, count: open.length, tab: 'people' })
    items.push(await confirmationsItem(cycle.periodId))
  }
  if (stage === 'OPEN') {
    const answers = await loadAnswerRecords({ cycleId: cycle.id })
    // HR reviews every score; answers still with the model come to HR shortly.
    const waiting = answers.filter((r) => r.state === 'NEEDS_REVIEW' || r.state === 'FAILED').length
    const label = waiting ? `${waiting} answer${waiting === 1 ? '' : 's'} waiting for your review` : 'Nothing waiting for your review'
    items.push({ key: 'review', label, done: answers.every((r) => r.state === 'DECIDED'), count: waiting, tab: 'review' })
    const forms = await formsProgress(cycle.periodId, now)
    const left = forms.total - forms.done
    // Before the forms open there is nothing to be done yet, so the item is not shown as done.
    if (!formsOpenFor(cycle, now)) items.push({ key: 'forms', label: `Quarter-end forms open ${formatKarachiDate(formsOpenDate(cycle).toISOString())}`, done: false, count: 0, tab: 'forms' })
    else items.push({ key: 'forms', label: left ? `${left} quarter-end ${left === 1 ? 'form' : 'forms'} left` : 'Quarter-end forms done', done: left === 0, count: left, tab: 'forms' })
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
    next: NEXT[stage], checklist: await checklist(cycle, stage, now),
    ...(stage === 'DRAFT' ? { people: await peopleCounts(cycle, now) } : {}),
    ...(stage === 'DRAFT' || stage === 'REVIEW' ? { draft: await draftContents(periodId) } : {}),
    ...(stage === 'REVIEW' ? { pendingRequests: await pendingRequests(periodId) } : {}),
    ...(stage === 'OPEN' ? { health: await roundHealth(cycle, { through: weekNow(cycle, now), current: weekNow(cycle, now) }) } : {}),
  }
}

const weekNow = (cycle: CycleWithPeriod, now: Date) => Math.min(cycleWeeks(cycle), Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now)))

/** Everyone active who is evaluated in the round, and who is not (UX spec, HR step 3). */
async function peopleCounts(cycle: CycleWithPeriod, now: Date): Promise<{ included: number; excluded: number }> {
  const active = await prisma.user.findMany({ where: { OR: [{ payrollProfile: null }, { payrollProfile: { isPayrollActive: true } }] }, select: { id: true } })
  const optedIn = new Set((await prisma.weeklyParticipantOverride.findMany({ where: { cycleId: cycle.id, optIn: true }, select: { userId: true } })).map((o) => o.userId))
  const people = [...(await loadPeople(active.map((u) => u.id))).values()].filter((p) => !isOutsideRedesign(p))
  const included = people.filter((p) => evaluateeExclusion(p, { now, opensAt: roundOpensAt(cycle), optedIn: optedIn.has(p.id) }) === null).length
  return { included, excluded: people.length - included }
}

/** The requests nobody has decided, which expire when the round opens (UX spec, HR step 5). */
async function pendingRequests(periodId: string): Promise<NonNullable<RoundView['pendingRequests']>> {
  const open = await prisma.peerChangeRequest.findMany({ where: { periodId, status: { in: OPEN_REQUEST_STATUSES } }, orderBy: { createdAt: 'asc' } })
  const people = await loadPeople(open.flatMap((r) => [r.requesterId, r.peerId]))
  return open.map((r) => ({ id: r.id, requester: personRef(people, r.requesterId), other: personRef(people, r.peerId), relation: r.relation, action: r.action }))
}

/** Review → Open: undecided requests expire (their people are told), the cycle starts, the quarter becomes active, and every evaluator hears it has started. */
export async function openRound(actor: WeeklyActor, periodId: string, now: Date, send: WeeklySendMail, appUrl: string): Promise<void> {
  assertHr(actor)
  const cycle = await cycleForPeriod(periodId)
  if (!cycle) throw new WeeklyError('This quarter has no evaluation round', 404)
  const stage = await stageOf(cycle)
  if (stage === 'DRAFT') throw new WeeklyError('Open the review stage first, so people can check their lists', 409)
  if (stage !== 'REVIEW') throw new WeeklyError('This round is already open', 409)
  await updateCycle(actor, cycle.id, { action: 'start' })
  const pending = await prisma.peerChangeRequest.findMany({ where: { periodId, status: { in: OPEN_REQUEST_STATUSES } } })
  // Guarded on still being open, so a request decided in the meantime keeps its decision.
  if (pending.length) await prisma.peerChangeRequest.updateMany({ where: { id: { in: pending.map((r) => r.id) }, status: { in: OPEN_REQUEST_STATUSES } }, data: { status: 'EXPIRED', decidedAt: now } })
  await prisma.$transaction([
    prisma.evaluationPeriod.updateMany({ where: { id: { not: periodId } }, data: { isActive: false } }),
    prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isActive: true } }),
  ])
  await recordAudit(prisma, { cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'ROUND_OPEN', objectType: 'EvaluationPeriod', objectId: periodId, after: { expired: pending.length } })
  const people = await loadPeople(pending.flatMap((r) => [r.requesterId, r.peerId]))
  const name = (id: string) => people.get(id)?.name ?? 'the person'
  // The round is open whatever happens to the emails; the daily job catches up any "started" email that failed.
  await deliverSafely('round opened', async () => [
    ...pending.map((r) => ({
      userId: r.requesterId, kind: 'peer-request-outcome' as const, dedupeKey: `peer-request-expired:${r.id}`,
      render: (to: string) => renderRequestExpiredEmail({ name: to, otherName: name(r.peerId), appUrl }),
    })),
    // In a peer change the peer was told about it, so they hear it lapsed too.
    ...pending.filter((r) => r.relation === 'PEER').map((r) => ({
      userId: r.peerId, kind: 'peer-request-outcome' as const, dedupeKey: `peer-request-expired:${r.id}:peer`,
      render: (to: string) => renderRequestExpiredEmail({ name: to, otherName: name(r.requesterId), requestedBy: name(r.requesterId), appUrl }),
    })),
    ...(await roundOpenedMessages(await loadCycle(cycle.id), now, appUrl)),
  ], send)
}

/**
 * HR locks a round once it is open: answers, lists and forms can no longer change, and the lists are kept as they are
 * now (the same snapshot the Periods page took). Unlocking an old quarter is refused while another one is active.
 */
/**
 * Locks or unlocks a round. For an earlier quarter (no weekly round) this is how HR closes it, once its quarter-end
 * evaluations are in, and reopens it to correct one.
 */
export async function setRoundLock(actor: WeeklyActor, periodId: string, locked: boolean): Promise<void> {
  assertHr(actor)
  const cycle = await cycleForPeriod(periodId)
  if (!cycle) {
    const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { isLocked: true } })
    if (!period) throw new WeeklyError('Quarter not found', 404)
    if (period.isLocked === locked) throw new WeeklyError(locked ? 'This quarter is already closed' : 'This quarter is not closed', 409)
    await prisma.$transaction(async (tx) => {
      if (locked) await snapshotEvaluationPeriodAssignments(periodId, tx)
      await tx.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: locked } })
    }, { timeout: 60_000 })
    await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: locked ? 'EARLIER_QUARTER_CLOSE' : 'EARLIER_QUARTER_REOPEN', objectType: 'EvaluationPeriod', objectId: periodId })
    return
  }
  const stage = await stageOf(cycle)
  if (stage === 'DRAFT' || stage === 'REVIEW') throw new WeeklyError('Lock a round once it is open', 409)
  const period = await prisma.evaluationPeriod.findUniqueOrThrow({ where: { id: periodId }, select: { isLocked: true, isActive: true } })
  if (period.isLocked === locked) throw new WeeklyError(locked ? 'This round is already locked' : 'This round is not locked', 409)
  if (!locked && !period.isActive) {
    const active = await prisma.evaluationPeriod.findFirst({ where: { isActive: true, id: { not: periodId } }, select: { name: true } })
    throw new WeeklyError(active ? `This round cannot be unlocked while ${active.name} is active` : 'Make this quarter active before unlocking it', 409)
  }
  await prisma.$transaction(async (tx) => {
    if (locked) await snapshotEvaluationPeriodAssignments(periodId, tx)
    await tx.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: locked } })
  }, { timeout: 60_000 })
  await recordAudit(prisma, { cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: locked ? 'ROUND_LOCK' : 'ROUND_UNLOCK', objectType: 'EvaluationPeriod', objectId: periodId })
}
