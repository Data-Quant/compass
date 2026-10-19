import test from 'node:test'
import assert from 'node:assert/strict'
import { weeklyErrorResponse } from '../lib/weekly/http-errors'
import { answerSchema } from '../lib/weekly/schemas'
import { WeeklyError } from '../lib/weekly/service/errors'

test('errors become readable responses without leaking details', async () => {
  const known = weeklyErrorResponse(new WeeklyError('Nope', 409))
  assert.equal(known.status, 409)
  assert.deepEqual(await known.json(), { error: 'Nope' })
  const parsed = answerSchema.safeParse({ situation: 5 })
  assert.equal(parsed.success, false)
  if (!parsed.success) assert.equal(weeklyErrorResponse(parsed.error).status, 400)
  assert.equal(weeklyErrorResponse(new SyntaxError('bad json')).status, 400)
  const unknown = weeklyErrorResponse(new Error('secret connection string'))
  assert.equal(unknown.status, 500)
  assert.doesNotMatch(JSON.stringify(await unknown.json()), /secret/)
})
