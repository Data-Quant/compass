// UX spec, section 5: the dashboard card always shows one sentence: what to do now and by when. Four messages: check your
// lists, this week's progress, all caught up, round closed. It also says when this month's self-evaluation is waiting,
// and tells a lead whose team member has sent theirs.
import { prisma } from '@/lib/db'
import { cycleWeeks, effectiveWeek, weekStartsAt } from '../calendar'
import { roundStage } from '../round-stage'
import { loadCycle } from './cycles'
import type { WeeklyActor } from './context'
import { mySelfReview, teamSelfReviews } from './self-review'
import { weekProgress } from './week-progress'
import { OPEN_REQUEST_STATUSES } from '../request-status'
import { loadPeople, isHrActor } from './context'
import { loadAnswerRecords } from './answer-states'
import { formsOpenFor, formsView } from './forms'
import { formsProgress } from './form-tables'
import { lateJoiners, roundClosesOn } from './round-notices'
import type { RoundStage } from '../round-stage'
import type { CycleWithPeriod } from './cycles'

export type EvaluationsCardState = 'CHECK_LISTS' | 'THIS_WEEK' | 'CAUGHT_UP' | 'CLOSED'
export interface EvaluationsCardView {
  state: EvaluationsCardState
  message: string
  /** A second line, e.g. "2 from last week". */
  detail: string | null
  href: string
  /** "Your self-evaluation for October is waiting", when it is. */
  selfReview: string | null
  /**
   * One line for each emailed event that still needs the person (UX spec, section 13: every email has a matching card):
   * changes to review or about them, recent outcomes and HR changes, late joiners, open forms, and for HR what waits on HR.
   */
  notices: CardNotice[]
}
export interface CardNotice { text: string; href: string }

const HREF = '/evaluations/weekly'
const HR_ROUND = '/admin/evaluation-round'
/** Outcomes and HR's changes stay on the card for a week. */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** This person's own unfinished quarter-end forms; only HR, who fill in the partners' tables, need the whole round's. */
async function hasOpenForms(actor: WeeklyActor, periodId: string, now: Date): Promise<boolean> {
  if (isHrActor(actor)) return (await formsProgress(periodId, now)).pendingEvaluatorIds.includes(actor.id)
  return (await formsView(actor, now)).forms.some((f) => f.status !== 'SUBMITTED' && f.status !== 'CLOSED_BY_OTHER')
}

async function cardNotices(actor: WeeklyActor, cycle: CycleWithPeriod, stage: RoundStage, now: Date): Promise<CardNotice[]> {
  const periodId = cycle.periodId
  const since = new Date(now.getTime() - RECENT_MS)
  const [toReview, aboutMe, decided, hrChanges, selfReviews] = await Promise.all([
    prisma.peerChangeRequest.findMany({ where: { periodId, approverId: actor.id, status: 'PENDING', approverVote: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    prisma.peerChangeRequest.findMany({ where: { periodId, peerId: actor.id, relation: 'PEER', status: { in: OPEN_REQUEST_STATUSES } }, orderBy: { createdAt: 'asc' } }),
    prisma.peerChangeRequest.findMany({ where: { periodId, requesterId: actor.id, status: { in: ['APPROVED', 'REJECTED'] }, decidedAt: { gte: since, lte: now } } }),
    // Changed, not only created, in the last week; an import is the round's draft, not a change people are told about.
    prisma.evaluationPeriodAssignmentOverride.count({ where: { periodId, note: { startsWith: 'HR:', not: 'HR: imported lists' }, updatedAt: { gte: since }, OR: [{ evaluatorId: actor.id }, { evaluateeId: actor.id }] } }),
    teamSelfReviews(actor),
  ])
  const people = await loadPeople([...toReview, ...aboutMe, ...decided].flatMap((r) => [r.requesterId, r.peerId]))
  const name = (id: string) => people.get(id)?.name ?? 'Someone'
  const notices: CardNotice[] = [
    ...toReview.map((r) => ({ text: `${name(r.requesterId)} asked to change their evaluation lists: review it`, href: HREF })),
    ...aboutMe.map((r) => ({ text: `${name(r.requesterId)} asked to ${r.action === 'ADD' ? 'add you as a peer' : 'remove you as a peer'}`, href: HREF })),
    ...decided.map((r) => ({ text: `${r.status === 'APPROVED' ? 'Approved' : 'Not approved'}: your request about ${name(r.peerId)}`, href: HREF })),
    ...(hrChanges > 0 ? [{ text: 'HR changed your evaluation lists', href: HREF }] : []),
    ...selfReviews.items.filter((i) => !i.readAt).map((i) => ({ text: `${i.person.name} has submitted their self-evaluation for ${i.monthName}`, href: HREF })),
  ]
  if (stage === 'OPEN') {
    for (const { joiner, leads } of await lateJoiners(cycle, now)) {
      if (leads.includes(actor.id)) notices.push({ text: `${joiner.name} isn’t in this round; give feedback in person`, href: HREF })
    }
    if (formsOpenFor(cycle, now) && (await hasOpenForms(actor, periodId, now))) {
      notices.push({ text: 'Your quarter-end forms are open', href: isHrActor(actor) ? `${HR_ROUND}?tab=forms` : HREF })
    }
  }
  if (isHrActor(actor)) {
    const open = await prisma.peerChangeRequest.findMany({ where: { periodId, status: 'PENDING' }, select: { approverId: true, approverVote: true } })
    const forHr = open.filter((r) => !r.approverId || r.approverVote !== 'PENDING').length
    if (forHr) notices.push({ text: `${plural(forHr, 'list change', 'list changes')} waiting for your decision`, href: `${HR_ROUND}?tab=people` })
    if (stage === 'OPEN') {
      const waiting = (await loadAnswerRecords({ cycleId: cycle.id })).filter((r) => r.state === 'NEEDS_REVIEW' || r.state === 'FAILED').length
      if (waiting) notices.push({ text: `${plural(waiting, 'answer', 'answers')} waiting for your review`, href: `${HR_ROUND}?tab=review` })
    }
  }
  return notices
}
const DAY_MS = 24 * 60 * 60 * 1000
const shortDate = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })
const longDay = (date: Date) => date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })

