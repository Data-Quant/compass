import type { StructuredModel } from '../ai/model'
import { karachiWeekday, questionWeekCount, totalWeeks, weekIndexAt } from '../calendar'
import { resolveActiveModel } from './ai-settings'
import { CALIBRATION_DAILY_BUDGET_MS, continueCalibrationRuns, type CalibrationProgress, type ModelResolver } from './calibration-runs'
import { findRunningCycle } from './cycles'
import { autoAcceptDue } from './decisions'
import { formsOpenFor } from './forms'
import {
  deliverOnce, followUpMessages, formsOpenMessages, lengthBiasMessages, lowEvidenceMessages, questionRecipients, scoringFailedMessages, sendQuestionEmails,
  type WeeklySendMail, type WeeklySendResult,
} from './notifications'
import { releaseWeek, type ReleaseSummary } from './release'
import { runScoring, type ScoringRunSummary } from './scoring'

export interface WeeklyDailyResult {
  cycleId: string | null
  week: number | null
  released: ReleaseSummary | null
  emails: WeeklySendResult | null
  scoring: ScoringRunSummary | null
  autoAccepted: number
  digests: WeeklySendResult | null
  calibration: CalibrationProgress[]
}

const MONDAY = 1
const THURSDAY = 4
/**
 * The cron has 300 s: live scoring gets 120 s and calibration runs 45 s, each with one model call (45 s) possibly
 * still in flight, which leaves room for the release, question emails and digests.
 */
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
  if (weekday === MONDAY || catchingUp) {
    const recipients = await questionRecipients(cycleId, week)
    // Monday tells everyone with open questions; a later catch-up release tells only the people who just got new ones.
    // The key spans the cycle week, so nobody gets this week's questions email twice.
    const emails = await sendQuestionEmails(
      'weekly-questions', catchingUp ? recipients.filter((r) => r.newCount > 0) : recipients, now, send, appUrl, undefined, `${cycleId}:week-${week}`,
    )
    return { released, emails }
  }
  if (weekday === THURSDAY) return { released, emails: await sendQuestionEmails('weekly-reminder', await questionRecipients(cycleId, week), now, send, appUrl) }
  return { released, emails: null }
}

/**
 * 04:00 UTC = 09:00 Karachi. Accepts what is due first, so slots satisfied since yesterday are not asked again;
 * then the release and question emails, so a slow scoring backlog can never delay or cut off the week's questions;
 * then scores what is waiting; then continues calibration runs; then the digests, which include today's follow-ups,
 * scoring failures and the month's length check. Calibration runs continue even when no quarter is running.
 * Uses the calendar week only; the preview's simulated week never affects production.
 */
export async function runWeeklyDailyJob(
  send: WeeklySendMail,
  appUrl: string,
  now: Date = new Date(),
  options: { model?: StructuredModel | null; resolveModel?: ModelResolver } = {},
): Promise<WeeklyDailyResult> {
  // Advances in real time from `now`, so leases stay honest during a long run and tests stay deterministic.
  const started = Date.now()
  const clock = () => new Date(now.getTime() + (Date.now() - started))
  const calibrate = () => continueCalibrationRuns(CALIBRATION_DAILY_BUDGET_MS, { resolveModel: options.resolveModel, clock })
  const cycle = await findRunningCycle()
  if (!cycle) return { cycleId: null, week: null, released: null, emails: null, scoring: null, autoAccepted: 0, digests: null, calibration: await calibrate() }
  const model = options.model !== undefined ? options.model : await resolveActiveModel()
  const { accepted } = await autoAcceptDue(clock(), { cycleId: cycle.id })
  const week = weekIndexAt(cycle.weekOneStartsOn, now)
  const total = totalWeeks(cycle.weekOneStartsOn, cycle.period.endDate)
  const { released, emails } = week >= 1 && week <= total ? await releaseAndAnnounce(cycle.id, week, now, send, appUrl) : { released: null, emails: null }
  const scoring = await runScoring({ model, budgetMs: DAILY_SCORING_BUDGET_MS, clock })
  const calibration = await calibrate()
  const messages = [
    ...(await followUpMessages(cycle.id, now, appUrl)),
    ...(await scoringFailedMessages(cycle.id, now, appUrl)),
    ...(week === lowEvidenceWeek(total) ? await lowEvidenceMessages(cycle.id, appUrl) : []),
    ...(formsOpenFor(cycle, now) ? await formsOpenMessages(cycle, appUrl) : []),
    ...(await lengthBiasMessages(cycle, now, appUrl)),
  ]
  const digests = messages.length > 0 ? await deliverOnce(messages, send) : null
  return { cycleId: cycle.id, week, released, emails, scoring, autoAccepted: accepted, digests, calibration }
}
