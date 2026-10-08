import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { loadStandardBank } from '../lib/weekly/service/content'
import {
  createCycle, cycleSummary, deleteCycle, findRunningCycle, loadCycle, removeOptIn, setOptIn, updateCycle,
} from '../lib/weekly/service/cycles'
import { WeeklyError } from '../lib/weekly/service/errors'
import { participantsView } from '../lib/weekly/service/round-people'
import { at, HR_ACTOR, WEEK_ONE_MONDAY } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, WEEKLY_PERIOD, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
let periodId = ''

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
})
after(async () => {
  await prisma.$disconnect()
})

test('HR creates one cycle per period, starting on a Monday', WEEKLY_DB_TEST, async () => {
  const cycle = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY })
  assert.equal(cycle.weekOneStartsOn.toISOString(), '2026-10-04T19:00:00.000Z')
  assert.equal(cycle.status, 'SETUP')
  await assert.rejects(createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY }), isStatus(409))
  await assert.rejects(createCycle(weeklyActor(W.ana), { periodId, weekOneStartsOn: WEEK_ONE_MONDAY }), isStatus(403))
  const summary = cycleSummary(await loadCycle(cycle.id), at(2))
  assert.deepEqual([summary.totalWeeks, summary.questionWeeks, summary.currentWeek], [13, 11, 2])
})

test('week 1 must be a Monday that leaves at least three weeks', WEEKLY_DB_TEST, async () => {
  await assert.rejects(createCycle(HR_ACTOR, { periodId, weekOneStartsOn: '2026-10-06' }), /Monday/)
  await assert.rejects(createCycle(HR_ACTOR, { periodId, weekOneStartsOn: '2026-12-21' }), /three weeks/)
})

test('a cycle starts only once the question bank is loaded, and only one runs at a time', WEEKLY_DB_TEST, async () => {
  const cycle = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY })
  await assert.rejects(updateCycle(HR_ACTOR, cycle.id, { action: 'start' }), /question bank/)
  await loadStandardBank(HR_ACTOR)
  assert.equal((await updateCycle(HR_ACTOR, cycle.id, { action: 'start' })).status, 'RUNNING')
  assert.equal((await findRunningCycle())?.id, cycle.id)
  await assert.rejects(updateCycle(HR_ACTOR, cycle.id, { action: 'update', weekOneStartsOn: '2026-10-12' }), isStatus(409))
  const other = await prisma.evaluationPeriod.create({ data: { ...WEEKLY_PERIOD, isActive: false } })
  const second = await createCycle(HR_ACTOR, { periodId: other.id, weekOneStartsOn: WEEK_ONE_MONDAY })
  await assert.rejects(updateCycle(HR_ACTOR, second.id, { action: 'start' }), /already running/)
})

test('setup can change week 1 and the number of question weeks', WEEKLY_DB_TEST, async () => {
  const cycle = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY })
  const updated = await updateCycle(HR_ACTOR, cycle.id, { action: 'update', weekOneStartsOn: '2026-10-12', questionWeeks: 8 })
  assert.equal(updated.weekOneStartsOn.toISOString(), '2026-10-11T19:00:00.000Z')
  assert.equal(updated.questionWeeks, 8)
})

test('HR sets the question weeks; by default they fill the quarter less the two catch-up weeks', WEEKLY_DB_TEST, async () => {
  const set = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY, questionWeeks: 9 })
  const summary = cycleSummary(await loadCycle(set.id), at(2))
  assert.deepEqual([summary.questionWeeks, summary.totalWeeks], [9, 11])
  await deleteCycle(HR_ACTOR, set.id)
  const byDefault = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY })
  assert.equal(byDefault.questionWeeks, 11)
  await deleteCycle(HR_ACTOR, byDefault.id)
  // 13 weeks to the period end leave room for at most 11 question weeks.
  await assert.rejects(createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY, questionWeeks: 12 }), /at most 11/)
})

test('HR sees who is excluded and can opt a late joiner in', WEEKLY_DB_TEST, async () => {
  await prisma.payrollEmployeeProfile.create({ data: { userId: W.ben.id, joiningDate: at(8) } })
  const cycle = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY })
  const benRow = async () => (await participantsView(HR_ACTOR, cycle.id, at(8))).rows.find((r) => r.person.id === W.ben.id)
  assert.equal((await benRow())?.exclusion, 'JOINED_LATE')
  await setOptIn(HR_ACTOR, { cycleId: cycle.id, userId: W.ben.id, reason: 'Transferred from a partner firm' })
  assert.deepEqual([(await benRow())?.exclusion, (await benRow())?.optedIn], [null, true])
  await removeOptIn(HR_ACTOR, { cycleId: cycle.id, userId: W.ben.id })
  assert.equal((await benRow())?.exclusion, 'JOINED_LATE')
  const names = (await participantsView(HR_ACTOR, cycle.id, at(8))).rows.map((r) => r.person.id).filter((id) => id.startsWith('wkt-')).sort()
  // Everyone active is listed, including people with no lists yet (Cara) and HR.
  assert.deepEqual(names, [W.ana.id, W.ben.id, W.cara.id, W.hr.id, W.lead.id].sort())
})

test('HR can remove a cycle that has not started', WEEKLY_DB_TEST, async () => {
  const cycle = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY })
  await setOptIn(HR_ACTOR, { cycleId: cycle.id, userId: W.ben.id, reason: 'Transferred from a partner firm' })
  await assert.rejects(deleteCycle(weeklyActor(W.ana), cycle.id), isStatus(403))
  await deleteCycle(HR_ACTOR, cycle.id)
  assert.equal(await prisma.weeklyCycle.count({ where: { periodId } }), 0)
  assert.equal(await prisma.weeklyParticipantOverride.count({ where: { cycleId: cycle.id } }), 0)
  assert.equal(await prisma.weeklyAuditEvent.count({ where: { action: 'CYCLE_DELETE', objectId: cycle.id } }), 1)
  const started = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY })
  await loadStandardBank(HR_ACTOR)
  await updateCycle(HR_ACTOR, started.id, { action: 'start' })
  await assert.rejects(deleteCycle(HR_ACTOR, started.id), isStatus(409))
})
