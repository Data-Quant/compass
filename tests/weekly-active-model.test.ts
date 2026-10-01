import test from 'node:test'
import assert from 'node:assert/strict'
import { activeModelFor, activeModelName, calibrationModelFor, configuredModel, fireworksModelFor } from '../lib/weekly/ai/configured'
import { FAKE_MODEL_NAME, ModelError, type StructuredModel } from '../lib/weekly/ai/model'
import { scoreOnce } from '../lib/weekly/ai/score-once'
import type { ScoringInput } from '../lib/weekly/ai/scoring-prompt'
import { STANDARD_LEVELS } from '../lib/weekly/content/drafts'

const CHOSEN = 'accounts/fireworks/models/chosen-model'
const ENV = { FIREWORKS_API_KEY: 'k', FIREWORKS_MODEL: 'accounts/fireworks/models/env-model' }
const PREVIEW = { ...ENV, WEEKLY_EVALUATIONS_ENABLED: 'true', WEEKLY_TEST_TOOLS: 'true', WEEKLY_AI_FAKE: 'true' }

test('HR’s active model wins over FIREWORKS_MODEL; there is no model without a key; the preview can force the stand-in', () => {
  assert.equal(activeModelName(null, ENV), ENV.FIREWORKS_MODEL)
  assert.equal(activeModelName(CHOSEN, ENV), CHOSEN)
  assert.equal(activeModelFor(CHOSEN, ENV)?.name, CHOSEN)
  assert.equal(activeModelFor(CHOSEN, { FIREWORKS_MODEL: ENV.FIREWORKS_MODEL }), null)
  assert.equal(activeModelName(null, { FIREWORKS_API_KEY: 'k' }), null)
  assert.equal(activeModelFor(CHOSEN, PREVIEW)?.name, FAKE_MODEL_NAME)
  assert.equal(activeModelName(CHOSEN, PREVIEW), FAKE_MODEL_NAME)
  assert.equal(configuredModel(ENV)?.name, ENV.FIREWORKS_MODEL)
})

test('a calibration run gets a client for any model id with the environment’s key, and the stand-in only with the test tools', async () => {
  const bodies: Array<{ model: string }> = []
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] }), { status: 200 })
  }) as typeof fetch
  const model = fireworksModelFor('accounts/fireworks/models/other', { FIREWORKS_API_KEY: 'key-9' }, fetcher)
  assert.deepEqual((await model!.complete({ system: 's', user: '{}', schemaName: 'x', schema: {} })).value, { ok: true })
  assert.equal(bodies[0].model, 'accounts/fireworks/models/other')
  assert.equal(fireworksModelFor('accounts/fireworks/models/other', {}), null)
  assert.equal(calibrationModelFor(FAKE_MODEL_NAME, { WEEKLY_EVALUATIONS_ENABLED: 'true', WEEKLY_TEST_TOOLS: 'true' })?.name, FAKE_MODEL_NAME)
  assert.equal(calibrationModelFor(FAKE_MODEL_NAME, ENV), null)
  assert.equal(calibrationModelFor(CHOSEN, ENV, fetcher)?.name, CHOSEN)
})

const input: ScoringInput = {
  topic: { name: 'Quality of Work', definition: 'Accurate, complete work.' },
  perspective: 'LEAD',
  profile: { levels: STANDARD_LEVELS, insufficientDefinition: 'No example.' },
  question: 'Describe a recent piece of work.',
  answer: { situation: 'The report was due Friday.', action: 'They rebuilt the plan and checked each figure.', result: 'It went out on time.', shortfall: '' },
  evaluatee: { position: 'Analyst', department: 'Product' },
}
const answering = (value: unknown): StructuredModel => ({ name: 'accounts/test/models/x', async complete() { return { value, inputTokens: 100, outputTokens: 20 } } })

test('scoreOnce is the live scoring call: schema-checked, invented quotes dropped, system flags merged, latency measured', async () => {
  const output = {
    sufficiency: 'SUFFICIENT', score: 3, confidence: 'HIGH', criteriaMet: [], criteriaNotDemonstrated: [],
    evidenceQuotes: ['rebuilt the plan', 'saved the account'], rationale: 'Level 3.', flags: [],
  }
  const scored = await scoreOnce(answering(output), input, ['SENSITIVE_CONTENT'])
  assert.deepEqual([scored.final.score, scored.final.confidence, scored.final.evidenceQuotes, scored.final.flags], [3, 'LOW', ['rebuilt the plan'], ['SENSITIVE_CONTENT']])
  assert.deepEqual([scored.usage.inputTokens, scored.usage.outputTokens], [100, 20])
  assert.ok(scored.latencyMs >= 0)
  await assert.rejects(scoreOnce(answering({ nonsense: true }), input, []), (e: unknown) => e instanceof ModelError && e.code === 'INVALID_OUTPUT')
})
