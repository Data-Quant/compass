/**
 * READ-ONLY preview of the HR_APPROVED leave backlog (stuck, never finalized,
 * so balance was never deducted). Lists past vs upcoming and the per-employee
 * balance impact of finalizing. No data is changed.
 */
import { prisma } from '../lib/db'
import { calculateLeaveDuration, leaveHasStarted } from '../lib/leave-utils'

type Row = {
  employeeId: string
  name: string
  leaveType: string
  startKey: string
  endKey: string
  days: number
  started: boolean
}

async function main() {
  const stuck = await prisma.leaveRequest.findMany({
    where: { status: 'HR_APPROVED' },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: [{ startDate: 'asc' }],
  })

  const rows: Row[] = stuck.map((r) => {
    const start = new Date(r.startDate)
    return {
      employeeId: r.employee.id,
      name: r.employee.name,
      leaveType: r.leaveType,
      startKey: start.toISOString().slice(0, 10),
      endKey: new Date(r.endDate).toISOString().slice(0, 10),
      days: calculateLeaveDuration(start, new Date(r.endDate), r.isHalfDay),
      started: leaveHasStarted(start),
    }
  })

  const fmt = (r: Row) =>
    ` ${r.name.padEnd(24)} | ${r.leaveType.padEnd(6)} | ${r.startKey}${r.startKey !== r.endKey ? `..${r.endKey}` : '        '} | ${r.days}d`

  const past = rows.filter((r) => r.started)
  const upcoming = rows.filter((r) => !r.started)

  console.log(`=== PAST / ALREADY-TAKEN (${past.length}) — taken but never deducted ===`)
  past.forEach((r) => console.log(fmt(r)))
  console.log(`\n=== UPCOMING (${upcoming.length}) — approved, not yet started ===`)
  upcoming.forEach((r) => console.log(fmt(r)))

  // Per-employee, per-type balance impact
  const byEmpType = new Map<string, { name: string; type: string; empId: string; days: number }>()
  for (const r of rows) {
    const key = `${r.employeeId}|${r.leaveType}`
    const cur = byEmpType.get(key) || { name: r.name, type: r.leaveType, empId: r.employeeId, days: 0 }
    cur.days += r.days
    byEmpType.set(key, cur)
  }

  const year = new Date().getFullYear()
  console.log(`\n=== BALANCE IMPACT IF FINALIZED (year ${year}) ===`)
  console.log('EMPLOYEE'.padEnd(24), 'TYPE'.padEnd(7), 'used/total now'.padEnd(16), 'deduct', ' -> available after')
  for (const v of [...byEmpType.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const bal = await prisma.leaveBalance.findUnique({
      where: { employeeId_year: { employeeId: v.empId, year } },
    })
    const totalField = `${v.type.toLowerCase()}Days` as 'casualDays' | 'sickDays' | 'annualDays'
    const usedField = `${v.type.toLowerCase()}Used` as 'casualUsed' | 'sickUsed' | 'annualUsed'
    const total = bal ? bal[totalField] : 0
    const used = bal ? bal[usedField] : 0
    const availAfter = total - (used + v.days)
    const flag = availAfter < 0 ? '  <-- WOULD GO NEGATIVE' : ''
    console.log(
      v.name.padEnd(24),
      v.type.padEnd(7),
      `${used}/${total}`.padEnd(16),
      String(v.days).padStart(5),
      ` -> ${availAfter}${flag}`
    )
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
