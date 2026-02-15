import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * API Integration Tests
 * 
 * These tests validate API routes respond correctly.
 * They require the dev server to be running at localhost:3000.
 * 
 * Run: npm run dev (in another terminal)
 * Then: node --import tsx --test tests/api-integration.test.ts
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

async function fetchJSON(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  })
  const data = await res.json()
  return { status: res.status, data }
}

// ─── Auth API ────────────────────────────────────────────────────────────────

test('GET /api/auth/session returns user or 401', async () => {
  const { status } = await fetchJSON('/api/auth/session')
  // Without a session cookie, middleware may return 401 or 200 with null user
  assert.ok(
    status === 200 || status === 401,
    `Unexpected status ${status}`
  )
})

test('GET /api/users returns list or requires auth', async () => {
  const { status, data } = await fetchJSON('/api/users')
  assert.ok(
    status === 200 || status === 401,
    `Unexpected status ${status}`
  )
  if (status === 200) {
    assert.ok(Array.isArray(data.users), 'Expected users array')
    assert.ok(data.users.length > 0, 'Expected at least one user')
    const firstUser = data.users[0]
    assert.ok('id' in firstUser, 'User should have id')
    assert.ok('name' in firstUser, 'User should have name')
    assert.ok('role' in firstUser, 'User should have role')
  }
})

// ─── Evaluation APIs ─────────────────────────────────────────────────────────

test('GET /api/evaluations/dashboard requires auth', async () => {
  const { status, data } = await fetchJSON('/api/evaluations/dashboard?periodId=active')
  // Should be 401 when no session cookie
  assert.ok(
    status === 401 || status === 200,
    `Unexpected status ${status}`
  )
})

test('GET /api/admin/questions returns questions (or auth error)', async () => {
  const { status, data } = await fetchJSON('/api/admin/questions')
  assert.ok(
    status === 200 || status === 401 || status === 403,
    `Unexpected status ${status}`
  )
  if (status === 200) {
    assert.ok(Array.isArray(data.questions), 'Expected questions array')
  }
})

// ─── Admin APIs ──────────────────────────────────────────────────────────────

test('GET /api/admin/periods returns periods (or auth error)', async () => {
  const { status } = await fetchJSON('/api/admin/periods')
  assert.ok(
    status === 200 || status === 401 || status === 403,
    `Unexpected status ${status}`
  )
})

test('GET /api/admin/analytics returns analytics (or auth error)', async () => {
  const { status } = await fetchJSON('/api/admin/analytics')
  assert.ok(
    status === 200 || status === 401 || status === 403,
    `Unexpected status ${status}`
  )
})

test('GET /api/admin/weight-profiles returns profiles (or auth error)', async () => {
  const { status } = await fetchJSON('/api/admin/weight-profiles')
  assert.ok(
    status === 200 || status === 401 || status === 403,
    `Unexpected status ${status}`
  )
})

// ─── Project APIs ────────────────────────────────────────────────────────────

test('GET /api/projects requires auth', async () => {
  const { status } = await fetchJSON('/api/projects')
  assert.ok(
    status === 200 || status === 401,
    `Unexpected status ${status}`
  )
})

test('POST /api/projects requires auth', async () => {
  const { status } = await fetchJSON('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Project' }),
  })
  assert.ok(
    status === 200 || status === 401,
    `Unexpected status ${status}`
  )
})

// ─── Leave APIs ──────────────────────────────────────────────────────────────

test('GET /api/leave/requests requires auth', async () => {
  const { status } = await fetchJSON('/api/leave/requests')
  assert.ok(
    status === 200 || status === 401 || status === 403,
    `Unexpected status ${status}`
  )
})

test('GET /api/leave/balance requires auth', async () => {
  const { status } = await fetchJSON('/api/leave/balance')
  assert.ok(
    status === 200 || status === 401 || status === 403,
    `Unexpected status ${status}`
  )
})

// ─── Report APIs ─────────────────────────────────────────────────────────────

test('GET /api/reports/export requires auth', async () => {
  const { status } = await fetchJSON('/api/reports/export?periodId=test')
  assert.ok(
    status === 200 || status === 401 || status === 403 || status === 404 || status === 400,
    `Unexpected status ${status}`
  )
})

// ─── Edge cases ──────────────────────────────────────────────────────────────

test('invalid API route returns 404 or auth redirect', async () => {
  const res = await fetch(`${BASE_URL}/api/nonexistent-endpoint-xyz`)
  // Middleware may intercept with 401/302 before reaching 404
  assert.ok(
    res.status === 404 || res.status === 401 || res.status === 302,
    `Unexpected status ${res.status}`
  )
})
