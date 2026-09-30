import test from 'node:test'
import assert from 'node:assert/strict'
import { renderLengthBiasEmail, renderMoreEvidenceEmail } from '../lib/weekly/emails'

test('the ask-again email counts the new questions, escapes the name and never mentions a score', () => {
  const email = renderMoreEvidenceEmail({ name: '<b>Lee</b>', count: 3, appUrl: 'https://compass.example/' })
  assert.equal(email.subject, 'HR asked for more examples: 3 new evaluation questions')
  assert.match(email.html, /&lt;b&gt;Lee&lt;\/b&gt;/)
  assert.match(email.html, /https:\/\/compass\.example\/evaluations\/weekly/)
  assert.doesNotMatch(email.html, /score/i)
  assert.equal(renderMoreEvidenceEmail({ name: 'Lee', count: 1, appUrl: 'x' }).subject, 'HR asked for more examples: 1 new evaluation question')
})

test('the monthly length check gives the correlation, with an alert line only above 0.3', () => {
  const high = renderLengthBiasEmail({ name: 'Hana', periodName: 'Q4 <2026>', correlation: 0.42, alert: true, scored: 12, appUrl: 'https://compass.example' })
  assert.equal(high.subject, 'Weekly evaluations: length–score check for Q4 <2026> (0.42)')
  assert.match(high.html, /12 scored answers in Q4 &lt;2026&gt;/)
  assert.match(high.html, /Alert:/)
  assert.match(high.html, /admin\/weekly\?tab=dashboard/)
  const low = renderLengthBiasEmail({ name: 'Hana', periodName: 'Q4 2026', correlation: 0.1, alert: false, scored: 12, appUrl: 'https://compass.example' })
  assert.doesNotMatch(low.html, /Alert:/)
})
