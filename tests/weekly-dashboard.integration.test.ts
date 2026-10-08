import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { dashboardView, lowEvidenceRows } from '../lib/weekly/service/dashboard'
import { WeeklyError } from '../lib/weekly/service/errors'
import { markNotObserved } from '../lib/weekly/service/inbox'
import { answerAs, releaseWeekOne } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

let cycleId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await startedCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

test('at the start every person and group is low on evidence', WEEKLY_DB_TEST, async () => {
  await releaseWeekOne(cycleId)
  const rows = await lowEvidenceRows(cycleId)
  // ana and ben each have a LEAD and a PEER group; the lead has an UPWARD group.
  assert.deepEqual(rows.map((r) => `${r.evaluatee.id}|${r.perspective}`).sort(), [`${W.ana.id}|LEAD`, `${W.ana.id}|PEER`, `${W.ben.id}|LEAD`, `${W.ben.id}|PEER`, `${W.lead.id}|UPWARD`])
})

test('the dashboard shows coverage and response rates', WEEKLY_DB_TEST, async () => {
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  await answerAs(prompts.get(W.lead.id)!, 3)
  await answerAs(prompts.get(W.ana.id)!, 2)
  await markNotObserved(weeklyActor(W.ben), { evaluatorId: W.ben.id, actingAs: false }, prompts.get(W.ben.id)!.id, at(1, 2))

  await assert.rejects(dashboardView(weeklyActor(W.lead), cycleId, at(2)), (e: unknown) => e instanceof WeeklyError && e.status === 403)
  const view = await dashboardView(HR_ACTOR, cycleId, at(2))
  assert.equal(view.cycle.currentWeek, 2)
  const leadGroup = view.coverage.find((c) => c.evaluatee.id === prompts.get(W.lead.id)!.evaluateeId && c.perspective === 'LEAD')!
  // Three common topics and four Product topics.
  assert.deepEqual([leadGroup.satisfied, leadGroup.total, leadGroup.lowEvidence], [1, 7, true])
  const stats = new Map(view.evaluators.map((e) => [e.evaluator.id, e]))
  assert.deepEqual([stats.get(W.lead.id)!.answered, stats.get(W.lead.id)!.responseRate], [1, 1])
  assert.deepEqual([stats.get(W.ben.id)!.notObserved, stats.get(W.ben.id)!.responseRate], [1, 1])
  assert.deepEqual([stats.get(W.ana.id)!.answered, stats.get(W.ana.id)!.open, stats.get(W.ana.id)!.overdue, stats.get(W.ana.id)!.responseRate], [1, 0, 0, 1])
  assert.deepEqual(view.drift, [], 'too few answers to compare evaluators')
})
