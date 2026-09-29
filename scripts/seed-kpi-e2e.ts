// Seeds synthetic people and an open month for the KPI Playwright run.
// Refuses any database other than the local compass_kpi_test.
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { endOfKarachiDay, karachiCalendarDate, monthKeyOf, type CalendarDate } from '../lib/kpi/calendar'

const PEOPLE = [
  ['kpie-hr', 'E2E HR', 'HR', 'HR Executive', 'Human Resources'],
  ['kpie-lead', 'E2E Lead', 'EMPLOYEE', 'Lead', 'Product'],
  ['kpie-jp', 'E2E JP', 'EMPLOYEE', 'Junior Partner', 'Product'],
  ['kpie-partner', 'E2E Partner', 'EMPLOYEE', 'Partner', 'Executive'],
  ['kpie-member', 'E2E Member', 'EMPLOYEE', 'Analyst', 'Product'],
  ['kpie-orphan', 'E2E Orphan', 'EMPLOYEE', 'Analyst', 'Design'],
] as const

function isLocalTestDb(url: string | undefined): boolean {
  try {
    const parsed = new URL(url ?? '')
    return ['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.pathname === '/compass_kpi_test'
  } catch {
    return false
  }
}

function plusDays(date: CalendarDate, days: number): CalendarDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() }
}

async function main(): Promise<void> {
  if (!isLocalTestDb(process.env.DATABASE_URL)) throw new Error('Refusing: DATABASE_URL must be the local compass_kpi_test database')
  const password = process.env.KPI_FIXTURE_PASSWORD
  if (!password || password.length < 12) throw new Error('Set KPI_FIXTURE_PASSWORD (at least 12 characters)')
  const db = new PrismaClient()
  try {
    await db.kpiEvent.deleteMany()
    await db.kpiNotification.deleteMany()
    await db.kpiChangeRequest.deleteMany()
    await db.kpiEvidenceFile.deleteMany()
    await db.kpiAssignee.deleteMany()
    await db.kpi.deleteMany()
    await db.kpiGoal.deleteMany()
    await db.kpiMonth.deleteMany()
    await db.kpiSetterAssignment.deleteMany()
    await db.kpiRoleGrant.deleteMany()
    // Also remove integration-test people (kpit-*) so they do not appear as extra owners.
    const synthetic = [{ id: { startsWith: 'kpie-' } }, { id: { startsWith: 'kpit-' } }]
    await db.evaluatorMapping.deleteMany({
      where: { OR: [{ evaluatorId: { startsWith: 'kpie-' } }, { evaluateeId: { startsWith: 'kpie-' } }, { evaluatorId: { startsWith: 'kpit-' } }, { evaluateeId: { startsWith: 'kpit-' } }] },
    })
    await db.user.deleteMany({ where: { OR: synthetic } })
    const passwordHash = await bcrypt.hash(password, 10)
    for (const [id, name, role, position, department] of PEOPLE) {
      await db.user.create({ data: { id, name, email: `${id}@example.test`, role, position, department, passwordHash, onboardingCompleted: true } })
    }
    await db.evaluatorMapping.create({ data: { evaluatorId: 'kpie-lead', evaluateeId: 'kpie-member', relationshipType: 'TEAM_LEAD' } })
    const now = new Date()
    const today = karachiCalendarDate(now)
    const at = (days: number) => endOfKarachiDay(plusDays(today, days))
    const key = monthKeyOf(now)
    await db.kpiMonth.create({
      data: { ...key, goalsLockAt: at(7), claimsDueAt: at(40), verifyDueAt: at(45), responseDueAt: at(47), targetFinalAt: at(50) },
    })
    console.log(`Seeded KPI e2e people and ${key.year}-${String(key.month).padStart(2, '0')} (locks in 7 days)`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
