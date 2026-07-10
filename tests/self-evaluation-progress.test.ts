import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveProgressStatus,
  summarizeProgress,
  type SelfEvaluationProgressStatus,
} from '../lib/self-evaluation-progress'

test('deriveProgressStatus maps the three real states', () => {
  assert.equal(deriveProgressStatus({ status: 'SUBMITTED', startedAt: new Date() }), 'SUBMITTED')
  // Submitted wins even if (impossibly) startedAt were null.
  assert.equal(deriveProgressStatus({ status: 'SUBMITTED', startedAt: null }), 'SUBMITTED')
  // DRAFT + saved at least once = in progress.
  assert.equal(deriveProgressStatus({ status: 'DRAFT', startedAt: new Date('2026-07-01') }), 'IN_PROGRESS')
  // DRAFT + never opened = not started.
  assert.equal(deriveProgressStatus({ status: 'DRAFT', startedAt: null }), 'NOT_STARTED')
})

test('summarizeProgress counts a mixed list and totals sent', () => {
  const items: Array<{ progressStatus: SelfEvaluationProgressStatus }> = [
    { progressStatus: 'SUBMITTED' },
    { progressStatus: 'SUBMITTED' },
    { progressStatus: 'IN_PROGRESS' },
    { progressStatus: 'NOT_STARTED' },
    { progressStatus: 'NOT_STARTED' },
    { progressStatus: 'NOT_STARTED' },
  ]
  assert.deepEqual(summarizeProgress(items), { sent: 6, submitted: 2, inProgress: 1, notStarted: 3 })
})

test('summarizeProgress handles empty and all-submitted lists', () => {
  assert.deepEqual(summarizeProgress([]), { sent: 0, submitted: 0, inProgress: 0, notStarted: 0 })
  assert.deepEqual(
    summarizeProgress([{ progressStatus: 'SUBMITTED' }, { progressStatus: 'SUBMITTED' }]),
    { sent: 2, submitted: 2, inProgress: 0, notStarted: 0 }
  )
})
