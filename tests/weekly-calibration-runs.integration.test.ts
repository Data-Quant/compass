import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { gateResult, parseSummary } from '../lib/weekly/calibration-rules'
import { updateAiSettings } from '../lib/weekly/service/ai-settings'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { updateCalibrationItem } from '../lib/weekly/service/calibration-items'
import {
  advanceCalibrationRun, continueCalibrationRun, continueCalibrationRuns, MODEL_UNAVAILABLE, startCalibrationRun,
} from '../lib/weekly/service/calibration-runs'
import { calibrationRunDetail, calibrationRunsView } from '../lib/weekly/service/calibration-views'
import { decideAnswer } from '../lib/weekly/service/decisions'
import { WeeklyError } from '../lib/weekly/service/errors'
import { runScoring } from '../lib/weekly/service/scoring'
import { answerAs, releaseWeekOne, scoringClock } from './helpers/weekly-answers'
import { approvedTopicId, judgementFor, SCRIPTED_MODEL, scriptedModel, seedCalibrationSet } from './helpers/weekly-calibration-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isError = (status: number, pattern?: RegExp) => (e: unknown) => e instanceof WeeklyError && e.status === status && (!pattern || pattern.test(e.message))
let cycleId = ''
let competencyId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await startedCycle(periodId))
  competencyId = await approvedTopicId(prisma)
})
afterEach(() => {
  delete process.env.WEEKLY_TEST_TOOLS
})
after(async () => {
  await prisma.$disconnect()
})

const advance = (runId: string, model = scriptedModel(), when = at(1, 3)) => advanceCalibrationRun(runId, 30_000, { resolveModel: () => model, clock: () => when })
const summaryOf = async (runId: string) => parseSummary((await prisma.weeklyCalibrationRun.findUniqueOrThrow({ where: { id: runId } })).summary)!
/** HR's score moved one level (a 4 becomes a 3): within one, never exact. */
const offByOne = (index: number) => {
  const { hrScore } = judgementFor(index)
  return hrScore === null ? 0 : hrScore === 4 ? 3 : hrScore + 1
}

test('a calibration-set run scores every active item and reports agreement, cost and topics without touching the quarter', WEEKLY_DB_TEST, async () => {
  await seedCalibrationSet(prisma, { count: 40, competencyId, markerFor: (i) => (i < 7 && i !== 4 ? offByOne(i) : judgementFor(i).hrScore ?? 0) })
  const [archived] = await seedCalibrationSet(prisma, { count: 1, competencyId })
  await prisma.weeklyCalibrationItem.update({ where: { id: archived }, data: { archivedAt: at(1) } })
  await updateAiSettings(HR_ACTOR, { action: 'set-price', model: SCRIPTED_MODEL, inputPerMillion: 1, outputPerMillion: 2 }, at(1))
  const { runId, itemCount } = await startCalibrationRun(HR_ACTOR, { kind: 'SET', model: SCRIPTED_MODEL }, at(1, 2))
  assert.equal(itemCount, 40)
  const progress = await advance(runId)
  assert.deepEqual([progress.status, progress.completed, progress.itemCount, progress.busy], ['DONE', 40, 40, false])
  const summary = await summaryOf(runId)
  assert.deepEqual([summary.items, summary.compared, summary.errors, summary.exact, summary.withinOne, summary.exactRate], [40, 40, 0, 34, 40, 0.85])
  assert.deepEqual([summary.inputTokens, summary.outputTokens, summary.costUsd], [40_000, 4_000, 0.048])
  const topic = await prisma.weeklyCompetency.findUniqueOrThrow({ where: { id: competencyId } })
  assert.deepEqual(summary.byTopic, [{ topic: topic.name, compared: 40, exact: 34, withinOne: 40 }])
  const [row] = (await calibrationRunsView(HR_ACTOR)).runs
  assert.deepEqual([row.status, row.kind, row.model, row.completed, row.costUsd, row.gate?.passed], ['DONE', 'SET', SCRIPTED_MODEL, 40, 0.048, true])
  const detail = await calibrationRunDetail(HR_ACTOR, runId)
  assert.equal(detail.results.filter((r) => r.exact === false).length, 6)
  assert.ok(detail.results.every((r) => r.completed && r.ai !== null))
  assert.deepEqual([await prisma.weeklyAiScore.count(), await prisma.weeklyScoreReview.count()], [0, 0])
})

