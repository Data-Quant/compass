/**
 * Inspect payroll periods and reproduce the carry-forward calculation failure.
 * Read-only except it attempts a recalc on a DRAFT period (idempotent).
 * Usage: npx tsx scripts/diagnose-carryforward.ts
 */
import { prisma } from '../lib/db'
import { recalculatePayrollPeriod } from '../lib/payroll/engine'

async function main() {
  const periods = await prisma.payrollPeriod.findMany({
    orderBy: { periodStart: 'desc' },
    select: {
      id: true,
      label: true,
      status: true,
      sourceType: true,
      periodStart: true,
      periodEnd: true,
      summaryJson: true,
      _count: { select: { inputValues: true, computedValues: true, receipts: true } },
    },
  })

  console.log('PAYROLL PERIODS (newest first):')
  for (const p of periods) {
    const warn = (p.summaryJson as any)?.calculationWarning
    console.log(
      ` ${p.label} | ${p.status} | src=${p.sourceType} | ${p.periodStart.toISOString().slice(0, 10)}..${p.periodEnd
        .toISOString()
        .slice(0, 10)} | inputs=${p._count.inputValues} computed=${p._count.computedValues} receipts=${p._count.receipts}${warn ? ` | WARN: ${warn}` : ''}`
    )
  }

  // Find a carry-forward / draft period that has inputs but no computed values — the stuck one.
  const stuck = periods.find(
    (p) => p.status === 'DRAFT' && p._count.inputValues > 0 && p._count.computedValues === 0
  )
  if (!stuck) {
    console.log('\nNo stuck DRAFT period (inputs>0, computed=0) found.')
    return
  }

  console.log(`\nATTEMPTING RECALC on stuck period: ${stuck.label} (${stuck.id})`)
  try {
    const result = await recalculatePayrollPeriod(stuck.id)
    console.log('RECALC SUCCEEDED:', JSON.stringify({ computed: result.computedCount, mismatches: result.mismatchCount }))
  } catch (error) {
    console.log('RECALC THREW:')
    console.log(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    if (error instanceof Error && error.stack) {
      console.log(error.stack.split('\n').slice(0, 6).join('\n'))
    }
    // Prisma errors often carry a code/meta
    const anyErr = error as any
    if (anyErr?.code) console.log('Prisma code:', anyErr.code, 'meta:', JSON.stringify(anyErr.meta))
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
