import { prisma } from '../lib/db'

async function main() {
  const validUsers = await prisma.user.findMany({ select: { id: true } })
  const valid = new Set(validUsers.map((u) => u.id))
  console.log(`Valid users: ${valid.size}`)

  const inputs = await prisma.payrollInputValue.findMany({
    where: { userId: { not: null } },
    select: { userId: true, payrollName: true, periodId: true },
  })
  const orphanInputs = inputs.filter((r) => r.userId && !valid.has(r.userId))
  const orphanByName = new Map<string, string>()
  for (const r of orphanInputs) orphanByName.set(`${r.payrollName} (${r.userId})`, r.userId!)
  console.log(`\nInputValue rows with orphaned userId: ${orphanInputs.length}`)
  for (const k of orphanByName.keys()) console.log(`  ${k}`)

  const mappings = await prisma.payrollIdentityMapping.findMany({ select: { userId: true, normalizedPayrollName: true } })
  const orphanMappings = mappings.filter((m) => m.userId && !valid.has(m.userId))
  console.log(`\nIdentityMapping rows with orphaned userId: ${orphanMappings.length}`)
  for (const m of orphanMappings) console.log(`  ${m.normalizedPayrollName} -> ${m.userId}`)

  // Which periods are affected
  const affectedPeriods = new Set(orphanInputs.map((r) => r.periodId))
  if (affectedPeriods.size > 0) {
    const periods = await prisma.payrollPeriod.findMany({
      where: { id: { in: [...affectedPeriods] } },
      select: { label: true, status: true },
    })
    console.log('\nAffected periods:')
    for (const p of periods) console.log(`  ${p.label} (${p.status})`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