test('only HR starts runs; the model must be a Fireworks id, and the stand-in only on the preview', WEEKLY_DB_TEST, async () => {
  await assert.rejects(startCalibrationRun(HR_ACTOR, { kind: 'SET', model: SCRIPTED_MODEL }, at(1)), isError(409, /Add calibration items first/))
  await seedCalibrationSet(prisma, { count: 2, competencyId })
  await assert.rejects(startCalibrationRun(weeklyActor(W.lead), { kind: 'SET', model: SCRIPTED_MODEL }, at(1)), isError(403))
  await assert.rejects(startCalibrationRun(HR_ACTOR, { kind: 'SET', model: 'gpt-4o' }, at(1)), isError(400, /Fireworks model id/))
  await assert.rejects(startCalibrationRun(HR_ACTOR, { kind: 'SET', model: 'stand-in' }, at(1)), isError(400))
  process.env.WEEKLY_TEST_TOOLS = 'true'
  const preview = await startCalibrationRun(HR_ACTOR, { kind: 'SET', model: 'stand-in' }, at(1))
  assert.equal((await advanceCalibrationRun(preview.runId, 30_000, { resolveModel: () => fakeModel(), clock: () => at(1, 2) })).status, 'DONE')
  const blocked = await startCalibrationRun(HR_ACTOR, { kind: 'SET', model: SCRIPTED_MODEL }, at(1, 3))
  assert.equal((await advanceCalibrationRun(blocked.runId, 30_000, { resolveModel: () => null, clock: () => at(1, 4) })).status, 'FAILED')
  assert.equal((await summaryOf(blocked.runId)).failure, MODEL_UNAVAILABLE)
  await assert.rejects(continueCalibrationRun(weeklyActor(W.lead), blocked.runId), isError(403))
})

test('two workers advancing the same run at once score each item once; the second reports it busy', WEEKLY_DB_TEST, async () => {
  await seedCalibrationSet(prisma, { count: 8, competencyId })
  const { runId } = await startCalibrationRun(HR_ACTOR, { kind: 'SET', model: SCRIPTED_MODEL }, at(1))
  const model = scriptedModel()
  const results = await Promise.all([advance(runId, model), advance(runId, model)])
  assert.deepEqual(results.map((r) => r.busy).sort(), [false, true])
  assert.equal(model.requests.length, 8)
  assert.equal(await prisma.weeklyCalibrationResult.count({ where: { runId, completedAt: { not: null } } }), 8)
  assert.equal((await prisma.weeklyCalibrationRun.findUniqueOrThrow({ where: { id: runId } })).status, 'DONE')
  // The daily job's sweep finds nothing left to do.
  assert.deepEqual(await continueCalibrationRuns(10_000, { resolveModel: () => model, clock: () => at(1, 4) }), [])
})

