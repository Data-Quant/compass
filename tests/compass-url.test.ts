import assert from 'node:assert/strict'
import test from 'node:test'
import { COMPASS_URL, compassUrl } from '../lib/compass-url'
import { getLeaveRequestUrl } from '../lib/leave-deep-links'
import { renderMappingEmail } from '../lib/weekly/emails'

test('email links go to Compass itself with the section, whatever deployment sent them', () => {
  assert.equal(COMPASS_URL, 'https://compass-blond.vercel.app')
  assert.equal(compassUrl('/leave'), 'https://compass-blond.vercel.app/leave')
  assert.equal(compassUrl(), 'https://compass-blond.vercel.app')
  assert.throws(() => compassUrl('leave'), /start with "\/"/)
})

test('a deployment address in the environment no longer leaks into links', () => {
  const previous = process.env.VERCEL_URL
  process.env.VERCEL_URL = 'compass-abc123-preview.vercel.app'
  try {
    assert.equal(getLeaveRequestUrl('request-1'), 'https://compass-blond.vercel.app/leave?requestId=request-1')
  } finally {
    if (previous === undefined) delete process.env.VERCEL_URL
    else process.env.VERCEL_URL = previous
  }
})

test('the mapping email links to the Evaluations page on Compass', () => {
  const { html } = renderMappingEmail({ name: 'Ana', periodName: 'Q4 2026', leads: [], reports: [], peers: [], appUrl: COMPASS_URL })
  assert.match(html, /href="https:\/\/compass-blond\.vercel\.app\/evaluations\/weekly"/)
})
