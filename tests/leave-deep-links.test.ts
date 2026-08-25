import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import {
  getLeaveRequestPath,
  getLeaveRequestUrl,
  normalizeCompassBaseUrl,
  renderLeaveRequestEmailAction,
  resolveLeaveRequestDeepLinkTarget,
} from '../lib/leave-deep-links'
import { middleware } from '../middleware'

test('leave request links encode the request id and open the leave action surface', () => {
  assert.equal(getLeaveRequestPath('leave request/123'), '/leave?requestId=leave%20request%2F123')
  assert.equal(
    getLeaveRequestUrl('request-123', 'https://compass.example.com/'),
    'https://compass.example.com/leave?requestId=request-123',
  )
})

test('Compass base URLs accept hostnames and reject unsafe schemes', () => {
  assert.equal(normalizeCompassBaseUrl('compass.example.com/'), 'https://compass.example.com')
  assert.equal(normalizeCompassBaseUrl('javascript:alert(1)'), null)
})

test('leave request email action includes a direct CTA and sign-in handoff copy', () => {
  const html = renderLeaveRequestEmailAction('request-123', 'https://compass.example.com')

  assert.match(html, /Review leave request in Compass/)
  assert.match(html, /href="https:\/\/compass\.example\.com\/leave\?requestId=request-123"/)
  assert.match(html, /Compass will return you to this leave request afterward/)
})

test('approval actions take priority over the employee detail view', () => {
  assert.equal(resolveLeaveRequestDeepLinkTarget('request-1', ['request-1'], ['request-1']), 'approval')
  assert.equal(resolveLeaveRequestDeepLinkTarget('request-2', [], ['request-2']), 'own')
  assert.equal(resolveLeaveRequestDeepLinkTarget('request-3', [], []), 'unavailable')
})

test('middleware preserves the exact leave request destination through login', () => {
  const response = middleware(new NextRequest('https://compass.example.com/leave?requestId=request-123'))
  const location = response.headers.get('location')

  assert.ok(location)
  const loginUrl = new URL(location)
  assert.equal(loginUrl.pathname, '/login')
  assert.equal(loginUrl.searchParams.get('next'), '/leave?requestId=request-123')
})
