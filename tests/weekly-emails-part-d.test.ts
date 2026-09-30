import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMoreEvidenceEmail } from '../lib/weekly/emails'

test('the ask-again email counts the new questions, escapes the name and never mentions a score', () => {
  const email = renderMoreEvidenceEmail({ name: '<b>Lee</b>', count: 3, appUrl: 'https://compass.example/' })
  assert.equal(email.subject, 'HR asked for more examples: 3 new evaluation questions')
  assert.match(email.html, /&lt;b&gt;Lee&lt;\/b&gt;/)
  assert.match(email.html, /https:\/\/compass\.example\/evaluations\/weekly/)
  assert.doesNotMatch(email.html, /score/i)
  assert.equal(renderMoreEvidenceEmail({ name: 'Lee', count: 1, appUrl: 'x' }).subject, 'HR asked for more examples: 1 new evaluation question')
})
