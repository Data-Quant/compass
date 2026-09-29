import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { kpiErrorResponse } from '../lib/kpi/http-errors'
import { KpiError } from '../lib/kpi/service/errors'
import { SameOriginError } from '../lib/security/same-origin'

test('known errors map to their status with a readable message', async () => {
  const conflict = kpiErrorResponse(new KpiError('KPIs for this month are locked', 409))
  assert.equal(conflict.status, 409)
  assert.deepEqual(await conflict.json(), { error: 'KPIs for this month are locked' })
  assert.equal(kpiErrorResponse(new SameOriginError('Cross-origin request rejected')).status, 403)
  assert.equal(kpiErrorResponse(new SyntaxError('Unexpected token')).status, 400)
})

test('validation errors become 400 with field paths', async () => {
  const result = z.object({ title: z.string().min(3) }).safeParse({ title: 'x' })
  assert.equal(result.success, false)
  if (result.success) return
  const response = kpiErrorResponse(result.error)
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /^title: /)
})

test('unexpected errors are 500 without internal details', async () => {
  const response = kpiErrorResponse(new Error('connection string postgres://secret'))
  assert.equal(response.status, 500)
  assert.equal(JSON.stringify(await response.json()).includes('secret'), false)
})
