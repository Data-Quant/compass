import test from 'node:test'
import assert from 'node:assert/strict'
import { renderLowEvidenceEmail } from '../lib/weekly/emails'

test('HR email: the low-evidence list, escaped and linked to the round’s progress', () => {
  const low = renderLowEvidenceEmail({ name: 'Hana', rows: [{ evaluatee: '<script>x</script>', group: 'As a peer', satisfied: 1, total: 4 }], appUrl: 'https://compass.example' })
  assert.equal(low.subject, 'Weekly evaluations: 1 person-group with low evidence')
  assert.doesNotMatch(low.html, /<script>/)
  assert.match(low.html, /1 of 4/)
  assert.match(low.html, /admin\/evaluation-round\?tab=progress/)
})
