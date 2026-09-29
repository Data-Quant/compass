import { karachiWeekday, totalWeeks, weekIndexAt } from '../calendar'
import { findRunningCycle } from './cycles'
import { questionRecipients, sendQuestionEmails, type WeeklySendMail, type WeeklySendResult } from './notifications'
import { releaseWeek, type ReleaseSummary } from './release'

export interface WeeklyDailyResult { cycleId: string | null; week: number | null; released: ReleaseSummary | null; emails: WeeklySendResult | null }

const MONDAY = 1
const THURSDAY = 4

/** 04:00 UTC = 09:00 Karachi. Uses the calendar week only; the preview's simulated week never affects production. */
export async function runWeeklyDailyJob(send: WeeklySendMail, appUrl: string, now: Date = new Date()): Promise<WeeklyDailyResult> {
  const cycle = await findRunningCycle()
  if (!cycle) return { cycleId: null, week: null, released: null, emails: null }
  const week = weekIndexAt(cycle.weekOneStartsOn, now)
  const total = totalWeeks(cycle.weekOneStartsOn, cycle.period.endDate)
  const idle: WeeklyDailyResult = { cycleId: cycle.id, week, released: null, emails: null }
  if (week < 1 || week > total) return idle
  const weekday = karachiWeekday(now)
  if (weekday === MONDAY) {
    const released = await releaseWeek(cycle.id, week, now)
    const emails = await sendQuestionEmails('weekly-questions', await questionRecipients(cycle.id, week), now, send, appUrl)
    return { ...idle, released, emails }
  }
  if (weekday === THURSDAY) {
    const emails = await sendQuestionEmails('weekly-reminder', await questionRecipients(cycle.id, week), now, send, appUrl)
    return { ...idle, emails }
  }
  return idle
}
