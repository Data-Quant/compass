import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { recordAudit } from '../lib/weekly/service/audit'
import { assertHr, loadPeople } from '../lib/weekly/service/context'
import { WeeklyError } from '../lib/weekly/service/errors'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  await seedWeeklyBase(prisma)
})
after(async () => {
  await prisma.$disconnect()
})

test('people carry payroll facts; people without a payroll profile count as active', WEEKLY_DB_TEST, async () => {
  await prisma.payrollEmployeeProfile.create({ data: { userId: W.ben.id, isPayrollActive: false, exitDate: new Date('2026-10-15T00:00:00.000Z') } })
  const people = await loadPeople([W.ana.id, W.ben.id, W.ana.id])
  assert.equal(people.size, 2)
  assert.equal(people.get(W.ana.id)?.payrollActive, true)
  assert.equal(people.get(W.ben.id)?.payrollActive, false)
  assert.equal(people.get(W.ben.id)?.exitDate?.toISOString(), '2026-10-15T00:00:00.000Z')
})

test('audit events are stored as written', WEEKLY_DB_TEST, async () => {
  await recordAudit(prisma, { actorId: W.hr.id, actorRole: 'HR', action: 'TEST', objectType: 'Thing', after: { a: 1 }, reason: 'why' })
  const [event] = await prisma.weeklyAuditEvent.findMany()
  assert.deepEqual([event.action, event.reason, event.after], ['TEST', 'why', { a: 1 }])
})

test('only HR passes the HR check', () => {
  assert.throws(() => assertHr(weeklyActor(W.ana)), (e: unknown) => e instanceof WeeklyError && e.status === 403)
  assert.doesNotThrow(() => assertHr(weeklyActor(W.hr)))
})
