import { prisma } from '@/lib/db'
import type { StructuredModel } from '../ai/model'
import { resolveActiveModel } from './ai-settings'
import { cycleWeeks, karachiWeekday, questionWeekCount, weekIndexAt } from '../calendar'
import { findRunningCycle, type CycleWithPeriod } from './cycles'
import { formsOpenFor } from './forms'
import { deliverSafely, formsOpenMessages, lowEvidenceMessages, questionRecipients, sendQuestionEmails, type WeeklyEmailMessage, type WeeklySendMail, type WeeklySendResult } from './notifications'
import { remindStaleMappingRequests } from './peer-requests'
import { remindUnreadSelfReviews } from './self-review'
import { scrubSmallDepartments } from './survey'
import { releaseWeek, type ReleaseSummary } from './release'
import { announceRoundClosed, behindMessages, hrDigestMessages, joinerMessages, reviewReminderMessages, roundClosesOn, roundOpenedMessages } from './round-notices'
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
  /** People reminded to check their lists 2 working days before a round's review stage ends. */
  reviewReminders: WeeklySendResult | null
}

const SUNDAY = 0
const MONDAY = 1
const WEDNESDAY = 3
/** The cron has 300 s: scoring gets 120 s, with one model call possibly still in flight, before the digests. */
export const DAILY_SCORING_BUDGET_MS = 120_000

/** Spec 8.2: HR is emailed the low-evidence list two question weeks before questions stop (week 10 of 13). */
export function lowEvidenceWeek(total: number): number {
  return Math.max(1, questionWeekCount(total) - 1)
}

/**
 * The week is released on every run, not only on Mondays: releaseWeek is idempotent per evaluator, so a failed
 * Monday run or a cycle started mid-week is caught up the next day, and leavers are cancelled within a day.
 * Emails follow the spec's week (section 13): the questions on Monday (in the final week, how many are left instead),
 * and "due today" on Sunday. Nothing in between, apart from questions a catch-up release has just given someone.
 */
async function releaseAndAnnounce(cycle: CycleWithPeriod, week: number, total: number, now: Date, send: WeeklySendMail, appUrl: string): Promise<{ released: ReleaseSummary; emails: WeeklySendResult | null }> {
  const released = await releaseWeek(cycle.id, week, now)
  const weekday = karachiWeekday(now)
  const recipients = await questionRecipients(cycle.id, week)
  // The key spans the cycle week, so nobody gets this week's questions email twice.
  const scope = `${cycle.id}:week-${week}`
  if (weekday === MONDAY) {
    const emails = week === total
      ? await sendQuestionEmails('weekly-final-week', recipients, now, send, appUrl, { scope, closesOn: roundClosesOn(cycle) })
      : await sendQuestionEmails('weekly-questions', recipients, now, send, appUrl, { scope })
    return { released, emails }
  }
  const fresh = released.promptsCreated > 0 ? recipients.filter((r) => r.newCount > 0) : []
  const questions = fresh.length ? await sendQuestionEmails('weekly-questions', fresh, now, send, appUrl, { scope }) : null
  const due = weekday === SUNDAY ? await sendQuestionEmails('weekly-due-today', recipients, now, send, appUrl) : null
  return { released, emails: questions && due ? addResults(questions, due) : questions ?? due }
}

function addResults(a: WeeklySendResult, b: WeeklySendResult): WeeklySendResult {
  return { sent: a.sent + b.sent, recorded: a.recorded + b.recorded, skipped: a.skipped + b.skipped, failed: a.failed + b.failed }
}

/** Closed rounds are announced again for this long, so a failed "closed" email is sent by a later run. */
const CLOSED_CATCH_UP_MS = 7 * 24 * 60 * 60 * 1000

/** A builder that throws is logged and skipped, so one failing email never stops the release, scoring or the others. */
async function built(label: string, build: () => Promise<WeeklyEmailMessage[]>): Promise<WeeklyEmailMessage[]> {
  try {
    return await build()
  } catch (error) {
    console.error(`[weekly] could not build the ${label} emails`, { error })
    return []
  }
}

