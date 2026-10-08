import { prisma } from '@/lib/db'
import type { StructuredModel } from '../ai/model'
import { resolveActiveModel } from './ai-settings'
import { cycleWeeks, karachiWeekday, questionWeekCount, weekIndexAt } from '../calendar'
import { findRunningCycle } from './cycles'
import { formsOpenFor } from './forms'
import { deliverOnce, formsOpenMessages, lowEvidenceMessages, questionRecipients, sendQuestionEmails, type WeeklySendMail, type WeeklySendResult } from './notifications'
import { remindStaleMappingRequests } from './peer-requests'
import { remindUnreadSelfReviews } from './self-review'
import { scrubSmallDepartments } from './survey'
import { releaseWeek, type ReleaseSummary } from './release'
import { runScoring, type ScoringRunSummary } from './scoring'

export interface WeeklyDailyResult {
  cycleId: string | null
  week: number | null
  released: ReleaseSummary | null
  emails: WeeklySendResult | null
  /** Answers the model scored on this run (anything missed after submitting). */
  scoring: ScoringRunSummary | null
  digests: WeeklySendResult | null
  /** Leads reminded about peer changes waiting 2 working days; a round in review has no running cycle yet. */
  mappingReminders: WeeklySendResult | null
  /** Leads reminded about self-evaluations unread after 5 working days. */
  selfReviewReminders: WeeklySendResult | null
}

const MONDAY = 1
/** The cron has 300 s: scoring gets 120 s, with one model call possibly still in flight, before the digests. */
export const DAILY_SCORING_BUDGET_MS = 120_000

/** Spec 8.2: HR is emailed the low-evidence list two question weeks before questions stop (week 10 of 13). */
export function lowEvidenceWeek(total: number): number {
  return Math.max(1, questionWeekCount(total) - 1)
}

/**
 * The week is released on every run, not only on Mondays: releaseWeek is idempotent per evaluator, so a failed
 * Monday run or a cycle started mid-week is caught up the next day, and leavers are cancelled within a day.
 */
async function releaseAndAnnounce(cycleId: string, week: number, now: Date, send: WeeklySendMail, appUrl: string): Promise<{ released: ReleaseSummary; emails: WeeklySendResult | null }> {
  const released = await releaseWeek(cycleId, week, now)
  const weekday = karachiWeekday(now)
  const catchingUp = weekday !== MONDAY && released.promptsCreated > 0
  const recipients = await questionRecipients(cycleId, week)
  if (weekday === MONDAY) {
    // The key spans the cycle week, so nobody gets this week's questions email twice.
    return { released, emails: await sendQuestionEmails('weekly-questions', recipients, now, send, appUrl, undefined, `${cycleId}:week-${week}`) }
  }
  // Every other day: anyone with unanswered questions gets one reminder a day. A catch-up release tells the people who
  // just got new questions with the questions email instead.
  const fresh = catchingUp ? recipients.filter((r) => r.newCount > 0) : []
  const questions = fresh.length ? await sendQuestionEmails('weekly-questions', fresh, now, send, appUrl, undefined, `${cycleId}:week-${week}`) : null
  const reminders = await sendQuestionEmails('weekly-reminder', recipients.filter((r) => !fresh.includes(r)), now, send, appUrl)
  return { released, emails: questions ? addResults(questions, reminders) : reminders }
}

function addResults(a: WeeklySendResult, b: WeeklySendResult): WeeklySendResult {
  return { sent: a.sent + b.sent, recorded: a.recorded + b.recorded, skipped: a.skipped + b.skipped, failed: a.failed + b.failed }
}

/**
 * 04:00 UTC = 09:00 Karachi. Reminds leads about peer changes first (a round in review has no running cycle), then
 * releases the week and sends the question emails, then scores answers the model has not scored yet (most are scored
 * right after they are given), then HR's digests. Uses the calendar week only; the preview's simulated week never
 * affects production.
 */
export async function runWeeklyDailyJob(send: WeeklySendMail, appUrl: string, now: Date = new Date(), options: { model?: StructuredModel | null } = {}): Promise<WeeklyDailyResult> {
  const mappingReminders = await remindStaleMappingRequests(now, send, appUrl)
  // Anonymous sentiment answers from small departments lose their department once their week is over.
  await scrubSmallDepartments(now)
  const selfReviewReminders = await remindUnreadSelfReviews(now, send, appUrl)
  const cycle = await findRunningCycle()
  if (!cycle) return { cycleId: null, week: null, released: null, emails: null, scoring: null, digests: null, mappingReminders, selfReviewReminders }
  const week = weekIndexAt(cycle.weekOneStartsOn, now)
  const total = cycleWeeks(cycle)
  // Once HR locks the quarter nothing can be answered, so nothing is released or reminded.
  const locked = (await prisma.evaluationPeriod.findUnique({ where: { id: cycle.periodId }, select: { isLocked: true } }))?.isLocked ?? false
  const { released, emails } = !locked && week >= 1 && week <= total ? await releaseAndAnnounce(cycle.id, week, now, send, appUrl) : { released: null, emails: null }
  const model = options.model !== undefined ? options.model : await resolveActiveModel()
  const scoring = await runScoring({ model, budgetMs: DAILY_SCORING_BUDGET_MS })
  const messages = [
    ...(week === lowEvidenceWeek(total) ? await lowEvidenceMessages(cycle.id, appUrl) : []),
    ...(!locked && formsOpenFor(cycle, now) ? await formsOpenMessages(cycle, now, appUrl) : []),
  ]
  const digests = messages.length > 0 ? await deliverOnce(messages, send) : null
  return { cycleId: cycle.id, week, released, emails, scoring, digests, mappingReminders, selfReviewReminders }
}
