import type { PrismaClient } from '@prisma/client'
import type { KpiActor } from '../../lib/kpi/permissions'
import type { KpiGrantRoleValue } from '../../lib/kpi/view-types'

export function isKpiTestDatabase(url: string | undefined): boolean {
  try {
    const parsed = new URL(url ?? '')
    return ['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.pathname === '/compass_kpi_test'
  } catch {
    return false
  }
}

export const KPI_DB_READY = process.env.KPI_DB_TEST === 'true' && isKpiTestDatabase(process.env.DATABASE_URL)
export const DB_TEST = { skip: KPI_DB_READY ? false : 'Set KPI_DB_TEST=true and DATABASE_URL to the local compass_kpi_test database' }

type Role = 'EMPLOYEE' | 'HR' | 'EXECUTION'
interface TestPerson { id: string; name: string; role: Role; position: string; department: string }

export const PEOPLE = {
  hr: { id: 'kpit-hr', name: 'Test HR', role: 'HR', position: 'HR Executive', department: 'Human Resources' },
  partner: { id: 'kpit-partner', name: 'Test Partner', role: 'EMPLOYEE', position: 'Partner', department: 'Executive' },
  lead: { id: 'kpit-lead', name: 'Test Lead', role: 'EMPLOYEE', position: 'Lead', department: 'Product' },
  jp: { id: 'kpit-jp', name: 'Test JP', role: 'EMPLOYEE', position: 'Junior Partner', department: 'Product' },
  exec: { id: 'kpit-exec', name: 'Test Execution', role: 'EXECUTION', position: 'Junior Partner', department: 'Value Creation' },
  verifier: { id: 'kpit-verifier', name: 'Test Verifier', role: 'EMPLOYEE', position: 'Analyst', department: 'Value Creation' },
  member: { id: 'kpit-member', name: 'Test Member', role: 'EMPLOYEE', position: 'Analyst', department: 'Product' },
  orphan: { id: 'kpit-orphan', name: 'Test Orphan', role: 'EMPLOYEE', position: 'Analyst', department: 'Design' },
} satisfies Record<string, TestPerson>

export function actorFor(person: TestPerson, grants: KpiGrantRoleValue[] = []): KpiActor {
  return { id: person.id, role: person.role, position: person.position, departmentKey: person.department.toLowerCase(), grants }
}

export async function resetKpiTestData(db: PrismaClient): Promise<void> {
  if (!isKpiTestDatabase(process.env.DATABASE_URL)) throw new Error('Refusing to reset a database that is not compass_kpi_test')
  await db.kpiComment.deleteMany()
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
  // Also remove people left by the browser-test seeds (kpie-*, wkle-*) and the weekly-evaluation
  // integration tests (wkt-*): the daily job and HR lists read every user.
  const synthetic = ['kpit-', 'kpie-', 'wkt-', 'wkle-']
  await db.evaluatorMapping.deleteMany({
    where: { OR: synthetic.flatMap((prefix) => [{ evaluatorId: { startsWith: prefix } }, { evaluateeId: { startsWith: prefix } }]) },
  })
  await db.user.deleteMany({ where: { OR: synthetic.map((prefix) => ({ id: { startsWith: prefix } })) } })
}

export async function seedKpiPeople(db: PrismaClient): Promise<void> {
  for (const person of Object.values(PEOPLE)) {
    await db.user.create({
      data: { ...person, email: `${person.id}@example.test`, onboardingCompleted: true },
    })
  }
  await db.evaluatorMapping.create({
    data: { evaluatorId: PEOPLE.lead.id, evaluateeId: PEOPLE.member.id, relationshipType: 'TEAM_LEAD' },
  })
}
