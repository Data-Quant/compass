/**
 * Read-only verification for the payroll employee-history + offboarding feature.
 * Confirms (a) the offboarded cohort resolves against real data and (b) the
 * history endpoint's assembly produces sensible month-by-month breakdowns for a
 * sample active and offboarded employee. Writes nothing.
 * Usage: npx tsx scripts/verify-employee-history-offboarding.ts
 */
import { prisma } from '../lib/db'
import {
  isEligiblePayrollEmployee,
  isOffboardedPayrollEmployee,
  type PayrollEligibilityUser,
} from '../lib/payroll/employee-eligibility'
import { buildEmployeePayrollHistory } from '../lib/payroll/employee-history'

async function assembleHistory(userId: string, name: string) {
  const mappings = await prisma.payrollIdentityMapping.findMany({
    where: { userId },
    select: { displayPayrollName: true },
  })
  const knownNames = Array.from(
    new Set([name, ...mappings.map((m) => m.displayPayrollName)].filter(Boolean) as string[])
  )
  const rowFilter = { OR: [{ userId }, { userId: null, payrollName: { in: knownNames } }] }

  const [inputRows, computedRows, receipts] = await Promise.all([
    prisma.payrollInputValue.findMany({ where: rowFilter, select: { periodId: true, componentKey: true, amount: true } }),
    prisma.payrollComputedValue.findMany({ where: rowFilter, select: { periodId: true, metricKey: true, amount: true } }),
    prisma.payrollReceipt.findMany({ where: rowFilter, select: { periodId: true, id: true, status: true, receiptJson: true } }),
  ])
  const periodIds = Array.from(
    new Set([...inputRows.map((r) => r.periodId), ...computedRows.map((r) => r.periodId), ...receipts.map((r) => r.periodId)])
  )
  const periods = periodIds.length
    ? await prisma.payrollPeriod.findMany({ where: { id: { in: periodIds } }, select: { id: true, label: true, periodStart: true, status: true } })
    : []
  return buildEmployeePayrollHistory({ periods, inputRows, computedRows, receipts })
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      department: true,
      position: true,
      payrollProfile: {
        select: {
          isPayrollActive: true,
          exitDate: true,
          designation: true,
          department: { select: { name: true } },
          employmentType: { select: { name: true } },
        },
      },
    },
  })

  const active = users.filter((u) => isEligiblePayrollEmployee(u as PayrollEligibilityUser))
  const offboarded = users.filter((u) => isOffboardedPayrollEmployee(u as PayrollEligibilityUser))

  console.log(`Total users: ${users.length}`)
  console.log(`Active payroll cohort: ${active.length}`)
  console.log(`Offboarded payroll cohort: ${offboarded.length}\n`)

  console.log('=== Offboarded employees ===')
  if (offboarded.length === 0) console.log('  (none)')
  for (const u of offboarded) {
    const exit = u.payrollProfile?.exitDate ? new Date(u.payrollProfile.exitDate).toISOString().slice(0, 10) : 'no exit date'
    console.log(`  ${u.name}  —  exit: ${exit}`)
  }

  const samples = [
    { label: 'ACTIVE', user: active[0] },
    { label: 'OFFBOARDED', user: offboarded[0] },
  ]

  for (const { label, user } of samples) {
    if (!user) {
      console.log(`\n=== ${label} sample: none available ===`)
      continue
    }
    const history = await assembleHistory(user.id, user.name || '')
    console.log(`\n=== ${label} sample: ${user.name} — ${history.length} month(s) of history ===`)
    for (const month of history.slice(0, 3)) {
      console.log(`  ${month.periodLabel} [${month.periodStatus}]  net=${month.totals.netSalary}  receipt=${month.receipt ? month.receipt.status : 'none'}`)
      for (const li of month.lineItems) {
        console.log(`      ${li.kind === 'DEDUCTION' ? '-' : '+'} ${li.label}: ${li.amount}`)
      }
    }
    if (history.length > 3) console.log(`  ...and ${history.length - 3} more month(s)`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
