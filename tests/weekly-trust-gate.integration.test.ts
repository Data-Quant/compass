import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { isSampled } from '../lib/weekly/review-rules'
import { aiSettingsView, updateAiSettings } from '../lib/weekly/service/ai-settings'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { trustedModelNames } from '../lib/weekly/service/calibration-gate'
import { advanceCalibrationRun, startCalibrationRun } from '../lib/weekly/service/calibration-runs'
import { closeCycle, closeView } from '../lib/weekly/service/close'
import { autoAcceptDue } from '../lib/weekly/service/decisions'
import { WeeklyError } from '../lib/weekly/service/errors'
import { runScoring } from '../lib/weekly/service/scoring'
import { answerAs, releaseWeekOne, scoringClock } from './helpers/weekly-answers'
import { approvedTopicId, SCRIPTED_MODEL, scriptedModel, seedCalibrationSet } from './helpers/weekly-calibration-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const HOUR = 60 * 60 * 1000
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

/** The lead's week-1 answer, scored by the scripted model: a plain 2 with high confidence. */
async function scriptedScore(): Promise<string> {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  const responseId = await answerAs(prompt, 'solid')
  await runScoring({ model: scriptedModel(), budgetMs: 30_000, clock: () => scoringClock() })
  return responseId
}
/** A finished calibration-set run of the scripted model over 40 fresh items; by default it agrees with HR on every one. */
async function calibrate(markerFor?: (index: number) => number, when = at(1, 3)): Promise<string> {
  await prisma.weeklyCalibrationItem.deleteMany()
  await seedCalibrationSet(prisma, { count: 40, competencyId: await approvedTopicId(prisma), markerFor })
  const { runId } = await startCalibrationRun(HR_ACTOR, { kind: 'SET', model: SCRIPTED_MODEL }, when)
  await advanceCalibrationRun(runId, 30_000, { resolveModel: () => scriptedModel(), clock: () => when })
  return runId
}
const recordOf = async (responseId: string) => (await loadAnswerRecords({ responseIds: [responseId] }))[0]

test('a score from a model that has not passed calibration goes to HR and is never accepted automatically, not even at close', WEEKLY_DB_TEST, async () => {
  const responseId = await scriptedScore()
  const record = await recordOf(responseId)
  assert.equal(record.state, 'NEEDS_REVIEW')
  assert.ok(record.reasons.includes('UNCALIBRATED_MODEL'))
  assert.deepEqual(await autoAcceptDue(new Date(scoringClock().getTime() + 73 * HOUR), { cycleId }), { accepted: 0 })
  assert.equal((await closeView(HR_ACTOR, cycleId, at(13))).canClose, false)
  await assert.rejects(closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13)), (e: unknown) => e instanceof WeeklyError && /Resolve these first/.test(e.message))
  assert.equal(await prisma.weeklyScoreReview.count({ where: { responseId } }), 0)
})

test('once the model passes calibration its waiting score is handled as usual; a later failing run takes the trust away', WEEKLY_DB_TEST, async () => {
  const responseId = await scriptedScore()
  await calibrate()
  assert.ok((await trustedModelNames()).has(SCRIPTED_MODEL))
  const trusted = await recordOf(responseId)
  assert.ok(!trusted.reasons.includes('UNCALIBRATED_MODEL'))
  assert.equal(trusted.state, isSampled(responseId) ? 'NEEDS_REVIEW' : 'AUTO_ACCEPT_PENDING')
  await calibrate(() => 0, at(1, 4))
  assert.ok(!(await trustedModelNames()).has(SCRIPTED_MODEL))
  assert.ok((await recordOf(responseId)).reasons.includes('UNCALIBRATED_MODEL'))
})

test('a pass on an older scoring prompt does not count, the stand-in is always trusted, and the settings show each model’s gate', WEEKLY_DB_TEST, async () => {
  await updateAiSettings(HR_ACTOR, { action: 'set-price', model: SCRIPTED_MODEL, inputPerMillion: 1, outputPerMillion: 1 }, at(1))
  const untested = (await aiSettingsView(HR_ACTOR)).gates.find((g) => g.model === SCRIPTED_MODEL)!
  assert.deepEqual([untested.trusted, untested.runId], [false, null])
  const runId = await calibrate()
  const passed = (await aiSettingsView(HR_ACTOR)).gates.find((g) => g.model === SCRIPTED_MODEL)!
  assert.deepEqual([passed.trusted, passed.runId, passed.reasons], [true, runId, []])
  await prisma.weeklyCalibrationRun.update({ where: { id: runId }, data: { promptVersion: 'weekly-0' } })
  const names = await trustedModelNames()
  assert.deepEqual([names.has(SCRIPTED_MODEL), names.has('stand-in')], [false, true])
})
