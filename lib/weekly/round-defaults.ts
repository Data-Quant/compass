// What the "Set up round" form starts with (UX spec, HR step 1): the next calendar quarter, week 1 on its first Monday,
// and as many question weeks as fit before the catch-up weeks. HR can change any of it.
import { karachiCalendarDate } from '../kpi/calendar'
import { defaultQuestionWeeks, startOfKarachiDay } from './calendar'

export interface RoundDefaults { name: string; startDate: string; endDate: string; weekOneStartsOn: string; questionWeeks: number }

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function nextRoundDefaults(today: Date): RoundDefaults {
  const now = karachiCalendarDate(today)
  const quarter = Math.floor((now.month - 1) / 3) + 1
  const next = quarter === 4 ? { year: now.year + 1, quarter: 1 } : { year: now.year, quarter: quarter + 1 }
  const firstMonth = (next.quarter - 1) * 3
  const start = new Date(Date.UTC(next.year, firstMonth, 1))
  const end = new Date(Date.UTC(next.year, firstMonth + 3, 0))
  // 1 = Monday: days until the first Monday on or after the quarter starts.
  const toMonday = (8 - start.getUTCDay()) % 7
  const monday = new Date(Date.UTC(next.year, firstMonth, 1 + toMonday))
  const weekOne = startOfKarachiDay({ year: monday.getUTCFullYear(), month: monday.getUTCMonth() + 1, day: monday.getUTCDate() })
  const lastDay = startOfKarachiDay({ year: end.getUTCFullYear(), month: end.getUTCMonth() + 1, day: end.getUTCDate() })
  return {
    name: `Q${next.quarter} ${next.year}`, startDate: iso(start), endDate: iso(end), weekOneStartsOn: iso(monday),
    questionWeeks: defaultQuestionWeeks(weekOne, lastDay),
  }
}
