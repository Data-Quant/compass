import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { evaluationsCard } from '../lib/weekly/service/dashboard-card'
import { confirmMyLists } from '../lib/weekly/service/peer-requests'
import { releaseWeek } from '../lib/weekly/service/release'
import { submitSelfReview } from '../lib/weekly/service/self-review'
import { answerAs } from './helpers/weekly-answers'
import { at, HR_ACTOR, reviewStageCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'
import { loadStandardBank } from '../lib/weekly/service/content'
import { updateCycle } from '../lib/weekly/service/cycles'

const ana = weeklyActor(W.ana)
const send = async () => undefined
let periodId = ''
let cycleId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  ;({ cycleId } = await reviewStageCycle(periodId))
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { reviewDeadline: new Date('2026-10-02T00:00:00.000Z') } })
})
after(async () => {
  await prisma.$disconnect()
})

const start = async () => {
  await loadStandardBank(HR_ACTOR)
  await updateCycle(HR_ACTOR, cycleId, { action: 'start' })
}

test('review stage: "Check your lists by [date]" until the person confirms them', WEEKLY_DB_TEST, async () => {
  const card = await evaluationsCard(ana, at(0))
  assert.equal(card?.state, 'CHECK_LISTS')
  assert.match(card?.message ?? '', /^Check your Q4 2026 \(weekly test\) evaluation lists by /)
  assert.equal(card?.href, '/evaluations/weekly')
  await confirmMyLists(ana, at(0))
  assert.notEqual((await evaluationsCard(ana, at(0)))?.state, 'CHECK_LISTS')
})

test('round open: "This week: 1 of 2 done, due Sunday", counting carried-over questions; then "All caught up"', WEEKLY_DB_TEST, async () => {
  await start()
  await releaseWeek(cycleId, 1, at(1))
  await releaseWeek(cycleId, 2, at(2))
  const open = await prisma.weeklyPrompt.findMany({ where: { evaluatorId: W.lead.id, status: 'OPEN', kind: 'STANDARD' }, orderBy: { weekIndex: 'asc' } })
  assert.equal(open.length, 2, 'one from week 1 carried over, one from week 2')
  const lead = weeklyActor(W.lead)
  const card = await evaluationsCard(lead, at(2, 2))
  assert.deepEqual([card?.state, card?.message], ['THIS_WEEK', 'This week: 0 of 2 done, due Sunday 18 Oct'])
  assert.equal(card?.detail, '1 from last week')
  await answerAs(open[0], 2, at(2, 2))
  assert.equal((await evaluationsCard(lead, at(2, 2)))?.message, 'This week: 1 of 2 done, due Sunday 18 Oct')
  await answerAs(open[1], 2, at(2, 2))
  assert.deepEqual([(await evaluationsCard(lead, at(2, 2)))?.state, (await evaluationsCard(lead, at(2, 2)))?.message], ['CAUGHT_UP', 'All caught up. Next questions Monday'])
})

test('the month’s self-evaluation shows on the card, and a lead sees who has sent theirs', WEEKLY_DB_TEST, async () => {
  await start()
  assert.match((await evaluationsCard(ana, at(4)))?.selfReview ?? '', /self-evaluation for October/)
  await submitSelfReview(ana, { month: 1, answers: [Array(31).fill('done').join(' '), '', ''], wantsDiscussion: false }, at(4), send, 'https://compass.example')
  assert.equal((await evaluationsCard(ana, at(4)))?.selfReview, null)
  assert.deepEqual((await evaluationsCard(weeklyActor(W.lead), at(4)))?.leadNotices, [`${W.ana.name} has submitted their self-evaluation for October`])
})

test('round closed: "Round closed"; nothing before a round exists', WEEKLY_DB_TEST, async () => {
  await start()
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: at(13) } })
  assert.deepEqual([(await evaluationsCard(ana, at(13, 2)))?.state, (await evaluationsCard(ana, at(13, 2)))?.message], ['CLOSED', 'Round closed. HR will share your report.'])
  await prisma.weeklyCycle.deleteMany({ where: { id: cycleId } })
  assert.equal(await evaluationsCard(ana, at(13, 2)), null)
})
