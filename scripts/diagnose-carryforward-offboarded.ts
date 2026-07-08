/**
 * Read-only: simulate the fixed carry-forward against the latest real period to
 * confirm (a) offboarded/deleted employees are dropped and (b) only salary +
 * mobile allowance carry. Writes nothing.
 * Usage: npx tsx scripts/diagnose-carryforward-offboarded.ts [nameFragment]
 */
import { prisma } from '../lib/db'
import {
  CARRY_FORWARD_COMPONENT_KEYS,
  selectCarryForwardInputs,
  type CarryForwardEmployeeStatus,
} from '../lib/payroll/carry-forward'

const NAME = (process.argv[2] || 'mudassir').toLowerCase()

async function main() {
  // Use the most recent period as the carry-forward base; simulate into the next month.
  const basePeriod = await prisma.payrollPeriod.findFirst({
    orderBy: { periodStart: 'desc' },
    select: { id: true, label: true, periodStart: true },
  })
  if (!basePeriod) throw new Error('No payroll periods found')
  const targetStart = new Date(
    Date.UTC(basePeriod.periodStart.getUTCFullYear(), basePeriod.periodStart.getUTCMonth() + 1, 1)
  )
  console.log(
    `Base period: ${basePeriod.label} (${basePeriod.periodStart.toISOString().slice(0, 10)})  ->  target month start ${targetStart.toISOString().slice(0, 10)}\n`
  )

  const baseInputs = await prisma.payrollInputValue.findMany({
    where: { periodId: basePeriod.id },
    select: { payrollName: true, userId: true, componentKey: true, amount: true },
  })

  // Build the same employee-status map the fixed carryForwardPayrollPeriod uses.
  const referencedUserIds = [
    ...new Set(baseInputs.map((i) => i.userId).filter((id): id is string => Boolean(id))),
  ]
  const users = await prisma.user.findMany({
    where: { id: { in: referencedUserIds } },
    select: { id: true, payrollProfile: { select: { isPayrollActive: true, exitDate: true } } },
  })
  const statusByUserId = new Map<string, CarryForwardEmployeeStatus>(
    users.map((u) => [
      u.id,
      {
        exists: true,
        isPayrollActive: u.payrollProfile ? u.payrollProfile.isPayrollActive : true,
        exitDate: u.payrollProfile?.exitDate ?? null,
      },
    ])
  )
  const resolveStatus = (userId: string | null): CarryForwardEmployeeStatus | null => {
    if (!userId) return null
    return statusByUserId.get(userId) ?? { exists: false, isPayrollActive: false, exitDate: null }
  }

  const carried = selectCarryForwardInputs(baseInputs, resolveStatus, targetStart)

  const salaryRows = baseInputs.filter((i) => CARRY_FORWARD_COMPONENT_KEYS.has(i.componentKey))
  const droppedOffboarded = salaryRows.filter((i) => !carried.includes(i))

  console.log(`Base input rows: ${baseInputs.length}`)
  console.log(`Carry-forward components present (salary+mobile): ${salaryRows.length}`)
  console.log(`Carried after exclusion: ${carried.length}`)
  console.log(`Dropped (offboarded/inactive/deleted): ${droppedOffboarded.length}\n`)

  console.log('=== Dropped salary/mobile rows (excluded employees) ===')
  if (droppedOffboarded.length === 0) console.log('  (none)')
  for (const r of droppedOffboarded) {
    console.log(`  ${r.payrollName}  ${r.componentKey}=${r.amount}  userId=${r.userId ?? 'NULL'}`)
  }

  const nameCarried = carried.filter((r) => r.payrollName.toLowerCase().includes(NAME))
  console.log(`\n=== Would "${NAME}" be carried forward? ===`)
  if (nameCarried.length === 0) {
    console.log(`  NO — no "${NAME}" rows survive the carry-forward. ✅`)
  } else {
    console.log(`  YES — ${nameCarried.length} row(s) still carry. ❌`)
    for (const r of nameCarried) console.log(`    ${r.payrollName}  ${r.componentKey}=${r.amount}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
