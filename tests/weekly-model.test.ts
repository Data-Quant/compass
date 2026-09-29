import test from 'node:test'
import assert from 'node:assert/strict'
import { configuredModel } from '../lib/weekly/ai/configured'
import { fireworksModel, parseJsonContent } from '../lib/weekly/ai/fireworks'
import { FAKE_MODEL_NAME, ModelError } from '../lib/weekly/ai/model'

const request = { system: 'sys', user: '{"a":1}', schemaName: 'weekly_score', schema: { type: 'object' } }
type Call = { url: string; init: RequestInit }

function stubFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond()
  }) as typeof fetch
  return { calls, fetcher }
}
const completion = (content: string, finish = 'stop') =>
  new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: 120, completion_tokens: 30 } }), { status: 200 })
const rejectsWith = (code: string, retryable: boolean) => (e: unknown) => e instanceof ModelError && e.code === code && e.retryable === retryable

test('sends one JSON-schema chat completion at temperature 0 and returns the parsed value with token counts', async () => {
  const { calls, fetcher } = stubFetch(() => completion('{"ok":true}'))
  const model = fireworksModel({ apiKey: 'key-123', model: 'accounts/fireworks/models/test', fetcher })
  const result = await model.complete(request)
  assert.deepEqual(result, { value: { ok: true }, inputTokens: 120, outputTokens: 30 })
  assert.equal(model.name, 'accounts/fireworks/models/test')
  assert.equal(calls[0].url, 'https://api.fireworks.ai/inference/v1/chat/completions')
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer key-123')
  const body = JSON.parse(String(calls[0].init.body))
  assert.equal(body.temperature, 0)
  assert.deepEqual(body.messages.map((m: { role: string }) => m.role), ['system', 'user'])
  assert.deepEqual(body.response_format, { type: 'json_schema', json_schema: { name: 'weekly_score', schema: { type: 'object' } } })
})

test('JSON wrapped in a code fence or surrounded by text is still read', () => {
  assert.deepEqual(parseJsonContent('```json\n{"a":2}\n```'), { a: 2 })
  assert.deepEqual(parseJsonContent('Here it is: {"a":3} done'), { a: 3 })
  assert.throws(() => parseJsonContent('no json here'))
})

test('provider failures become typed errors; only bad credentials are not retried', async () => {
  const cases: Array<[() => Response, string, boolean]> = [
    [() => new Response('{}', { status: 429 }), 'RATE_LIMITED', true],
    [() => new Response('{}', { status: 401 }), 'NOT_CONFIGURED', false],
    [() => new Response('{}', { status: 503 }), 'PROVIDER_ERROR', true],
    [() => completion('{"a":1}', 'length'), 'INVALID_OUTPUT', true],
    [() => completion('not json'), 'INVALID_OUTPUT', true],
  ]
  for (const [respond, code, retryable] of cases) {
    const { fetcher } = stubFetch(respond)
    await assert.rejects(fireworksModel({ apiKey: 'k', model: 'm', fetcher }).complete(request), rejectsWith(code, retryable))
  }
  const timeout = (async () => { throw new DOMException('timed out', 'TimeoutError') }) as typeof fetch
  await assert.rejects(fireworksModel({ apiKey: 'k', model: 'm', fetcher: timeout }).complete(request), rejectsWith('TIMEOUT', true))
  const offline = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
  await assert.rejects(fireworksModel({ apiKey: 'k', model: 'm', fetcher: offline }).complete(request), rejectsWith('PROVIDER_ERROR', true))
})

test('the configured model: Fireworks with a key and model; the stand-in only with the preview test tools', () => {
  assert.equal(configuredModel({}), null)
  assert.equal(configuredModel({ FIREWORKS_API_KEY: 'k' }), null)
  assert.equal(configuredModel({ FIREWORKS_API_KEY: 'k', FIREWORKS_MODEL: 'm' })?.name, 'm')
  const preview = { WEEKLY_EVALUATIONS_ENABLED: 'true', WEEKLY_TEST_TOOLS: 'true', WEEKLY_AI_FAKE: 'true', FIREWORKS_API_KEY: 'k', FIREWORKS_MODEL: 'm' }
  assert.equal(configuredModel(preview)?.name, FAKE_MODEL_NAME)
  assert.equal(configuredModel({ ...preview, WEEKLY_TEST_TOOLS: 'false' })?.name, 'm')
})
