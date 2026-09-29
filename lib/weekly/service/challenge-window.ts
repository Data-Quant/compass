import { prisma } from '@/lib/db'
import { holidayAppliesTo } from '@/lib/holidays'
import { karachiCalendarDate, type CalendarDate } from '../../kpi/calendar'
import { addWorkingDays, CHALLENGE_WORKING_DAYS } from '../working-days'

const DAY_MS = 24 * 60 * 60 * 1000

/** Pakistan public holidays from payroll (company-wide or tagged PAKISTAN) in the 60 days after `from`. */
export async function pakistanHolidays(from: Date): Promise<CalendarDate[]> {
  const rows = await prisma.payrollPublicHoliday.findMany({
    where: { holidayDate: { gte: new Date(from.getTime() - DAY_MS), lte: new Date(from.getTime() + 60 * DAY_MS) } },
    select: { holidayDate: true, teamTags: true },
  })
  return rows.filter((h) => holidayAppliesTo(h, 'PAKISTAN')).map((h) => karachiCalendarDate(h.holidayDate))
}

export async function challengeDeadlineFor(publishedAt: Date): Promise<Date> {
  return addWorkingDays(publishedAt, CHALLENGE_WORKING_DAYS, await pakistanHolidays(publishedAt))
}
