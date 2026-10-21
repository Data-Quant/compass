import test from 'node:test'
import assert from 'node:assert/strict'
import { bypassesSessionCheck } from '../lib/middleware-paths'

test('cron routes bypass the session cookie check', () => {
  assert.equal(bypassesSessionCheck('/api/cron/weekly-evaluations'), true)
})

test('lookalike and ordinary API paths still need a session', () => {
  assert.equal(bypassesSessionCheck('/api/cronjob'), false)
  assert.equal(bypassesSessionCheck('/api/weekly/me'), false)
  assert.equal(bypassesSessionCheck('/api/leave/requests'), false)
})

test('the scheduled jobs outside /api/cron/ reach their own secret check, at their exact paths only', () => {
  // Vercel calls these with a Bearer CRON_SECRET and no cookie; each route refuses anyone without the secret or an admin login.
  for (const path of ['/api/leave/transition-plan-reminders', '/api/projects/task-deadline-reminders', '/api/projects/notification-digests', '/api/payroll/public-holidays/reminders']) {
    assert.equal(bypassesSessionCheck(path), true, path)
  }
  assert.equal(bypassesSessionCheck('/api/leave/transition-plan-reminders-x'), false)
  assert.equal(bypassesSessionCheck('/api/projects/notification-digests/extra'), false)
  assert.equal(bypassesSessionCheck('/api/payroll/public-holidays'), false)
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
