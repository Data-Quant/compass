import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { acceptRoundWarning, changeRoundMapping, importRoundLists, participantsView } from '../lib/weekly/service/round-people'
import { createCycle } from '../lib/weekly/service/cycles'
import { openRound } from '../lib/weekly/service/round'
import { loadStandardBank } from '../lib/weekly/service/content'
import { WeeklyError } from '../lib/weekly/service/errors'
import { confirmMyLists } from '../lib/weekly/service/peer-requests'
import { at, HR_ACTOR, reviewStageCycle, WEEK_ONE_MONDAY } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
const send = async () => undefined
const APP = 'https://compass.example'
let cycleId = ''
let periodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
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

test('HR sees who has said their lists look right', WEEKLY_DB_TEST, async () => {
  assert.equal((await row(W.ana.id)).confirmedAt, null)
  await confirmMyLists(weeklyActor(W.ana), at(1, 2))
  assert.equal((await row(W.ana.id)).confirmedAt, at(1, 2).toISOString())
  assert.equal((await row(W.ben.id)).confirmedAt, null)
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

function mailbox() {
  const sent: Array<{ to: string; subject: string }> = []
  return { sent, send: async (to: string, subject: string) => { sent.push({ to, subject }) } }
}
const csv = (text: string) => ({ name: 'lists.csv', bytes: new TextEncoder().encode(text).buffer as ArrayBuffer })

test('each row shows who fills in the person’s quarter-end forms', WEEKLY_DB_TEST, async () => {
  await prisma.evaluatorMapping.create({ data: { evaluatorId: W.hr.id, evaluateeId: W.ana.id, relationshipType: 'HR' } })
  assert.deepEqual((await row(W.ana.id)).quarterEnd.map((q) => `${q.type}:${q.evaluator.id}`), [`HR:${W.hr.id}`])
})

test('in Draft, HR’s changes email nobody; once the review stage is open, both people are told', WEEKLY_DB_TEST, async () => {
  await prisma.weeklyCycle.delete({ where: { id: cycleId } })
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { preEvaluationTriggeredAt: null } })
  const draft = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY })
  const quiet = mailbox()
  process.env.WEEKLY_SEND_EMAILS = 'true'
  await changeRoundMapping(HR_ACTOR, draft.id, { userId: W.cara.id, otherId: W.lead.id, relation: 'LEAD', action: 'ADD', reason: 'Joined Layla’s team' }, at(0), quiet.send, APP)
  assert.equal(quiet.sent.length, 0)
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { preEvaluationTriggeredAt: at(0) } })
  const told = mailbox()
  process.env.WEEKLY_SEND_EMAILS = 'true'
  try {
    await changeRoundMapping(HR_ACTOR, draft.id, { userId: W.ana.id, otherId: W.cara.id, relation: 'PEER', action: 'ADD', reason: 'Same client' }, at(0), told.send, APP)
  } finally {
    delete process.env.WEEKLY_SEND_EMAILS
  }
  assert.equal(told.sent.length, 2)
})

test('HR imports the lists from a spreadsheet: a preview first, then the changes are saved to the round', WEEKLY_DB_TEST, async () => {
  const file = csv('Name,Team Lead 1,Peer 1,Peer 2\nAna Torvik,Layla Mercer,Cara Lindqvist,\nCara Lindqvist,,Ana Torvik,\nNobody Here,Layla Mercer,,\n')
  await assert.rejects(importRoundLists(weeklyActor(W.ana), cycleId, file, false), isStatus(403))
  const preview = await importRoundLists(HR_ACTOR, cycleId, file, false)
  const describe = (c: { action: string; relation: string; person: { name: string }; other: { name: string } }) => `${c.action} ${c.relation} ${c.person.name} / ${c.other.name}`
  assert.deepEqual(preview.changes.map(describe).sort(), ['ADD PEER Ana Torvik / Cara Lindqvist', 'REMOVE PEER Ana Torvik / Ben Okafor'])
  assert.deepEqual(preview.unknownNames, ['Nobody Here'])
  assert.equal(preview.applied, false)
  assert.deepEqual((await row(W.ana.id)).peers.map((p) => p.id), [W.ben.id], 'a preview changes nothing')
  const applied = await importRoundLists(HR_ACTOR, cycleId, file, true)
  assert.equal(applied.applied, true)
  assert.deepEqual((await row(W.ana.id)).peers.map((p) => p.id), [W.cara.id])
  assert.deepEqual((await row(W.ana.id)).leads.map((p) => p.id), [W.lead.id], 'an unchanged lead stays')
  assert.equal((await importRoundLists(HR_ACTOR, cycleId, file, false)).changes.length, 0, 'importing again changes nothing')
  await assert.rejects(importRoundLists(HR_ACTOR, cycleId, csv('Nothing,Here\n'), false), /Name/)
})

test('a spreadsheet can only be imported before the round opens', WEEKLY_DB_TEST, async () => {
  await loadStandardBank(HR_ACTOR)
  await openRound(HR_ACTOR, periodId, at(1), send, APP)
  await assert.rejects(importRoundLists(HR_ACTOR, cycleId, csv('Name,Peer 1\nAna Torvik,Cara Lindqvist\n'), false), /before the round opens/)
})
