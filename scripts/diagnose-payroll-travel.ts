/**
 * Read-only diagnostic for travel allowance + WHT issues.
 * Usage: npx tsx scripts/diagnose-payroll-travel.ts
 */
import { prisma } from '../lib/db'
import { resolveTravelTier, calculateWorkingDays, calculatePresentDays } from '../lib/payroll/settings'
import { normalizePayrollName } from '../lib/payroll/normalizers'

async function main() {
  const period = await prisma.payrollPeriod.findFirst({
    orderBy: { periodStart: 'desc' },
    select: { id: true, label: true, status: true, periodStart: true, periodEnd: true },
  })
  if (!period) {
    console.log('No payroll periods found')
    return
  }
  console.log('PERIOD:', period.label, period.status, period.periodStart.toISOString(), '->', period.periodEnd.toISOString())

  const tiers = await prisma.payrollTravelAllowanceTier.findMany({ orderBy: [{ transportMode: 'asc' }, { minKm: 'asc' }] })
  console.log('\nTRAVEL TIERS (all):', tiers.length)
  for (const t of tiers) {
    console.log(
      ` ${t.transportMode} ${t.minKm}-${t.maxKm ?? '∞'}km rate=${t.monthlyRate} active=${t.isActive} from=${t.effectiveFrom.toISOString().slice(0, 10)} to=${t.effectiveTo ? t.effectiveTo.toISOString().slice(0, 10) : 'null'}`
    )
  }

  // Same filter the engine uses
  const engineTiers = await prisma.payrollTravelAllowanceTier.findMany({
    where: {
      isActive: true,
      effectiveFrom: { lte: period.periodEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.periodStart } }],
    },
    orderBy: [{ transportMode: 'asc' }, { minKm: 'asc' }],
  })
  console.log('\nTIERS PASSING ENGINE QUERY:', engineTiers.length)

  const holidays = await prisma.payrollPublicHoliday.findMany({
    where: { holidayDate: { gte: period.periodStart, lte: period.periodEnd } },
    select: { holidayDate: true },
  })
  const workingDays = calculateWorkingDays({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    holidays: holidays.map((h) => h.holidayDate),
  })
  console.log('WORKING DAYS:', workingDays, '(holidays in period:', holidays.length, ')')

  const inputs = await prisma.payrollInputValue.findMany({ where: { periodId: period.id } })
  const byName = new Map<string, typeof inputs>()
  for (const row of inputs) {
    const list = byName.get(row.payrollName) || []
    list.push(row)
    byName.set(row.payrollName, list)
  }
  console.log('\nEMPLOYEES WITH INPUT ROWS:', byName.size)

  const mappings = await prisma.payrollIdentityMapping.findMany({ select: { normalizedPayrollName: true, userId: true } })
  const mapByNorm = new Map(mappings.map((m) => [m.normalizedPayrollName, m.userId]))

  const profiles = await prisma.payrollEmployeeProfile.findMany({
    select: { userId: true, distanceKm: true, transportMode: true },
  })
  const profByUser = new Map(profiles.map((p) => [p.userId, p]))

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
  console.log('ATTENDANCE ENTRIES IN PERIOD:', attendance.length, 'for', attByUser.size, 'users')

  console.log('\nPER-EMPLOYEE TRAVEL DIAGNOSIS:')
  for (const [name, rows] of byName.entries()) {
    const userId = rows.find((r) => r.userId)?.userId || mapByNorm.get(normalizePayrollName(name)) || null
    const travelRow = rows.find((r) => r.componentKey === 'TRAVEL_REIMBURSEMENT')
    const prof = userId ? profByUser.get(userId) : undefined
    const att = userId ? attByUser.get(userId) || [] : []
    const present = att.length > 0 ? calculatePresentDays(att, period.periodStart, period.periodEnd) : null
    let tierInfo = 'n/a'
    if (prof) {
      const tier = resolveTravelTier(engineTiers, prof.transportMode, prof.distanceKm ?? null, period.periodStart)
      tierInfo = tier ? `rate=${tier.monthlyRate}` : 'NO TIER MATCH'
    }
    console.log(
      ` ${name} | userId=${userId ? 'yes' : 'NO'} | profile=${prof ? `${prof.transportMode}/${prof.distanceKm}km` : 'MISSING'} | tier=${tierInfo} | attEntries=${att.length} present=${present ?? '-'} | travelInput=${travelRow ? `${travelRow.amount} override=${travelRow.isOverride} src=${travelRow.sourceMethod}` : 'none'}`
    )
  }

  // WHT context: financial year + brackets in effect
  const fy = await prisma.payrollFinancialYear.findFirst({
    where: { startDate: { lte: period.periodStart }, endDate: { gte: period.periodStart } },
    include: { taxBrackets: { orderBy: { orderIndex: 'asc' } } },
    orderBy: { isActive: 'desc' },
  })
  console.log('\nFINANCIAL YEAR FOR PERIOD:', fy ? `${fy.label} (brackets: ${fy.taxBrackets.length})` : 'NONE — falls back to hardcoded slabs')
  if (fy) {
    for (const b of fy.taxBrackets) {
      console.log(` ${b.incomeFrom} - ${b.incomeTo ?? '∞'}: fixed=${b.fixedTax} rate=${b.taxRate}`)
    }
  }

  // Sample WHT comparison for employees with computed values
  const computed = await prisma.payrollComputedValue.findMany({
    where: { periodId: period.id, metricKey: 'TOTAL_TAXABLE_SALARY' },
    select: { payrollName: true, amount: true },
  })
  console.log('\nTOTAL_TAXABLE_SALARY computed rows:', computed.length)
  for (const c of computed.slice(0, 5)) {
    const rows = byName.get(c.payrollName) || []
    const basic = rows.filter((r) => r.componentKey === 'BASIC_SALARY').reduce((s, r) => s + r.amount, 0)
    const medical = rows.filter((r) => r.componentKey === 'MEDICAL_ALLOWANCE').reduce((s, r) => s + r.amount, 0)
    const taxRow = rows.find((r) => r.componentKey === 'INCOME_TAX')
    console.log(
      ` ${c.payrollName}: taxableSalary=${c.amount} basic=${basic} medical=${medical} incomeTaxInput=${taxRow ? `${taxRow.amount} override=${taxRow.isOverride}` : 'none'}`
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
