/**
 * Finalizes the HR_APPROVED leave backlog: sets APPROVED + deducts balance for
 * each, caps used at the quota total (no negatives), cancels a known duplicate,
 * and creates calendar invites for upcoming leaves. Idempotent (only acts on
 * HR_APPROVED). Prints before/after balances.
 */
import { prisma } from '../lib/db'
import { calculateLeaveDuration, leaveHasStarted } from '../lib/leave-utils'
import { syncLeaveCalendarEvent } from '../lib/google-calendar'

// Areebah's duplicate May 25 casual request (keep the earlier one, cancel this).
const DUPLICATE_IDS = new Set(['cmpmhcxaa0002f18j1di1277r'])

type Field = 'casualDays' | 'sickDays' | 'annualDays'
type Used = 'casualUsed' | 'sickUsed' | 'annualUsed'

async function main() {
  const stuck = await prisma.leaveRequest.findMany({
    where: { status: 'HR_APPROVED' },
    include: { employee: { select: { id: true, name: true } } },
  })
  if (stuck.length === 0) {
    console.log('No HR_APPROVED backlog to finalize. Nothing to do.')
    return
  }

  const toFinalize = stuck.filter((r) => !DUPLICATE_IDS.has(r.id))
  const toCancel = stuck.filter((r) => DUPLICATE_IDS.has(r.id))

  // Sum days to deduct per employee+type+year (excluding cancelled duplicates).
  const deduct = new Map<string, { empId: string; name: string; type: string; year: number; days: number }>()
  for (const r of toFinalize) {
    const start = new Date(r.startDate)
    const days = calculateLeaveDuration(start, new Date(r.endDate), r.isHalfDay)
    const year = start.getFullYear()
    const key = `${r.employeeId}|${r.leaveType}|${year}`
    const cur = deduct.get(key) || { empId: r.employeeId, name: r.employee.name, type: r.leaveType, year, days: 0 }
    cur.days += days
    deduct.set(key, cur)
  }

  // Pre-compute balance targets OUTSIDE the transaction (ensure rows exist + read
  // current values) so the transaction stays small and fast.
  const targets: Array<{ name: string; type: string; year: number; empId: string; usedField: Used; before: number; after: number; total: number }> = []
  for (const d of [...deduct.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const bal = await prisma.leaveBalance.upsert({
      where: { employeeId_year: { employeeId: d.empId, year: d.year } },
      update: {},
      create: { employeeId: d.empId, year: d.year },
    })
    const totalField = `${d.type.toLowerCase()}Days` as Field
    const usedField = `${d.type.toLowerCase()}Used` as Used
    const total = bal[totalField]
    const before = bal[usedField]
    const after = Math.min(before + d.days, total)
    targets.push({ name: d.name, type: d.type, year: d.year, empId: d.empId, usedField, before, after, total })
  }

  // Writes only, inside one short transaction.
  await prisma.$transaction(async (tx) => {
    for (const r of toCancel) {
      await tx.leaveRequest.update({
        where: { id: r.id },
        data: { status: 'CANCELLED', rejectionReason: 'Duplicate leave request (accounting cleanup)' },
      })
    }
    await tx.leaveRequest.updateMany({
      where: { id: { in: toFinalize.map((r) => r.id) } },
      data: { status: 'APPROVED' },
    })
    for (const t of targets) {
      await tx.leaveBalance.update({
        where: { employeeId_year: { employeeId: t.empId, year: t.year } },
        data: { [t.usedField]: t.after },
      })
    }
  }, { timeout: 60_000, maxWait: 15_000 })

  for (const r of toCancel) {
    console.log(` CANCELLED duplicate: ${r.employee.name} ${r.leaveType} ${new Date(r.startDate).toISOString().slice(0, 10)}`)
  }
  console.log('\nBalances (used before -> after / quota):')
  for (const t of targets) {
    const capped = t.before + (t.after - t.before) < t.after ? '' : (t.after === t.total && t.before < t.total ? '  (capped)' : '')
    console.log(` ${t.name.padEnd(24)} ${t.type.padEnd(6)} ${t.year}: ${t.before} -> ${t.after} / ${t.total}${t.after === t.total ? '  (cap=quota)' : ''}`)
  }

  // Create calendar invites for upcoming finalized leaves (best-effort).
  const upcoming = toFinalize.filter((r) => !leaveHasStarted(new Date(r.startDate)))
  console.log(`\nSyncing calendar invites for ${upcoming.length} upcoming leaves...`)
  for (const r of upcoming) {
    try {
      await syncLeaveCalendarEvent(r.id)
    } catch (e) {
      console.error(`  calendar sync failed for ${r.employee.name} ${new Date(r.startDate).toISOString().slice(0, 10)}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`\nDone: finalized ${toFinalize.length}, cancelled ${toCancel.length} duplicate(s).`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
