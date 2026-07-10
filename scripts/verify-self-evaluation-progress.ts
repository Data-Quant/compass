/**
 * Read-only verification for self-evaluation progress tracking. For the period
 * with the most self-evaluations, prints the summary counts and a sample of rows
 * exactly as the progress endpoint would derive them. Writes nothing.
 * Usage: npx tsx scripts/verify-self-evaluation-progress.ts
 */
import { prisma } from '../lib/db'
import {
  deriveProgressStatus,
  summarizeProgress,
  SELF_EVAL_PROGRESS_LABELS,
  SELF_EVAL_PROGRESS_ORDER,
} from '../lib/self-evaluation-progress'

async function main() {
  const grouped = await prisma.selfEvaluation.groupBy({
    by: ['periodId'],
    _count: { _all: true },
    orderBy: { _count: { periodId: 'desc' } },
  })
  if (grouped.length === 0) {
    console.log('No self-evaluations exist in any period yet.')
    return
  }

  console.log('Self-evaluations per period:')
  for (const g of grouped) {
    const period = await prisma.evaluationPeriod.findUnique({
      where: { id: g.periodId },
      select: { name: true },
    })
    console.log(`  ${period?.name ?? g.periodId}: ${g._count._all}`)
  }

  const topPeriodId = grouped[0].periodId
  const period = await prisma.evaluationPeriod.findUnique({
    where: { id: topPeriodId },
    select: { id: true, name: true },
  })

  const rows = await prisma.selfEvaluation.findMany({
    where: { periodId: topPeriodId },
    select: {
      employeeId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      employee: { select: { name: true, department: true, position: true } },
    },
  })

  const items = rows
    .map((r) => ({
      name: r.employee.name,
      meta: [r.employee.position, r.employee.department].filter(Boolean).join(' · '),
      progressStatus: deriveProgressStatus({ status: r.status, startedAt: r.startedAt }),
      submittedAt: r.submittedAt,
    }))
    .sort((a, b) => {
      const byStatus = SELF_EVAL_PROGRESS_ORDER[a.progressStatus] - SELF_EVAL_PROGRESS_ORDER[b.progressStatus]
      return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name)
    })

  const summary = summarizeProgress(items)
  console.log(`\n=== Progress for "${period?.name}" ===`)
  console.log(
    `sent=${summary.sent}  submitted=${summary.submitted}  inProgress=${summary.inProgress}  notStarted=${summary.notStarted}\n`,
  )
  for (const i of items.slice(0, 15)) {
    const when = i.submittedAt ? new Date(i.submittedAt).toISOString().slice(0, 10) : ''
    console.log(`  ${SELF_EVAL_PROGRESS_LABELS[i.progressStatus].padEnd(12)} ${i.name}  (${i.meta})  ${when}`)
  }
  if (items.length > 15) console.log(`  ...and ${items.length - 15} more`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
