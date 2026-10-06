import test from 'node:test'
import assert from 'node:assert/strict'
import { bypassesSessionCheck } from '../lib/middleware-paths'

test('cron routes bypass the session cookie check', () => {
  assert.equal(bypassesSessionCheck('/api/cron/kpi'), true)
})

test('lookalike and ordinary API paths still need a session', () => {
  assert.equal(bypassesSessionCheck('/api/cronjob'), false)
  assert.equal(bypassesSessionCheck('/api/kpi/me'), false)
  assert.equal(bypassesSessionCheck('/api/leave/transition-plan-reminders'), false)
})

test('existing public paths are unchanged', () => {
  for (const path of ['/login', '/api/auth/login', '/api/auth/csrf', '/api/csp-report', '/_next/static/a.js', '/favicon.ico', '/images/logo.png']) {
    assert.equal(bypassesSessionCheck(path), true, path)
  }
})

test('the one-click peer approval page and its API work without signing in', () => {
  assert.equal(bypassesSessionCheck('/peer-requests/abc123'), true)
  assert.equal(bypassesSessionCheck('/api/peer-requests/abc123'), true)
  assert.equal(bypassesSessionCheck('/api/peer-requestsx'), false)
  assert.equal(bypassesSessionCheck('/api/weekly/mapping'), false)
})
