import test from 'node:test'
import assert from 'node:assert/strict'

// Route modules load the session module, which refuses to load without a secret; this one is never used.
process.env.SESSION_SECRET ??= 'weekly-route-durations-test-only-secret-000000'

type RouteModule = { maxDuration?: number }
const route = (path: string): Promise<RouteModule> => import(path)

test('routes that call the model allow for their scoring budget plus one model call, within the cron’s limit', async () => {
  const { MODEL_TIMEOUT_MS } = await import('../lib/weekly/ai/fireworks')
  const { DAILY_SCORING_BUDGET_MS } = await import('../lib/weekly/service/daily-job')
  const { INLINE_BUDGET_MS } = await import('../lib/weekly/service/scoring')
  const { SCORE_NOW_BUDGET_MS } = await import('../lib/weekly/service/test-tools')
  // A run checks its budget only before claiming work, so one model call may still be in flight when it runs out.
  const needs = (budgetMs: number) => (budgetMs + Number(MODEL_TIMEOUT_MS)) / 1000
  const limits: Array<[string, string, number]> = [
    ['answer (scores after submit)', '../app/api/weekly/prompts/[id]/answer/route', needs(INLINE_BUDGET_MS)],
    ['retry (scores after the response)', '../app/api/admin/weekly/review/[responseId]/retry/route', needs(INLINE_BUDGET_MS)],
    ['correction (re-scores after the response)', '../app/api/admin/weekly/responses/[responseId]/route', needs(INLINE_BUDGET_MS)],
    ['test tools (score now)', '../app/api/admin/weekly/test-tools/route', needs(SCORE_NOW_BUDGET_MS)],
    ['AI drafting', '../app/api/admin/weekly/competencies/[id]/ai-draft/route', needs(0)],
    ['daily cron', '../app/api/cron/weekly-evaluations/route', needs(DAILY_SCORING_BUDGET_MS)],
  ]
  for (const [name, path, required] of limits) {
    const limit = (await route(path)).maxDuration
    assert.ok(typeof limit === 'number' && limit >= required, `${name}: maxDuration ${String(limit)} < ${required}`)
    assert.ok(limit <= 300, `${name}: maxDuration ${limit} is above the daily cron's 300`)
  }
})
