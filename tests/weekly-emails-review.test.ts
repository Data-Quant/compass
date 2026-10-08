import test from 'node:test'
import assert from 'node:assert/strict'
import { renderLowEvidenceEmail, renderScoringFailedEmail } from '../lib/weekly/emails'

test('HR emails: failed scoring and the low-evidence list, both escaped and linked to the console', () => {
  const failed = renderScoringFailedEmail({ name: 'Hana', count: 1, appUrl: 'https://compass.example' })
  assert.equal(failed.subject, '1 weekly answer could not be scored')
  assert.match(failed.html, /admin\/evaluation-round\?tab=advanced&amp;sub=review/)
  const low = renderLowEvidenceEmail({ name: 'Hana', rows: [{ evaluatee: '<script>x</script>', group: 'As a peer', satisfied: 1, total: 4 }], appUrl: 'https://compass.example' })
  assert.equal(low.subject, 'Weekly evaluations: 1 person-group with low evidence')
  assert.doesNotMatch(low.html, /<script>/)
  assert.match(low.html, /1 of 4/)
  assert.match(low.html, /admin\/evaluation-round\?tab=progress/)
})
