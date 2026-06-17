/**
 * Verify that adding a public holiday reduces a period's working days.
 * Self-reverting: removes the test holiday at the end. Usage: npx tsx ...
 */
import { prisma } from '../lib/db'
import { calculateWorkingDays, eachDayBetween } from '../lib/payroll/settings'

async function workingDaysFor(periodStart: Date, periodEnd: Date) {
  const holidays = await prisma.payrollPublicHoliday.findMany({
    where: { holidayDate: { gte: periodStart, lte: periodEnd } },
    select: { holidayDate: true },
  })
  return calculateWorkingDays({ periodStart, periodEnd, holidays: holidays.map((h) => h.holidayDate) })
}

async function main() {
  const period = await prisma.payrollPeriod.findFirst({
    orderBy: { periodStart: 'desc' },
    select: { label: true, periodStart: true, periodEnd: true },
  })
  if (!period) throw new Error('No period found')

  // Find a weekday in the period not already a holiday.
  const existing = await prisma.payrollPublicHoliday.findMany({
    where: { holidayDate: { gte: period.periodStart, lte: period.periodEnd } },
    select: { holidayDate: true },
  })
  const existingKeys = new Set(existing.map((h) => h.holidayDate.toISOString().slice(0, 10)))
  const candidate = eachDayBetween(period.periodStart, period.periodEnd).find((d) => {
    const dow = d.getUTCDay()
    return dow !== 0 && dow !== 6 && !existingKeys.has(d.toISOString().slice(0, 10))
  })
  if (!candidate) throw new Error('No free weekday in period to test with')

  const before = await workingDaysFor(period.periodStart, period.periodEnd)
  console.log(`PERIOD: ${period.label} | working days before: ${before}`)
  console.log(`Adding test holiday on ${candidate.toISOString().slice(0, 10)} (a weekday)...`)

  const created = await prisma.payrollPublicHoliday.create({
    data: { holidayDate: candidate, name: '__verify_holiday__' },
    select: { id: true },
  })
  try {
    const after = await workingDaysFor(period.periodStart, period.periodEnd)
    console.log(`Working days after: ${after}`)
    console.log(after === before - 1 ? 'PASS: working days dropped by exactly 1' : `FAIL: expected ${before - 1}, got ${after}`)
  } finally {
    await prisma.payrollPublicHoliday.delete({ where: { id: created.id } })
    const restored = await workingDaysFor(period.periodStart, period.periodEnd)
    console.log(`Cleaned up test holiday. Working days restored: ${restored}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
