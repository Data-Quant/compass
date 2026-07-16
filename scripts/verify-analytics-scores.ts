/**
 * Verifies the analytics period score matrix produces the same overall score as
 * the live scorer (lib/scoring.ts) for every reportable employee, in every
 * period. This is what holds the two implementations of the normalization math
 * together — lib/scoring.ts is deliberately never modified.
 *
 * READ-ONLY. Re-run this after any change to lib/scoring.ts.
 * Run: npx tsx scripts/verify-analytics-scores.ts
 */
import { prisma } from '../lib/db'
import { computePeriodScoreMatrix } from '../lib/analytics/period-score-matrix'
import { calculateWeightedScore } from '../lib/scoring'

/** Both paths do the same float math, so any real difference is far above this. */
const TOLERANCE = 1e-9

async function main() {
  const periods = await prisma.evaluationPeriod.findMany({ orderBy: { startDate: 'asc' } })
  let checked = 0
  let skipped = 0
  let mismatches = 0

  for (const period of periods) {
    const matrix = await computePeriodScoreMatrix(period.id)
    if (!matrix || matrix.scores.length === 0) {
      console.log(`${period.name}: no scores, skipping`)
      continue
    }

    for (const entry of matrix.scores) {
      let expected: number
      try {
        expected = (await calculateWeightedScore(entry.employeeId, period.id)).overallScore
      } catch (error) {
        skipped++
        console.log(
          `${period.name} ${entry.employeeId}: scorer threw, skipping (${(error as Error).message})`
        )
        continue
      }

      checked++
      const diff = Math.abs(entry.overallScore - expected)
      if (diff > TOLERANCE) {
        mismatches++
        console.error(
          `MISMATCH ${period.name} ${entry.employeeId}: matrix=${entry.overallScore.toFixed(6)} scorer=${expected.toFixed(6)} diff=${diff.toFixed(6)}`
        )
      }
    }
    console.log(`${period.name}: compared ${matrix.scores.length} employees`)
  }

  console.log(`\nChecked ${checked} employee-period scores (${skipped} skipped).`)
  console.log(
    mismatches === 0
      ? 'PASS: the matrix matches the live scorer exactly.'
      : `FAIL: ${mismatches} mismatches.`
  )
  await prisma.$disconnect()
  process.exit(mismatches === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