test('a run keeps the targets it started with, and model errors are counted but never compared', WEEKLY_DB_TEST, async () => {
  const ids = await seedCalibrationSet(prisma, { count: 40, competencyId })
  await prisma.weeklyCalibrationItem.updateMany({ where: { id: { in: ids.slice(10, 13) } }, data: { situation: 'Item [fail]: the model cannot read this one.' } })
  const { runId } = await startCalibrationRun(HR_ACTOR, { kind: 'SET', model: SCRIPTED_MODEL }, at(1))
  const second = await prisma.weeklyCalibrationItem.findUniqueOrThrow({ where: { id: ids[1] } })
  await updateCalibrationItem(HR_ACTOR, ids[0], { op: 'archive' }, at(1, 2))
  await updateCalibrationItem(HR_ACTOR, ids[1], {
    op: 'edit', competencyId, question: second.question, situation: second.situation, action: second.action, result: second.result, hrSufficiency: 'SUFFICIENT', hrScore: 4,
  }, at(1, 2))
  const model = scriptedModel()
  assert.equal((await advance(runId, model)).status, 'DONE')
  const summary = await summaryOf(runId)
  assert.deepEqual([summary.items, summary.errors, summary.compared, summary.exact], [40, 3, 37, 37])
  const gate = gateResult(summary)
  assert.equal(gate.passed, false)
  assert.ok(gate.reasons.some((reason) => /^Errors on/.test(reason)), gate.reasons.join(' | '))
  assert.equal((await prisma.weeklyCalibrationResult.findFirstOrThrow({ where: { runId, itemId: ids[1] } })).targetScore, judgementFor(1).hrScore)
  assert.equal(model.requests.length, 37 + 3 * 2, 'each failing item is retried once')
})

test('re-scoring a quarter compares the AI with HR’s final decisions, removes names and changes nothing', WEEKLY_DB_TEST, async () => {
  await assert.rejects(startCalibrationRun(HR_ACTOR, { kind: 'CYCLE', cycleId, model: SCRIPTED_MODEL }, at(1)), isError(409, /no decided answers/))
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  const lead = await answerAs(prompts.get(W.lead.id)!, 'strong')
  const ben = await answerAs(prompts.get(W.ben.id)!, 'solid')
  const ana = await answerAs(prompts.get(W.ana.id)!, 'solid')
  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
  const basedOn = async (id: string) => {
    const [r] = await loadAnswerRecords({ responseIds: [id] })
    return { aiScoreId: r.aiScore?.id ?? null, reviewId: r.latestReview?.id ?? null }
  }
  await decideAnswer(HR_ACTOR, lead, { action: 'ACCEPT', basedOn: await basedOn(lead) }, at(1, 3))
  await decideAnswer(HR_ACTOR, ben, { action: 'SET_SCORE', score: 3, reason: 'Clearer than it reads', basedOn: await basedOn(ben) }, at(1, 3))
  await decideAnswer(HR_ACTOR, ana, { action: 'EXCLUDE', reason: 'About the wrong person', basedOn: await basedOn(ana) }, at(1, 3))
  const before = [await prisma.weeklyAiScore.count(), await prisma.weeklyScoreReview.count()]
  const { runId, itemCount } = await startCalibrationRun(HR_ACTOR, { kind: 'CYCLE', cycleId, model: SCRIPTED_MODEL }, at(2))
  assert.equal(itemCount, 2)
  const model = scriptedModel()
  await advance(runId, model, at(2, 2))
  const results = await prisma.weeklyCalibrationResult.findMany({ where: { runId } })
  assert.deepEqual(
    results.map((r) => [r.responseId, r.targetSufficiency, r.targetScore, r.score]).sort(),
    [[lead, 'SUFFICIENT', 4, 2], [ben, 'SUFFICIENT', 3, 2]].sort(),
  )
  const summary = await summaryOf(runId)
  assert.deepEqual([summary.compared, summary.exact, summary.withinOne], [2, 0, 1])
  for (const request of model.requests) {
    for (const name of ['Layla', 'Mercer', 'Ana', 'Torvik', 'Ben', 'Okafor']) assert.doesNotMatch(request.user, new RegExp(`\\b${name}\\b`), `${name} was sent`)
  }
  assert.deepEqual([await prisma.weeklyAiScore.count(), await prisma.weeklyScoreReview.count()], before)
  assert.equal((await calibrationRunsView(HR_ACTOR)).runs[0].gate, null)
})
