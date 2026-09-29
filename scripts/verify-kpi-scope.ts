// Read-only: prints how KPI scope resolves on a database, using default setters
// (it does not read KpiSetterAssignment, so it also works before the migration).
// Neon dev branch: node --env-file=.env.pilot-hosted.local --import tsx scripts/verify-kpi-scope.ts
import { prisma } from '../lib/db'
import { buildKpiScope, type ScopeUser } from '../lib/kpi/scope'

async function main(): Promise<void> {
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL ?? '').hostname } catch { return 'unknown' }
  })()
  const [users, mappings] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, position: true, department: true, payrollProfile: { select: { isPayrollActive: true, exitDate: true } } },
    }),
    prisma.evaluatorMapping.findMany({ where: { relationshipType: 'TEAM_LEAD' }, select: { evaluatorId: true, evaluateeId: true, relationshipType: true } }),
  ])
  const scopeUsers: ScopeUser[] = users.map((u) => ({
    id: u.id, name: u.name, position: u.position, department: u.department,
    payrollActive: u.payrollProfile?.isPayrollActive ?? true, exitDate: u.payrollProfile?.exitDate ?? null,
  }))
  const scope = buildKpiScope(scopeUsers, mappings, [])
  const name = (id: string) => scopeUsers.find((u) => u.id === id)?.name ?? id
  console.log(`Database host: ${host}`)
  console.log(`In scheme: ${scope.inScheme.size}`)
  console.log(`Leads/JPs on department KPIs: ${scope.leadIds.size} across ${scope.departmentOwners.size} departments`)
  for (const [key, owners] of scope.departmentOwners) console.log(`  ${key}: ${owners.map(name).join(', ')}`)
  const multi = [...scope.setterIdsByEmployee.values()].filter((setters) => setters.length > 1).length
  console.log(`Team members: ${scope.setterIdsByEmployee.size} (with more than one setter: ${multi})`)
  console.log(`Team setters: ${scope.teamBySetter.size}`)
  console.log(`Without a setter (${scope.membersWithoutSetter.length}): ${scope.membersWithoutSetter.map(name).join(', ')}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
