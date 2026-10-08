import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { roundView } from '../lib/weekly/service/round'
import { markRoundReleased, releaseReport, roundResults } from '../lib/weekly/service/round-results'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
let periodId = ''
let cycleId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  ;({ cycleId } = await startedCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

test('results list everyone who gets a report, with their score once generated and whether it was sent', WEEKLY_DB_TEST, async () => {
  await assert.rejects(roundResults(weeklyActor(W.ana), periodId), isStatus(403))
  const before = await roundResults(HR_ACTOR, periodId)
  const ana = before.rows.find((r) => r.person.id === W.ana.id)
  assert.ok(ana)
  assert.deepEqual([ana.score, ana.email], [null, null])
  await prisma.report.create({ data: { employeeId: W.ana.id, periodId, overallScore: 2.75, breakdownJson: {} } })
  assert.equal((await roundResults(HR_ACTOR, periodId)).rows.find((r) => r.person.id === W.ana.id)?.score, 2.75)
})

test('reports are released only after the close; with emails off they are queued, not sent; then the round is released', WEEKLY_DB_TEST, async () => {
  await assert.rejects(releaseReport(HR_ACTOR, periodId, W.ana.id), /Close the round/)
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: at(13) } })
  const closed = await roundView(HR_ACTOR, periodId, at(13))
  assert.equal(closed.next?.action, 'release')
  assert.ok(closed.checklist.some((c) => c.key === 'reports' && !c.done && c.tab === 'results'))
  const result = await releaseReport(HR_ACTOR, periodId, W.ana.id)
  assert.equal(result.status, 'PENDING', 'queued only: emails are off in tests')
  const row = (await roundResults(HR_ACTOR, periodId)).rows.find((r) => r.person.id === W.ana.id)
  assert.equal(row?.email?.status, 'PENDING')
  assert.ok(row?.score !== null)
  await markRoundReleased(HR_ACTOR, periodId, at(14))
  assert.equal((await roundView(HR_ACTOR, periodId, at(14))).stage, 'RELEASED')
})
