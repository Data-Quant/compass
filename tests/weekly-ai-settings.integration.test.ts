import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { FAKE_MODEL_NAME } from '../lib/weekly/ai/model'
import { aiSettingsSchema } from '../lib/weekly/schemas'
import { aiSettingsView, loadAiSettings, resolveActiveModel, updateAiSettings } from '../lib/weekly/service/ai-settings'
import { runWeeklyDailyJob } from '../lib/weekly/service/daily-job'
import { WeeklyError } from '../lib/weekly/service/errors'
import { scoreResponseSoon } from '../lib/weekly/service/scoring'
import { answerAs, releaseWeekOne } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const CHOSEN = 'accounts/fireworks/models/chosen-model'
const ENV_MODEL = 'accounts/fireworks/models/env-model'
const ENV_KEYS = ['FIREWORKS_API_KEY', 'FIREWORKS_MODEL', 'WEEKLY_TEST_TOOLS', 'WEEKLY_AI_FAKE'] as const
const PLAIN = { sufficiency: 'SUFFICIENT', score: 2, confidence: 'HIGH', criteriaMet: [], criteriaNotDemonstrated: [], evidenceQuotes: [], rationale: 'Meets.', flags: [] }
const realFetch = globalThis.fetch
const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status

/** Stands in for Fireworks and records the model each request names: nothing leaves the machine. */
function stubFireworks(): string[] {
  const models: string[] = []
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    models.push(String(JSON.parse(String(init?.body)).model))
    const body = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(PLAIN) } }], usage: { prompt_tokens: 50, completion_tokens: 10 } }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
  return models
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
  process.env.FIREWORKS_API_KEY = 'test-key-not-real'
  process.env.FIREWORKS_MODEL = ENV_MODEL
})
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  globalThis.fetch = realFetch
})
after(async () => {
  await prisma.$disconnect()
})

test('HR’s active model replaces FIREWORKS_MODEL until it is cleared, and each change is audited', WEEKLY_DB_TEST, async () => {
  assert.equal((await resolveActiveModel())?.name, ENV_MODEL)
  await updateAiSettings(HR_ACTOR, { action: 'set-active', model: CHOSEN }, at(1))
  assert.equal((await resolveActiveModel())?.name, CHOSEN)
  const view = await aiSettingsView(HR_ACTOR)
  assert.deepEqual(
    [view.activeModel, view.envModel, view.effectiveModel, view.apiKeyConfigured, view.standInForced, view.updatedAt, view.updatedBy],
    [CHOSEN, ENV_MODEL, CHOSEN, true, false, at(1).toISOString(), W.hr.name],
  )
  await updateAiSettings(HR_ACTOR, { action: 'set-active', model: null }, at(1, 2))
  assert.equal((await resolveActiveModel())?.name, ENV_MODEL)
  const events = await prisma.weeklyAuditEvent.findMany({ where: { action: 'AI_MODEL_SET' } })
  assert.equal(events.length, 2)
  assert.ok(events.some((e) => (e.after as { activeModel: string | null }).activeModel === CHOSEN))
  await assert.rejects(updateAiSettings(weeklyActor(W.lead), { action: 'set-active', model: CHOSEN }, at(1)), isStatus(403))
  await assert.rejects(aiSettingsView(weeklyActor(W.lead)), isStatus(403))
})

test('prices are kept per model, two HR edits at once both survive, and bad ids or prices are refused', WEEKLY_DB_TEST, async () => {
  const A = 'accounts/fireworks/models/model-a'
  const B = 'accounts/fireworks/models/model-b'
  await Promise.all([
    updateAiSettings(HR_ACTOR, { action: 'set-price', model: A, inputPerMillion: 0.9, outputPerMillion: 0.9 }, at(1)),
    updateAiSettings(HR_ACTOR, { action: 'set-price', model: B, inputPerMillion: 3, outputPerMillion: 8 }, at(1)),
  ])
  assert.deepEqual((await loadAiSettings()).prices, { [A]: { inputPerMillion: 0.9, outputPerMillion: 0.9 }, [B]: { inputPerMillion: 3, outputPerMillion: 8 } })
  await updateAiSettings(HR_ACTOR, { action: 'remove-price', model: A }, at(1, 2))
  assert.deepEqual((await aiSettingsView(HR_ACTOR)).prices, [{ model: B, inputPerMillion: 3, outputPerMillion: 8 }])
  assert.equal(aiSettingsSchema.safeParse({ action: 'set-active', model: 'gpt-4o' }).success, false)
  assert.equal(aiSettingsSchema.safeParse({ action: 'set-active', model: 'stand-in' }).success, false)
  assert.equal(aiSettingsSchema.safeParse({ action: 'set-price', model: A, inputPerMillion: -1, outputPerMillion: 1 }).success, false)
  assert.equal(aiSettingsSchema.safeParse({ action: 'set-active', model: ` ${CHOSEN} ` }).success, true)
})

test('scoring after submit and the daily job score with the active model (Fireworks is stubbed)', WEEKLY_DB_TEST, async () => {
  const models = stubFireworks()
  await updateAiSettings(HR_ACTOR, { action: 'set-active', model: CHOSEN }, at(1))
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  const lead = await answerAs(prompts.get(W.lead.id)!, 'solid')
  await scoreResponseSoon(lead)
  const ben = await answerAs(prompts.get(W.ben.id)!, 'solid')
  await runWeeklyDailyJob(async () => undefined, 'https://compass.example', at(1, 3))
  assert.deepEqual(models, [CHOSEN, CHOSEN])
  for (const responseId of [lead, ben]) assert.equal((await prisma.weeklyAiScore.findFirstOrThrow({ where: { responseId } })).model, CHOSEN)
})

test('without an API key there is no model, and the preview’s forced stand-in wins over HR’s choice', WEEKLY_DB_TEST, async () => {
  await updateAiSettings(HR_ACTOR, { action: 'set-active', model: CHOSEN }, at(1))
  delete process.env.FIREWORKS_API_KEY
  assert.equal(await resolveActiveModel(), null)
  const keyless = await aiSettingsView(HR_ACTOR)
  assert.deepEqual([keyless.effectiveModel, keyless.apiKeyConfigured], [null, false])
  process.env.WEEKLY_TEST_TOOLS = 'true'
  process.env.WEEKLY_AI_FAKE = 'true'
  assert.equal((await resolveActiveModel())?.name, FAKE_MODEL_NAME)
  const preview = await aiSettingsView(HR_ACTOR)
  assert.deepEqual([preview.effectiveModel, preview.standInForced, preview.standInAvailable], [FAKE_MODEL_NAME, true, true])
})
