import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { acceptRoundWarning, changeRoundMapping, participantsView } from '../lib/weekly/service/round-people'
import { WeeklyError } from '../lib/weekly/service/errors'
import { at, HR_ACTOR, reviewStageCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
const send = async () => undefined
const APP = 'https://compass.example'
let cycleId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await reviewStageCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

const row = async (id: string) => (await participantsView(HR_ACTOR, cycleId, at(1))).rows.find((r) => r.person.id === id)!

test('each person shows their lead, team and peers, with warnings for no lead and fewer than two peers', WEEKLY_DB_TEST, async () => {
  const ana = await row(W.ana.id)
  assert.deepEqual([ana.leads.map((p) => p.id), ana.peers.map((p) => p.id)], [[W.lead.id], [W.ben.id]])
  assert.deepEqual(ana.warnings.map((w) => w.key), ['FEW_PEERS'])
  const lead = await row(W.lead.id)
  assert.deepEqual(lead.reports.map((p) => p.id).sort(), [W.ana.id, W.ben.id].sort())
  assert.deepEqual(lead.warnings.map((w) => w.key).sort(), ['FEW_PEERS', 'NO_LEAD'])
  // Cara has no mapping at all, and is still listed so HR can see the gap.
  assert.deepEqual((await row(W.cara.id)).warnings.map((w) => w.key).sort(), ['FEW_PEERS', 'NO_LEAD'])
})

test('HR accepts a warning with a reason, and it shows as accepted', WEEKLY_DB_TEST, async () => {
  await assert.rejects(acceptRoundWarning(weeklyActor(W.ana), cycleId, { userId: W.lead.id, warning: 'NO_LEAD', reason: 'Reports to a partner' }), isStatus(403))
  await acceptRoundWarning(HR_ACTOR, cycleId, { userId: W.lead.id, warning: 'NO_LEAD', reason: 'Reports to a partner' })
  assert.equal((await row(W.lead.id)).warnings.find((w) => w.key === 'NO_LEAD')?.acceptedReason, 'Reports to a partner')
})

test('HR changes a person’s lists for this round: both directions, with a reason', WEEKLY_DB_TEST, async () => {
  await assert.rejects(changeRoundMapping(HR_ACTOR, cycleId, { userId: W.cara.id, otherId: W.lead.id, relation: 'LEAD', action: 'ADD', reason: '' }, at(1), send, APP), /reason/i)
  await changeRoundMapping(HR_ACTOR, cycleId, { userId: W.cara.id, otherId: W.lead.id, relation: 'LEAD', action: 'ADD', reason: 'Joined Layla’s team' }, at(1), send, APP)
  assert.deepEqual((await row(W.cara.id)).leads.map((p) => p.id), [W.lead.id])
  assert.ok((await row(W.lead.id)).reports.some((p) => p.id === W.cara.id))
  await changeRoundMapping(HR_ACTOR, cycleId, { userId: W.ana.id, otherId: W.ben.id, relation: 'PEER', action: 'REMOVE', reason: 'Different clients now' }, at(1), send, APP)
  assert.deepEqual((await row(W.ben.id)).peers, [])
  await assert.rejects(changeRoundMapping(weeklyActor(W.ana), cycleId, { userId: W.ana.id, otherId: W.cara.id, relation: 'PEER', action: 'ADD', reason: 'x y z' }, at(1), send, APP), isStatus(403))
})
