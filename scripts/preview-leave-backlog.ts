/**
 * READ-ONLY preview of the leave backlog that the new "HR approval finalizes"
 * rule would clear. Lists requests stuck in HR_APPROVED (HR signed off, lead
 * never did, so they never deducted balance / created a calendar invite).
 * No data is changed.
 */
import { prisma } from '../lib/db'
import { calculateLeaveDuration, leaveHasStarted } from '../lib/leave-utils'

async function main() {
  const stuck = await prisma.leaveRequest.findMany({
    where: { status: 'HR_APPROVED' },
    include: { employee: { select: { name: true } } },
    orderBy: { startDate: 'asc' },
  })

  console.log(`HR_APPROVED backlog (stuck, never finalized): ${stuck.length} request(s)\n`)
  if (stuck.length === 0) return

  let pastCount = 0
  let futureCount = 0
  for (const r of stuck) {
    const start = new Date(r.startDate)
    const days = calculateLeaveDuration(start, new Date(r.endDate), r.isHalfDay)
    const started = leaveHasStarted(start)
    if (started) pastCount++
    else futureCount++
    console.log(
      ` ${r.employee.name.padEnd(24)} | ${r.leaveType.padEnd(6)} | ${start.toISOString().slice(0, 10)}..${new Date(r.endDate)
        .toISOString()
        .slice(0, 10)} | ${days}d | ${started ? 'ALREADY TAKEN (past/started)' : 'upcoming'}`
    )
  }

  console.log(`\nSummary: ${pastCount} already taken, ${futureCount} upcoming.`)
  console.log('Finalizing would: set status APPROVED and DEDUCT the leave days for each.')
  console.log(' - Upcoming ones also get a calendar invite.')
  console.log(' - Already-taken ones: deduction is correct IF the person actually took the leave.')

  // Show current balances for affected employees so deductions are sanity-checked.
  const empNames = [...new Set(stuck.map((r) => r.employee.name))]
  console.log(`\nAffected employees: ${empNames.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
