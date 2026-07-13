/**
 * Verify which people qualify as pre-evaluation team leads for a period under
 * the title-gated rule. Read-only. Prints the resulting leads with their
 * titles and report counts so the qualified set can be eyeballed against
 * expectations.
 *
 * Usage: npx tsx scripts/verify-preeval-lead-titles.ts "Q2 2026"
 */
import { prisma } from '../lib/db'
import { getLeadIdsForPreEvaluation } from '../lib/pre-evaluation'

async function main() {
  const nameArg = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'Q2 2026'

  const period = await prisma.evaluationPeriod.findFirst({
    where: { name: nameArg },
    select: { id: true, name: true },
  })
  if (!period) throw new Error(`Evaluation period not found: ${nameArg}`)

  const { leadIds, directReportsByLead } = await getLeadIdsForPreEvaluation(prisma, period.id)
  const users = await prisma.user.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, name: true, position: true },
  })
  const byId = new Map(users.map((user) => [user.id, user]))

  console.log(`Period ${period.name}: ${leadIds.length} qualified lead(s)\n`)
  for (const id of leadIds) {
    const user = byId.get(id)
    const reports = directReportsByLead[id]?.length ?? 0
    console.log(`  ${(user?.name || id).padEnd(26)}  reports=${reports}  title="${user?.position || '(none)'}"`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
