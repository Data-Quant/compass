/**
 * Remove pre-evaluation preps for people who no longer qualify as team leads
 * for a period — i.e. they are not in getLeadIdsForPreEvaluation, meaning they
 * either lack a recognized lead title OR no longer lead anyone via TEAM_LEAD
 * mappings — but ONLY when the prep is empty (no questions, not submitted, not
 * carried), so it can never delete lead-authored data. Dry-run by default;
 * pass --apply to write. Evaluatee selections cascade-delete with the prep.
 *
 * Usage:
 *   npx tsx scripts/cleanup-preeval-nonlead-preps.ts "Q2 2026"
 *   npx tsx scripts/cleanup-preeval-nonlead-preps.ts "Q2 2026" --apply
 */
import { prisma } from '../lib/db'
import { getLeadIdsForPreEvaluation, isPrepEligibleForCarryForward } from '../lib/pre-evaluation'

async function main() {
  const apply = process.argv.includes('--apply')
  const nameArg = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'Q2 2026'

  const period = await prisma.evaluationPeriod.findFirst({
    where: { name: nameArg },
    select: { id: true, name: true },
  })
  if (!period) throw new Error(`Evaluation period not found: ${nameArg}`)

  console.log(`Period: ${period.name}`)
  console.log(`Mode: ${apply ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}\n`)

  // Authoritative current lead set: recognized title AND leads someone (mappings).
  const { leadIds } = await getLeadIdsForPreEvaluation(prisma, period.id)
  const qualified = new Set(leadIds)

  const preps = await prisma.preEvaluationLeadPrep.findMany({
    where: { periodId: period.id },
    select: {
      id: true,
      leadId: true,
      questionsSubmittedAt: true,
      questionsCarriedForwardAt: true,
      lead: { select: { name: true, position: true } },
      questions: { select: { id: true } },
      evaluateeSelections: { select: { id: true } },
    },
    orderBy: { lead: { name: 'asc' } },
  })

  const targetIds: string[] = []
  let keptQualified = 0
  let keptNonEmpty = 0

  for (const prep of preps) {
    if (qualified.has(prep.leadId)) {
      keptQualified++
      continue
    }
    if (!isPrepEligibleForCarryForward(prep)) {
      keptNonEmpty++
      console.log(
        `  KEEP (unqualified but non-empty — manual review): ${prep.lead.name} (${prep.lead.position}) ` +
          `questions=${prep.questions.length} submitted=${prep.questionsSubmittedAt ? 'YES' : 'no'} ` +
          `carried=${prep.questionsCarriedForwardAt ? 'YES' : 'no'}`,
      )
      continue
    }
    targetIds.push(prep.id)
    console.log(`  DELETE: ${prep.lead.name} (${prep.lead.position}) — ${prep.evaluateeSelections.length} evaluatee selection(s)`)
  }

  console.log(
    `\nPreps: ${preps.length}  toDelete: ${targetIds.length}  keptQualified: ${keptQualified}  keptNonEmpty: ${keptNonEmpty}`,
  )

  if (apply && targetIds.length > 0) {
    const result = await prisma.preEvaluationLeadPrep.deleteMany({
      where: { id: { in: targetIds } },
    })
    console.log(`\nAPPLIED  deletedPreps=${result.count} (evaluatee selections cascade-deleted)`)
  } else if (!apply) {
    console.log('\n(dry-run) Re-run with --apply to delete.')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
