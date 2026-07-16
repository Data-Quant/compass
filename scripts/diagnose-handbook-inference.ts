/**
 * READ-ONLY diagnostic. Assesses what signal exists for inferring a team tag
 * for the Handbook, and whether BenefitCategory/Benefit already model part of it.
 * Prints aggregates only -- no names, no emails, no PII (this repo is public).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const totalUsers = await prisma.user.count()
  console.log(`\n=== USERS: ${totalUsers} total ===`)

  const byDept = await prisma.user.groupBy({
    by: ['department'],
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
  })
  console.log(`\n--- User.department (${byDept.length} distinct) ---`)
  for (const d of byDept) console.log(`  ${String(d.department ?? '(null)').padEnd(38)} ${d._count._all}`)

  console.log(`\n=== BENEFIT CATEGORIES ===`)
  const cats = await prisma.benefitCategory.findMany({
    select: {
      name: true, region: true, employeeType: true, isActive: true,
      _count: { select: { users: true, benefits: true } },
    },
    orderBy: { name: 'asc' },
  })
  if (cats.length === 0) console.log('  (none)')
  for (const c of cats) {
    console.log(
      `  ${c.name.padEnd(34)} region=${String(c.region).padEnd(14)} type=${String(c.employeeType).padEnd(12)} ` +
      `active=${c.isActive ? 'Y' : 'N'} users=${c._count.users} benefits=${c._count.benefits}`
    )
  }

  const noCat = await prisma.user.count({ where: { benefitCategoryId: null } })
  console.log(`\n  users with NO benefitCategory: ${noCat} / ${totalUsers}`)

  console.log(`\n=== BENEFIT TITLES (content already in DB?) ===`)
  const benefits = await prisma.benefit.findMany({
    select: { title: true, isActive: true, category: { select: { name: true } } },
    orderBy: [{ categoryId: 'asc' }, { orderIndex: 'asc' }],
  })
  if (benefits.length === 0) console.log('  (none)')
  let lastCat = ''
  for (const b of benefits) {
    if (b.category.name !== lastCat) { console.log(`\n  [${b.category.name}]`); lastCat = b.category.name }
    console.log(`    - ${b.title}${b.isActive ? '' : ' (inactive)'}`)
  }

  console.log(`\n=== PAYROLL PROFILE SIGNAL (payroll runs FBR/Pakistan tax rules) ===`)
  const withProfile = await prisma.payrollEmployeeProfile.count()
  const activeProfile = await prisma.payrollEmployeeProfile.count({ where: { isPayrollActive: true } })
  const withCnic = await prisma.payrollEmployeeProfile.count({ where: { NOT: { cnicNumber: null } } })
  const withDistance = await prisma.payrollEmployeeProfile.count({ where: { NOT: { distanceKm: null } } })
  console.log(`  profiles total=${withProfile}  active=${activeProfile}  hasCnic=${withCnic}  hasDistanceKm=${withDistance}`)

  console.log(`\n--- cross-tab: User.department x hasPayrollProfile ---`)
  const users = await prisma.user.findMany({
    select: { department: true, payrollProfile: { select: { cnicNumber: true, distanceKm: true } } },
  })
  const tab = new Map<string, { total: number; payroll: number; cnic: number; dist: number }>()
  for (const u of users) {
    const k = (u.department ?? '(null)').trim() || '(blank)'
    const row = tab.get(k) ?? { total: 0, payroll: 0, cnic: 0, dist: 0 }
    row.total++
    if (u.payrollProfile) row.payroll++
    if (u.payrollProfile?.cnicNumber) row.cnic++
    if (u.payrollProfile?.distanceKm != null) row.dist++
    tab.set(k, row)
  }
  console.log(`  ${'department'.padEnd(26)} total  payroll  cnic  distanceKm`)
  for (const [k, v] of [...tab.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${k.padEnd(26)} ${String(v.total).padStart(5)} ${String(v.payroll).padStart(8)} ${String(v.cnic).padStart(5)} ${String(v.dist).padStart(11)}`)
  }

  // distanceKm implies a Pakistan-Team travel allowance (travel policy is Pakistan-only).
  const inferable3E = [...tab.entries()].filter(([k]) => k === '3E').reduce((n, [, v]) => n + v.total, 0)
  const inferableNoble = [...tab.entries()].filter(([k]) => k.toLowerCase() === 'noble').reduce((n, [, v]) => n + v.total, 0)
  const inferablePk = [...tab.entries()].filter(([k]) => k !== '3E' && k.toLowerCase() !== 'noble').reduce((n, [, v]) => n + v.dist, 0)
  console.log(`\n=== INFERENCE VERDICT ===`)
  console.log(`  '3E' dept -> 3E team, but Pakistan vs Morocco NOT determinable : ${inferable3E} users ambiguous`)
  console.log(`  'Noble' dept -> Noble Team (confident)                          : ${inferableNoble} users`)
  console.log(`  non-3E/Noble with distanceKm -> likely Pakistan Team (onsite)   : ${inferablePk} users`)
  const rest = totalUsers - inferable3E - inferableNoble - inferablePk
  console.log(`  remaining with NO country signal at all                         : ${rest} users`)

}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
