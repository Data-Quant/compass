import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { openReviewStage, reviewStageView } from '../lib/weekly/service/review-stage'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
let periodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  await startedCycle(periodId)
})
after(async () => {
  await prisma.$disconnect()
})

test('HR opens the review stage: everyone is sent their lists; leads are not asked to write questions', WEEKLY_DB_TEST, async () => {
  const sent: string[] = []
  const send = async (to: string) => { sent.push(to) }
  await assert.rejects(openReviewStage(weeklyActor(W.ana), periodId, at(1), send, APP), isStatus(403))
  const before = await reviewStageView(HR_ACTOR, periodId)
  assert.equal(before.openedAt, null)

  const result = await openReviewStage(HR_ACTOR, periodId, at(1), send, APP)
  assert.equal('leadTasks' in result, false)
  assert.ok(result.listEmails >= 3, 'everyone with a mapping is sent their lists')
  assert.deepEqual(sent, [], 'emails are off in tests: recorded, not sent')
  const view = await reviewStageView(HR_ACTOR, periodId)
  assert.ok(view.openedAt)
  assert.equal('leads' in view, false)
})
