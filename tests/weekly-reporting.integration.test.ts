import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { INSUFFICIENT_DEFINITION, STANDARD_LEVELS } from '../lib/weekly/content/drafts'
import { updateAiSettings } from '../lib/weekly/service/ai-settings'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { startCalibrationRun } from '../lib/weekly/service/calibration-runs'
import { approveProfile, saveProfileDraft } from '../lib/weekly/service/content'
import { runWeeklyDailyJob } from '../lib/weekly/service/daily-job'
import { dashboardView } from '../lib/weekly/service/dashboard'
import { correctAnswer } from '../lib/weekly/service/review-queue'
import { runScoring } from '../lib/weekly/service/scoring'
import { answerAs, answerFor, releaseWeekOne, scoringClock } from './helpers/weekly-answers'
import { approvedTopicId, SCRIPTED_MODEL, scriptedModel, seedCalibrationSet } from './helpers/weekly-calibration-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}
/** The stand-in gives the long answer a 4 ("adopted") and the short one a 2, so length and score move together. */
const LONG = {
  situation: `Project Kestrel moved forward a full week ${words(20)}`,
  action: `They split the work between named owners ${words(30)}`,
  result: `Two other teams have since adopted the plan ${words(30)}`,
}
const SHORT = {
  situation: `The monthly report was due ${words(10)}`,
  action: `They prepared it from the agreed model ${words(12)}`,
  result: `It went out on schedule ${words(12)}`,
}
let cycleId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await startedCycle(periodId))
  delete process.env.FIREWORKS_API_KEY
  delete process.env.FIREWORKS_MODEL
})
afterEach(() => {
  delete process.env.WEEKLY_SEND_EMAILS
})
after(async () => {
  await prisma.$disconnect()
})

test('the dashboard shows the quarter’s AI cost per model, and none until every model used has a price', WEEKLY_DB_TEST, async () => {
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  await answerAs(prompts.get(W.lead.id)!, 'solid')
  await runScoring({ model: scriptedModel(), budgetMs: 30_000, clock: () => scoringClock() })
  await answerAs(prompts.get(W.ana.id)!, 'solid')
  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
  const unpriced = await dashboardView(HR_ACTOR, cycleId, at(2))
  assert.deepEqual([unpriced.aiCost.usd, unpriced.aiCost.unpricedModels, unpriced.aiCost.inputTokens], [null, [SCRIPTED_MODEL], 1000])
  assert.equal(unpriced.gate, null)
  await updateAiSettings(HR_ACTOR, { action: 'set-price', model: SCRIPTED_MODEL, inputPerMillion: 1, outputPerMillion: 2 }, at(2))
  const priced = await dashboardView(HR_ACTOR, cycleId, at(2))
  assert.equal(priced.aiCost.usd, 0.0012)
  assert.deepEqual(priced.aiCost.byModel.map((m) => [m.model, m.usd]), [[SCRIPTED_MODEL, 0.0012], ['stand-in', 0]])
})

test('standards used lists each topic’s profile versions and how many answers were scored against each', WEEKLY_DB_TEST, async () => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  const responseId = await answerAs(prompt, 'solid')
  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
  const [record] = await loadAnswerRecords({ responseIds: [responseId] })
  const draft = await saveProfileDraft(HR_ACTOR, record.competencyId!, { levels: STANDARD_LEVELS, insufficientDefinition: INSUFFICIENT_DEFINITION })
  await approveProfile(HR_ACTOR, draft.id)
  const text = answerFor('solid', prompt)
  await correctAnswer(HR_ACTOR, responseId, { ...text, shortfall: null, result: `${text.result} It was also filed on time.`, reason: 'Added the filing date' }, at(1, 3))
  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => at(1, 3) })
  const topic = (await dashboardView(HR_ACTOR, cycleId, at(2))).standards.find((s) => s.topic === record.topic)!
  assert.deepEqual(topic.versions.map((v) => [v.version, v.answers, v.status]), [[1, 1, 'RETIRED'], [2, 1, 'APPROVED']])
})

test('on the first daily run of each Karachi month HR gets the length–score check, with an alert above 0.3', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_SEND_EMAILS = 'true'
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  await answerAs(prompts.get(W.lead.id)!, LONG)
  await answerAs(prompts.get(W.ben.id)!, SHORT)
  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
  const lengthMails = (mail: ReturnType<typeof mailbox>) => mail.sent.filter((m) => m.to === 'wkt-hr@example.test' && m.subject.startsWith('Weekly evaluations: length–score check'))
  const october = mailbox()
  await runWeeklyDailyJob(october.send, APP, at(4), { model: fakeModel() })
  const [email] = lengthMails(october)
  assert.equal(email?.to, 'wkt-hr@example.test')
  assert.match(email.html, /1\.00/)
  assert.match(email.html, /Alert:/)
  const later = mailbox()
  await runWeeklyDailyJob(later.send, APP, at(4, 2), { model: fakeModel() })
  assert.equal(lengthMails(later).length, 0)
  const november = mailbox()
  await runWeeklyDailyJob(november.send, APP, at(5), { model: fakeModel() })
  assert.equal(lengthMails(november).length, 1)
})

test('the daily job continues running calibration runs, with or without a quarter running', WEEKLY_DB_TEST, async () => {
  await seedCalibrationSet(prisma, { count: 3, competencyId: await approvedTopicId(prisma) })
  const model = scriptedModel()
  const first = await startCalibrationRun(HR_ACTOR, { kind: 'SET', model: SCRIPTED_MODEL }, at(1))
  const withCycle = await runWeeklyDailyJob(mailbox().send, APP, at(1, 2), { model: fakeModel(), resolveModel: () => model })
  assert.deepEqual(withCycle.calibration.map((p) => [p.runId, p.status]), [[first.runId, 'DONE']])
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: at(1, 2) } })
  const second = await startCalibrationRun(HR_ACTOR, { kind: 'SET', model: SCRIPTED_MODEL }, at(1, 3))
  const withoutCycle = await runWeeklyDailyJob(mailbox().send, APP, at(1, 4), { resolveModel: () => model })
  assert.deepEqual([withoutCycle.cycleId, withoutCycle.calibration.map((p) => [p.runId, p.status])], [null, [[second.runId, 'DONE']]])
})

test('the daily job sends its digests before it continues calibration, so a slow model cannot cost the day’s emails', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_SEND_EMAILS = 'true'
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  await answerAs(prompts.get(W.lead.id)!, LONG)
  await answerAs(prompts.get(W.ben.id)!, SHORT)
  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
  await seedCalibrationSet(prisma, { count: 1, competencyId: await approvedTopicId(prisma) })
  await startCalibrationRun(HR_ACTOR, { kind: 'SET', model: SCRIPTED_MODEL }, at(3))
  const mail = mailbox()
  const inner = scriptedModel()
  let sentBeforeCalibration = -1
  const model = { ...inner, async complete(request: Parameters<typeof inner.complete>[0]) { if (sentBeforeCalibration < 0) sentBeforeCalibration = mail.sent.filter((m) => m.to === 'wkt-hr@example.test' && m.subject.startsWith('Weekly evaluations: length–score check')).length; return inner.complete(request) } }
  await runWeeklyDailyJob(mail.send, APP, at(4), { model: fakeModel(), resolveModel: () => model })
  assert.equal(sentBeforeCalibration, 1)
})
