/**
 * Projects travel allowance per employee for the latest period, showing what
 * each person WOULD earn once a transport mode is set. Proves the >40km clamp
 * and gives HR a sanity-check table. Read-only.
 */
import { prisma } from '../lib/db'
import { resolveTravelTier, calculateWorkingDays, calculatePresentDays } from '../lib/payroll/settings'
import type { TransportMode } from '@prisma/client'

async function main() {
  const period = await prisma.payrollPeriod.findFirst({
    orderBy: { periodStart: 'desc' },
    select: { id: true, label: true, periodStart: true, periodEnd: true },
  })
  if (!period) throw new Error('No period')

  const tiers = await prisma.payrollTravelAllowanceTier.findMany({
    where: {
      isActive: true,
      effectiveFrom: { lte: period.periodEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.periodStart } }],
    },
  })
  const holidays = await prisma.payrollPublicHoliday.findMany({
    where: { holidayDate: { gte: period.periodStart, lte: period.periodEnd } },
    select: { holidayDate: true },
  })
  const workingDays = calculateWorkingDays({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    holidays: holidays.map((h) => h.holidayDate),
  })

  const profiles = await prisma.payrollEmployeeProfile.findMany({
    where: { distanceKm: { not: null } },
    select: { userId: true, distanceKm: true, transportMode: true, user: { select: { name: true } } },
  })

  const attendance = await prisma.payrollAttendanceEntry.findMany({
    where: { periodId: period.id },
    select: { userId: true, attendanceDate: true, status: true },
  })
  const attByUser = new Map<string, typeof attendance>()
  for (const a of attendance) {
    const list = attByUser.get(a.userId) || []
    list.push(a)
    attByUser.set(a.userId, list)
  }

  const project = (mode: TransportMode, distanceKm: number, present: number) => {
    const tier = resolveTravelTier(tiers, mode, distanceKm, period.periodEnd)
    if (!tier) return null
    return Math.round(Math.max(0, (tier.monthlyRate * Math.min(present, workingDays)) / workingDays))
  }

  console.log(`PERIOD: ${period.label} | working days: ${workingDays}\n`)
  console.log('Projected travel allowance once a transport mode is set (present days from marked attendance):')
  console.log('NAME'.padEnd(28), 'DIST'.padStart(5), 'PRESENT'.padStart(8), 'BIKE'.padStart(9), 'CAR/PUBLIC'.padStart(11))
  for (const p of profiles.sort((a, b) => (a.user?.name || '').localeCompare(b.user?.name || ''))) {
    const att = attByUser.get(p.userId) || []
    const dist = p.distanceKm!
    if (att.length === 0) {
      console.log(
        (p.user?.name || '?').padEnd(28),
        String(dist).padStart(5),
        'unmarked'.padStart(8),
        'attendance not marked — travel will not calculate'.padStart(9)
      )
      continue
    }
    const present = calculatePresentDays(att, period.periodStart, period.periodEnd)
    const bike = project('BIKE', dist, present)
    const car = project('CAR', dist, present)
    console.log(
      (p.user?.name || '?').padEnd(28),
      String(dist).padStart(5),
      String(present).padStart(8),
      (bike === null ? 'no tier' : bike.toLocaleString()).padStart(9),
      (car === null ? 'no tier' : car.toLocaleString()).padStart(11)
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
