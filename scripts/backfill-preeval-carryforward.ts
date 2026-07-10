/**
 * Backfill pre-evaluation lead-question carry-forward for a period whose leads'
 * prior questions did not carry (e.g. Q2 2026, triggered before carry-forward
 * existed). Dry-run by default; pass --apply to write. Only fills untouched preps
 * (no questions, not submitted, not already carried), so any lead who already
 * customized this period is skipped.
 *
 * NOTE: requires the questionsCarriedForwardAt column to exist — run only after the
 * migration has deployed.
 *
 * Usage:
 *   npx tsx scripts/backfill-preeval-carryforward.ts "Q2 2026"
 *   npx tsx scripts/backfill-preeval-carryforward.ts "Q2 2026" --apply
 */
import { prisma } from '../lib/db'
import { carryForwardLeadQuestions, isPrepEligibleForCarryForward } from '../lib/pre-evaluation'

async function main() {
  const apply = process.argv.includes('--apply')
  const nameArg = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'Q2 2026'

  const period = await prisma.evaluationPeriod.findFirst({
    where: { name: nameArg },
    select: { id: true, name: true, reviewStartDate: true },
  })
  if (!period) throw new Error(`Evaluation period not found: ${nameArg}`)

  console.log(`Period: ${period.name}  review starts ${period.reviewStartDate.toISOString().slice(0, 10)}`)
  console.log(`Mode: ${apply ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}\n`)

  const preps = await prisma.preEvaluationLeadPrep.findMany({
    where: { periodId: period.id },
    select: {
      id: true,
      leadId: true,
      questionsSubmittedAt: true,
      questionsCarriedForwardAt: true,
      lead: { select: { name: true } },
      questions: { select: { id: true } },
    },
    orderBy: { lead: { name: 'asc' } },
  })

  let wouldCarry = 0
  let noSource = 0
  let alreadyTouched = 0

  for (const prep of preps) {
    if (!isPrepEligibleForCarryForward(prep)) {
      alreadyTouched++
      continue
    }
    const source = await prisma.preEvaluationLeadPrep.findFirst({
      where: {
        leadId: prep.leadId,
        periodId: { not: period.id },
        questionsSubmittedAt: { not: null },
        questions: { some: {} },
      },
      select: {
        period: { select: { name: true } },
        questions: { orderBy: { orderIndex: 'asc' }, select: { questionText: true } },
      },
      orderBy: [{ questionsSubmittedAt: 'desc' }, { updatedAt: 'desc' }],
    })
    if (!source) {
      noSource++
      console.log(`  ${prep.lead.name}: no prior submitted set — skip (global bank only)`)
      continue
    }
    wouldCarry++
    console.log(`  ${prep.lead.name}: carry ${source.questions.length} question(s) from ${source.period.name}`)
    for (const question of source.questions) console.log(`      - ${question.questionText}`)
  }

  console.log(
    `\nPreps: ${preps.length}  wouldCarry: ${wouldCarry}  noSource: ${noSource}  alreadyCustomized: ${alreadyTouched}`,
  )

  if (apply) {
    const summary = await carryForwardLeadQuestions(prisma, period.id)
    console.log(
      `\nAPPLIED  carried=${summary.carried}  skippedNoSource=${summary.skippedNoSource}  skippedAlreadyTouched=${summary.skippedAlreadyTouched}`,
    )
  } else {
    console.log('\n(dry-run) Re-run with --apply to write.')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
