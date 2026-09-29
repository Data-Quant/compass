import test from 'node:test'
import assert from 'node:assert/strict'
import { renderFollowUpEmail, renderLowEvidenceEmail, renderScoringFailedEmail } from '../lib/weekly/emails'

test('the follow-up email counts the answers and links to the weekly page, escaping names', () => {
  const email = renderFollowUpEmail({ name: '<b>Ana</b>', count: 2, appUrl: 'https://compass.example/' })
  assert.equal(email.subject, 'Please add detail to 2 evaluation answers')
  assert.match(email.html, /&lt;b&gt;Ana&lt;\/b&gt;/)
  assert.match(email.html, /https:\/\/compass\.example\/evaluations\/weekly/)
  assert.equal(renderFollowUpEmail({ name: 'Ana', count: 1, appUrl: 'x' }).subject, 'Please add detail to 1 evaluation answer')
})

test('HR emails: failed scoring and the low-evidence list, both escaped and linked to the console', () => {
  const failed = renderScoringFailedEmail({ name: 'Hana', count: 1, appUrl: 'https://compass.example' })
  assert.equal(failed.subject, '1 weekly answer could not be scored')
  assert.match(failed.html, /admin\/weekly\?tab=review/)
  const low = renderLowEvidenceEmail({ name: 'Hana', rows: [{ evaluatee: '<script>x</script>', group: 'As a peer', satisfied: 1, total: 4 }], appUrl: 'https://compass.example' })
  assert.equal(low.subject, 'Weekly evaluations: 1 person-group with low evidence')
  assert.doesNotMatch(low.html, /<script>/)
  assert.match(low.html, /1 of 4/)
  assert.match(low.html, /admin\/weekly\?tab=dashboard/)
})
