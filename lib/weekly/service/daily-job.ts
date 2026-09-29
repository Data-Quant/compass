import { karachiWeekday, totalWeeks, weekIndexAt } from '../calendar'
import { findRunningCycle } from './cycles'
import { questionRecipients, sendQuestionEmails, type WeeklySendMail, type WeeklySendResult } from './notifications'
import { releaseWeek, type ReleaseSummary } from './release'

export interface WeeklyDailyResult { cycleId: string | null; week: number | null; released: ReleaseSummary | null; emails: WeeklySendResult | null }

const MONDAY = 1
const THURSDAY = 4

/**
 * 04:00 UTC = 09:00 Karachi. Uses the calendar week only; the preview's simulated week never affects production.
 * The week is released on every run, not only on Mondays: releaseWeek is idempotent per evaluator, so a failed
 * Monday run or a cycle started mid-week is caught up the next day, and leavers are cancelled within a day.
 */
export async function runWeeklyDailyJob(send: WeeklySendMail, appUrl: string, now: Date = new Date()): Promise<WeeklyDailyResult> {
  const cycle = await findRunningCycle()
  if (!cycle) return { cycleId: null, week: null, released: null, emails: null }
  const week = weekIndexAt(cycle.weekOneStartsOn, now)
  const total = totalWeeks(cycle.weekOneStartsOn, cycle.period.endDate)
  const idle: WeeklyDailyResult = { cycleId: cycle.id, week, released: null, emails: null }
  if (week < 1 || week > total) return idle
  const released = await releaseWeek(cycle.id, week, now)
  const weekday = karachiWeekday(now)
  const catchingUp = weekday !== MONDAY && released.promptsCreated > 0
  if (weekday === MONDAY || catchingUp) {
    const recipients = await questionRecipients(cycle.id, week)
    // Monday tells everyone with open questions; a later catch-up release tells only the people who just got new ones.
    // The key spans the cycle week, so nobody gets this week's questions email twice.
    const emails = await sendQuestionEmails(
      'weekly-questions', catchingUp ? recipients.filter((r) => r.newCount > 0) : recipients, now, send, appUrl, undefined, `${cycle.id}:week-${week}`,
    )
    return { ...idle, released, emails }
  }
  if (weekday === THURSDAY) {
    const emails = await sendQuestionEmails('weekly-reminder', await questionRecipients(cycle.id, week), now, send, appUrl)
    return { ...idle, released, emails }
  }
  return { ...idle, released }
}
