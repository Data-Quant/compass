import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { getResolvedEvaluationAssignments } from '../lib/evaluation-assignments'
import { quarterMappings } from '../lib/quarter-mappings'
import { setRoundLock } from '../lib/weekly/service/round'
import { HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const EARLIER = 'Earlier quarter (fixed mappings test)'
let earlierId = ''
let runningPeriodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  await prisma.evaluationPeriod.deleteMany({ where: { name: { startsWith: 'Earlier quarter' } } })
  ;({ periodId: runningPeriodId } = await seedWeeklyBase(prisma))
  await startedCycle(runningPeriodId)
  earlierId = (await prisma.evaluationPeriod.create({
    data: { name: EARLIER, startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z'), reviewStartDate: new Date('2026-10-05T00:00:00Z'), isActive: false },
  })).id
})
after(async () => {
  await prisma.$disconnect()
})

const pairs = async (periodId: string) => (await getResolvedEvaluationAssignments(periodId)).map((a) => `${a.evaluatorId}>${a.evaluateeId}:${a.relationshipType}`).sort()
/** The earlier quarter as it ran: Ben reported to the lead, which today's org chart no longer has (a later change). */
async function fixEarlierQuarter() {
  await prisma.evaluationPeriodAssignmentSnapshot.createMany({ data: [
    { periodId: earlierId, evaluatorId: W.lead.id, evaluateeId: W.ben.id, relationshipType: 'TEAM_LEAD', source: 'QUARTER_ANSWERS' },
    { periodId: earlierId, evaluatorId: W.ana.id, evaluateeId: W.ben.id, relationshipType: 'PEER', source: 'PERMANENT_MAPPING' },
  ] })
  await prisma.evaluationPeriod.update({ where: { id: earlierId }, data: { assignmentsFixedAt: new Date() } })
}

test('a quarter whose mappings were fixed uses them while still open; the running round keeps today’s', WEEKLY_DB_TEST, async () => {
  const runningBefore = await pairs(runningPeriodId)
  await fixEarlierQuarter()
  await prisma.evaluatorMapping.deleteMany({ where: { evaluatorId: W.lead.id, evaluateeId: W.ben.id } })

  assert.deepEqual(await pairs(earlierId), [`${W.ana.id}>${W.ben.id}:PEER`, `${W.lead.id}>${W.ben.id}:TEAM_LEAD`])
  assert.equal((await quarterMappings(earlierId)).state.kind, 'saved')
  const running = await pairs(runningPeriodId)
  assert.ok(!running.includes(`${W.lead.id}>${W.ben.id}:TEAM_LEAD`), 'the running round follows today’s org chart')
  assert.notDeepEqual(running, runningBefore)
})

test('closing a fixed quarter keeps its fixed mappings instead of saving today’s', WEEKLY_DB_TEST, async () => {
  await fixEarlierQuarter()
  await setRoundLock(HR_ACTOR, earlierId, true)
  assert.deepEqual(await pairs(earlierId), [`${W.ana.id}>${W.ben.id}:PEER`, `${W.lead.id}>${W.ben.id}:TEAM_LEAD`])
})
