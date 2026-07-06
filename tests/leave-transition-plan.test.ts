import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTransitionTasks,
  canSubmitTransitionPlan,
  classifyTransitionReminder,
  daysUntil,
} from '../lib/leave-transition-plan'

const now = new Date('2026-07-06T09:00:00.000Z')

test('validateTransitionTasks drops empty rows and coerces flags', () => {
  const out = validateTransitionTasks([
    {
      taskDetails: 'Hand over X',
      assignedTo: 'Sara',
      accepted: true,
      deadline: '2026-07-10',
      completed: false,
      variance: '',
      links: '',
    },
    { taskDetails: '   ', assignedTo: 'nobody' },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].taskDetails, 'Hand over X')
  assert.equal(out[0].accepted, true)
  assert.equal(out[0].completed, false)
  assert.equal(out[0].projectDept, '')
  assert.equal(out[0].deadline, '2026-07-10')
})

test('validateTransitionTasks rejects more than 50 rows', () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ taskDetails: `t${i}` }))
  assert.throws(() => validateTransitionTasks(rows))
})

test('validateTransitionTasks handles null/undefined input', () => {
  assert.deepEqual(validateTransitionTasks(null), [])
  assert.deepEqual(validateTransitionTasks(undefined), [])
})

test('canSubmitTransitionPlan requires at least one real task', () => {
  assert.equal(canSubmitTransitionPlan([]), false)
  assert.equal(canSubmitTransitionPlan(validateTransitionTasks([{ taskDetails: 'x' }])), true)
})

test('daysUntil is date-only whole days', () => {
  assert.equal(daysUntil(new Date('2026-07-09T23:00:00.000Z'), now), 3)
  assert.equal(daysUntil(new Date('2026-07-06T01:00:00.000Z'), now), 0)
})

test('classify: reminds inside window, not before', () => {
  const start = new Date('2026-07-10T00:00:00.000Z') // 4 days out
  assert.deepEqual(
    classifyTransitionReminder({ startDate: start, submitted: false, alreadyEscalated: false, now }),
    { remind: true, escalate: false, daysUntilStart: 4 },
  )
  const far = new Date('2026-07-20T00:00:00.000Z') // 14 days out
  assert.equal(
    classifyTransitionReminder({ startDate: far, submitted: false, alreadyEscalated: false, now }).remind,
    false,
  )
})

test('classify: escalates at/after the 3-day deadline, once', () => {
  const start = new Date('2026-07-09T00:00:00.000Z') // 3 days out = deadline
  assert.equal(
    classifyTransitionReminder({ startDate: start, submitted: false, alreadyEscalated: false, now }).escalate,
    true,
  )
  assert.equal(
    classifyTransitionReminder({ startDate: start, submitted: false, alreadyEscalated: true, now }).escalate,
    false,
  )
})

test('classify: submitted plans never remind or escalate', () => {
  const start = new Date('2026-07-08T00:00:00.000Z')
  assert.deepEqual(
    classifyTransitionReminder({ startDate: start, submitted: true, alreadyEscalated: false, now }),
    { remind: false, escalate: false, daysUntilStart: 2 },
  )
})