export async function evaluationsCard(actor: WeeklyActor, now: Date): Promise<EvaluationsCardView | null> {
  const row = await prisma.weeklyCycle.findFirst({ orderBy: { weekOneStartsOn: 'desc' }, select: { id: true } })
  if (!row) return null
  const cycle = await loadCycle(row.id)
  const period = await prisma.evaluationPeriod.findUniqueOrThrow({ where: { id: cycle.periodId }, select: { name: true, preEvaluationTriggeredAt: true } })
  const stage = roundStage({ cycleStatus: cycle.status, reviewOpenedAt: period.preEvaluationTriggeredAt, resultsPublishedAt: cycle.resultsPublishedAt })
  if (stage === 'DRAFT') return null
  const base = { href: HREF, selfReview: null, notices: await cardNotices(actor, cycle, stage, now) }
  if (stage === 'CLOSED' || stage === 'RELEASED') return { ...base, state: 'CLOSED', message: 'Round closed. HR will share your report.', detail: null }
  if (stage === 'REVIEW') {
    const confirmed = await prisma.mappingConfirmation.findUnique({ where: { periodId_userId: { periodId: cycle.periodId, userId: actor.id } } })
    if (!confirmed) {
      const by = cycle.reviewDeadline ?? cycle.weekOneStartsOn
      return { ...base, state: 'CHECK_LISTS', message: `Check your ${cycle.period.name} evaluation lists by ${shortDate(by)}`, detail: null }
    }
    return { ...base, state: 'CAUGHT_UP', message: `All caught up. Questions start ${shortDate(cycle.weekOneStartsOn)}`, detail: null }
  }
  const total = cycleWeeks(cycle)
  const week = Math.min(total, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now)))
  const weekStart = weekStartsAt(cycle.weekOneStartsOn, week)
  const progress = await weekProgress(cycle.id, actor.id, week, weekStart)
  const self = (await mySelfReview(actor, now)).current
  const selfReview = self ? `Your self-evaluation for ${self.monthName} is waiting` : null
  if (progress.open === 0) return { ...base, selfReview, state: 'CAUGHT_UP', message: 'All caught up. Next questions Monday', detail: null }
  const sunday = new Date(weekStart.getTime() + 6 * DAY_MS)
  return {
    ...base, selfReview, state: 'THIS_WEEK',
    message: `This week: ${progress.done} of ${progress.total} done, due ${longDay(sunday)}`,
    detail: week === total
      ? `Last week of the round: ${progress.open} ${progress.open === 1 ? 'question' : 'questions'} left before ${roundClosesOn(cycle)}`
      : progress.carried ? `${progress.carried} from last week` : null,
  }
}
