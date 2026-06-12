/**
 * Verify the WHT fix end-to-end: snapshot receipts, re-run the engine, compare.
 * Usage: npx tsx scripts/verify-payroll-recalc.ts
 */
import { prisma } from '../lib/db'
import { recalculatePayrollPeriod } from '../lib/payroll/engine'

async function snapshot(periodId: string) {
  const receipts = await prisma.payrollReceipt.findMany({
    where: { periodId },
    select: { payrollName: true, receiptJson: true },
  })
  const map = new Map<string, { incomeTax: number; net: number; medical: number; gross: number }>()
  for (const r of receipts) {
    const json = r.receiptJson as any
    map.set(r.payrollName, {
      incomeTax: json?.deductions?.incomeTax ?? 0,
      net: json?.net?.netSalary ?? 0,
      medical: json?.earnings?.medicalAllowance ?? 0,
      gross: json?.earnings?.totalEarnings ?? 0,
    })
  }
  return map
}

async function main() {
  const period = await prisma.payrollPeriod.findFirst({
    orderBy: { periodStart: 'desc' },
    select: { id: true, label: true, status: true },
  })
  if (!period) throw new Error('No payroll period found')
  if (!['DRAFT', 'CALCULATED'].includes(period.status)) {
    throw new Error(`Period ${period.label} is ${period.status}; refusing to recalculate`)
  }

  const before = await snapshot(period.id)
  const result = await recalculatePayrollPeriod(period.id)
  const after = await snapshot(period.id)

  console.log(`PERIOD: ${period.label} | computed=${result.computedCount} | mismatches=${result.mismatchCount}`)
  console.log('\nBEFORE -> AFTER (monthly):')
  for (const [name, prev] of [...before.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const next = after.get(name)
    console.log(
      ` ${name}: tax ${Math.round(prev.incomeTax)} -> ${next ? Math.round(next.incomeTax) : '?'} | medical ${Math.round(prev.medical)} -> ${next ? Math.round(next.medical) : '?'} | gross ${Math.round(prev.gross)} -> ${next ? Math.round(next.gross) : '?'} | net ${Math.round(prev.net)} -> ${next ? Math.round(next.net) : '?'}`
    )
  }

  console.log('\nTRAVEL SKIPS:')
  for (const skip of result.travelSkips) {
    console.log(` ${skip.payrollName}: ${skip.reason}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