/**
 * While the round runs. Each email is due from its day for the rest of the cycle week (the key spans the week), so a
 * missed or failed run is caught up: "behind" from Wednesday, HR's digest from Monday (from week 2). Late joiners' leads
 * any day.
 */
async function roundNoticeMessages(cycle: CycleWithPeriod, week: number, total: number, now: Date, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const weekday = karachiWeekday(now)
  const fromWednesday = weekday === SUNDAY || weekday >= WEDNESDAY
  return [
    ...(fromWednesday ? await built('behind', () => behindMessages(cycle, week, appUrl)) : []),
    ...(week >= 2 ? await built('HR digest', () => hrDigestMessages(cycle, week, lowEvidenceWeek(total), appUrl)) : []),
    ...(await built('late joiner', () => joinerMessages(cycle, week, now, appUrl))),
  ]
}

/** Only a round HR opened from the round page was announced; one started any other way (test tools) never is. */
async function openedByHr(cycleId: string): Promise<boolean> {
  return (await prisma.weeklyAuditEvent.count({ where: { cycleId, action: 'ROUND_OPEN' } })) > 0
}

/** "Closed" emails for rounds closed in the last week; deliverOnce skips everyone already told. */
async function announceRecentlyClosed(now: Date, send: WeeklySendMail, appUrl: string): Promise<void> {
  const closed = await prisma.weeklyCycle.findMany({ where: { status: 'CLOSED', closedAt: { gte: new Date(now.getTime() - CLOSED_CATCH_UP_MS) } }, select: { id: true } })
  for (const { id } of closed) {
    await announceRoundClosed(id, send, appUrl).catch((error: unknown) => console.error('[weekly] round closed emails failed', { cycleId: id, error }))
  }
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
  const reviewReminderList = await built('review reminder', () => reviewReminderMessages(now, appUrl))
  const reviewReminders = reviewReminderList.length ? await deliverSafely('review reminder', () => reviewReminderList, send) : null
  await announceRecentlyClosed(now, send, appUrl)
  const cycle = await findRunningCycle()
  if (!cycle) return { cycleId: null, week: null, released: null, emails: null, scoring: null, digests: null, mappingReminders, selfReviewReminders, reviewReminders }
  const week = weekIndexAt(cycle.weekOneStartsOn, now)
  const total = cycleWeeks(cycle)
  // Once HR locks the quarter nothing can be answered, so nothing is released or reminded.
  const locked = (await prisma.evaluationPeriod.findUnique({ where: { id: cycle.periodId }, select: { isLocked: true } }))?.isLocked ?? false
  const running = !locked && week >= 1 && week <= total
  const { released, emails } = running ? await releaseAndAnnounce(cycle, week, total, now, send, appUrl) : { released: null, emails: null }
  const model = options.model !== undefined ? options.model : await resolveActiveModel()
  const scoring = await runScoring({ model, budgetMs: DAILY_SCORING_BUDGET_MS })
  const messages = [
    ...(week === lowEvidenceWeek(total) ? await lowEvidenceMessages(cycle.id, appUrl) : []),
    ...(!locked && formsOpenFor(cycle, now) ? await built('forms open', () => formsOpenMessages(cycle, now, appUrl)) : []),
    ...(running ? await roundNoticeMessages(cycle, week, total, now, appUrl) : []),
    // "Started" is sent when HR opens the round; this catches up anyone that send missed.
    ...(!locked && week <= 1 && (await openedByHr(cycle.id)) ? await built('round opened', () => roundOpenedMessages(cycle, now, appUrl)) : []),
  ]
  const digests = messages.length > 0 ? await deliverSafely('daily', () => messages, send) : null
  return { cycleId: cycle.id, week, released, emails, scoring, digests, mappingReminders, selfReviewReminders, reviewReminders }
}
