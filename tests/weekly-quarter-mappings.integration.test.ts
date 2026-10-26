import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { getResolvedEvaluationAssignments } from '../lib/evaluation-assignments'
import { quarterMappings } from '../lib/quarter-mappings'
import { closeCycle, reopenCycle } from '../lib/weekly/service/close'
import { WeeklyError } from '../lib/weekly/service/errors'
import { openReviewStage } from '../lib/weekly/service/review-stage'
import { setRoundLock } from '../lib/weekly/service/round'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const NEXT = 'Next quarter (mapping history test)'
let cycleId = ''
let periodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  await prisma.evaluationPeriod.deleteMany({ where: { name: NEXT } })
  ;({ periodId } = await seedWeeklyBase(prisma))
  ;({ cycleId } = await startedCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

const pairs = async () => (await getResolvedEvaluationAssignments(periodId)).map((a) => `${a.evaluatorId}>${a.evaluateeId}:${a.relationshipType}`).sort()
const close = (when = at(13)) => closeCycle(HR_ACTOR, cycleId, { drops: [], formsAcknowledged: true }, when)
/** After the close: Ana gets a new peer and loses her lead in the org chart. */
async function changeOrgChart() {
  await prisma.evaluatorMapping.create({ data: { evaluatorId: W.cara.id, evaluateeId: W.ana.id, relationshipType: 'PEER' } })
  await prisma.evaluatorMapping.deleteMany({ where: { evaluatorId: W.lead.id, evaluateeId: W.ana.id, relationshipType: 'TEAM_LEAD' } })
}

test('closing a round saves its mappings: later org-chart changes do not reach it, and reopening reads today’s again', WEEKLY_DB_TEST, async () => {
  assert.equal((await quarterMappings(periodId)).state.kind, 'live', 'a running round shows today’s mappings')
  const asRun = await pairs()
  await close()

  const view = await quarterMappings(periodId)
  assert.deepEqual([view.state.kind, view.quarter?.id, view.rows.length], ['saved', periodId, asRun.length])
  await changeOrgChart()
  assert.deepEqual(await pairs(), asRun, 'the closed quarter keeps the mappings it ran with')

  await reopenCycle(HR_ACTOR, cycleId, at(13, 2))
  const reopened = await pairs()
  assert.ok(reopened.includes(`${W.cara.id}>${W.ana.id}:PEER`) && !reopened.includes(`${W.lead.id}>${W.ana.id}:TEAM_LEAD`), 'reopened: today’s mappings again')
  assert.equal((await quarterMappings(periodId)).state.kind, 'live')
})

test('locking a closed round keeps the mappings saved at the close, not today’s', WEEKLY_DB_TEST, async () => {
  const asRun = await pairs()
  await close()
  await changeOrgChart()
  await setRoundLock(HR_ACTOR, periodId, true)
  assert.deepEqual(await pairs(), asRun)
  assert.equal((await quarterMappings(periodId)).state.kind, 'saved')
})

test('the next quarter’s list review cannot open while a round is still running', WEEKLY_DB_TEST, async () => {
  const next = await prisma.evaluationPeriod.create({
    data: { name: NEXT, startDate: new Date('2027-01-01T00:00:00Z'), endDate: new Date('2027-03-31T00:00:00Z'), reviewStartDate: new Date('2027-04-05T00:00:00Z'), isActive: false },
  })
  const noMail = (async () => { throw new Error('no email expected') }) as unknown as Parameters<typeof openReviewStage>[3]
  await assert.rejects(
    openReviewStage(HR_ACTOR, next.id, at(12), noMail, 'https://compass.example'),
    (e: unknown) => e instanceof WeeklyError && e.status === 409 && /still running/.test(e.message),
  )
})
