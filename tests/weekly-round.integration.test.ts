import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { roundStage } from '../lib/weekly/round-stage'
import { setupRoundSchema } from '../lib/weekly/schemas'
import { syncFromQuestionBank } from '../lib/weekly/service/content'
import { WeeklyError } from '../lib/weekly/service/errors'
import { myMapping, requestPeerChange } from '../lib/weekly/service/peer-requests'
import { openReviewStage } from '../lib/weekly/service/review-stage'
import { openRound, roundsList, roundView, setupRound } from '../lib/weekly/service/round'
import { approveAllContent, at, HR_ACTOR } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
const send = async () => undefined
const SETUP = { name: 'Q1 2027', startDate: '2027-01-01', endDate: '2027-03-31', weekOneStartsOn: '2027-01-04', questionWeeks: 11, reviewDeadline: '2027-01-01' }

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  await seedWeeklyBase(prisma)
  await syncFromQuestionBank(HR_ACTOR)
  await approveAllContent()
})
after(async () => {
  await prisma.$disconnect()
})

test('the stage comes from the period and its cycle', () => {
  const base = { cycleStatus: 'SETUP' as const, reviewOpenedAt: null, resultsPublishedAt: null }
  assert.equal(roundStage(base), 'DRAFT')
  assert.equal(roundStage({ ...base, reviewOpenedAt: new Date() }), 'REVIEW')
  assert.equal(roundStage({ ...base, cycleStatus: 'RUNNING', reviewOpenedAt: new Date() }), 'OPEN')
  assert.equal(roundStage({ ...base, cycleStatus: 'RUNNING' }), 'OPEN', 'a round opened without a review stage is still open')
  assert.equal(roundStage({ ...base, cycleStatus: 'CLOSED' }), 'CLOSED')
  assert.equal(roundStage({ ...base, cycleStatus: 'CLOSED', resultsPublishedAt: new Date() }), 'RELEASED')
})

test('HR sets up a round in one step: the quarter and its weekly cycle, in Draft', WEEKLY_DB_TEST, async () => {
  await assert.rejects(setupRound(weeklyActor(W.ana), SETUP, at(1)), isStatus(403))
  await assert.rejects(setupRound(HR_ACTOR, { ...SETUP, weekOneStartsOn: '2027-01-05' }, at(1)), /Monday/)
  const { periodId } = await setupRound(HR_ACTOR, SETUP, at(1))
  const view = await roundView(HR_ACTOR, periodId, at(1))
  assert.equal(view.stage, 'DRAFT')
  assert.deepEqual([view.questionWeeks, view.totalWeeks], [11, 13])
  assert.equal(view.next?.action, 'open-review')
  assert.ok((await roundsList(HR_ACTOR)).some((r) => r.periodId === periodId && r.stage === 'DRAFT'))
})

test('opening the round needs the review stage; undecided requests expire; employees then ask HR instead', WEEKLY_DB_TEST, async () => {
  const { periodId } = await setupRound(HR_ACTOR, SETUP, at(1))
  await assert.rejects(openRound(HR_ACTOR, periodId, at(1), send, APP), /review stage/)
  await openReviewStage(HR_ACTOR, periodId, at(1), send, APP)
  assert.equal((await roundView(HR_ACTOR, periodId, at(1))).stage, 'REVIEW')
  const pending = await requestPeerChange(weeklyActor(W.ana), { peerId: W.ben.id, action: 'REMOVE' }, at(1), send, APP)
  const review = await roundView(HR_ACTOR, periodId, at(1))
  assert.equal(review.next?.action, 'open-round')
  assert.ok(review.checklist.some((c) => c.key === 'requests' && !c.done && c.count === 1))

  await openRound(HR_ACTOR, periodId, at(1), send, APP)
  const open = await roundView(HR_ACTOR, periodId, at(1))
  assert.equal(open.stage, 'OPEN')
  assert.equal((await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: pending.id } })).status, 'EXPIRED')
  assert.equal((await prisma.evaluationPeriod.findUniqueOrThrow({ where: { id: periodId } })).isActive, true)
  assert.equal((await myMapping(weeklyActor(W.ana), at(1))).period.locked, true, 'lists are read-only once the round is open')
  await assert.rejects(requestPeerChange(weeklyActor(W.ana), { peerId: W.ben.id, action: 'REMOVE' }, at(1), send, APP), /HR/)
  await assert.rejects(openRound(HR_ACTOR, periodId, at(1), send, APP), isStatus(409))
})

test('the setup form accepts real dates and rejects others', () => {
  assert.equal(setupRoundSchema.safeParse({ name: 'Q1 2027', startDate: '2027-01-01', endDate: '2027-03-31', weekOneStartsOn: '2027-01-04' }).success, true)
  assert.equal(setupRoundSchema.safeParse({ name: 'Q1 2027', startDate: 'dddd-dd-dd', endDate: '2027-03-31', weekOneStartsOn: '2027-01-04' }).success, false)
})
