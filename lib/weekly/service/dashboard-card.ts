// UX spec, section 5: the dashboard card always shows one sentence: what to do now and by when. Four messages: check your
// lists, this week's progress, all caught up, round closed. It also says when this month's self-evaluation is waiting,
// and tells a lead whose team member has sent theirs.
import { prisma } from '@/lib/db'
import { cycleWeeks, effectiveWeek, weekStartsAt } from '../calendar'
import { roundStage } from '../round-stage'
import { loadCycle } from './cycles'
import type { WeeklyActor } from './context'
import { mySelfReview, teamSelfReviews } from './self-review'

export type EvaluationsCardState = 'CHECK_LISTS' | 'THIS_WEEK' | 'CAUGHT_UP' | 'CLOSED'
export interface EvaluationsCardView {
  state: EvaluationsCardState
  message: string
  /** A second line, e.g. "2 from last week". */
  detail: string | null
  href: string
  /** "Your self-evaluation for October is waiting", when it is. */
  selfReview: string | null
  /** For a lead: unread self-evaluations from their team. */
  leadNotices: string[]
}

const HREF = '/evaluations/weekly'
const DAY_MS = 24 * 60 * 60 * 1000
const shortDate = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })
const longDay = (date: Date) => date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })

/** This week's questions plus any carried over from earlier weeks (open, or answered this week). */
async function thisWeek(cycleId: string, evaluatorId: string, week: number, weekStart: Date) {
  const prompts = await prisma.weeklyPrompt.findMany({
    where: { cycleId, evaluatorId, kind: 'STANDARD', weekIndex: { lte: week }, status: { notIn: ['CANCELLED', 'EXPIRED'] } },
    select: { weekIndex: true, status: true, updatedAt: true, response: { select: { submittedAt: true } } },
  })
  const isOpen = (p: { status: string }) => p.status === 'OPEN' || p.status === 'DRAFT'
  // When it was dealt with: the answer's time, or the status change for "not observed".
  const handledAt = (p: (typeof prompts)[number]) => p.response?.submittedAt ?? p.updatedAt
  const current = prompts.filter((p) => p.weekIndex === week)
  const carried = prompts.filter((p) => p.weekIndex < week && (isOpen(p) || handledAt(p) >= weekStart))
  const all = [...current, ...carried]
  return { total: all.length, done: all.filter((p) => !isOpen(p)).length, carried: carried.length, open: all.filter(isOpen).length }
}

export async function evaluationsCard(actor: WeeklyActor, now: Date): Promise<EvaluationsCardView | null> {
  const row = await prisma.weeklyCycle.findFirst({ orderBy: { weekOneStartsOn: 'desc' }, select: { id: true } })
  if (!row) return null
  const cycle = await loadCycle(row.id)
  const period = await prisma.evaluationPeriod.findUniqueOrThrow({ where: { id: cycle.periodId }, select: { name: true, preEvaluationTriggeredAt: true } })
  const stage = roundStage({ cycleStatus: cycle.status, reviewOpenedAt: period.preEvaluationTriggeredAt, resultsPublishedAt: cycle.resultsPublishedAt })
  const leadNotices = (await teamSelfReviews(actor)).items.filter((i) => !i.readAt).map((i) => `${i.person.name} has submitted their self-evaluation for ${i.monthName}`)
  const base = { href: HREF, selfReview: null, leadNotices }
  if (stage === 'DRAFT') return null
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
  const progress = await thisWeek(cycle.id, actor.id, week, weekStart)
  const self = (await mySelfReview(actor, now)).current
  const selfReview = self ? `Your self-evaluation for ${self.monthName} is waiting` : null
  if (progress.open === 0) return { ...base, selfReview, state: 'CAUGHT_UP', message: 'All caught up. Next questions Monday', detail: null }
  const sunday = new Date(weekStart.getTime() + 6 * DAY_MS)
  return {
    ...base, selfReview, state: 'THIS_WEEK',
    message: `This week: ${progress.done} of ${progress.total} done, due ${longDay(sunday)}`,
    detail: progress.carried ? `${progress.carried} from last week` : null,
  }
}
