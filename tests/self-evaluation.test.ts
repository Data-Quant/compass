import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isEligibleEmployee,
  validateAnswers,
  type SelfEvaluationQuestionLike,
} from '../lib/self-evaluation'

const Q: SelfEvaluationQuestionLike[] = [
  { id: 'q1', section: 'A', prompt: 'p1', type: 'TEXT' },
  { id: 'q2', section: 'B', prompt: 'p2', type: 'LIST' },
  { id: 'q3', section: 'C', prompt: 'p3', type: 'GOAL_TABLE' },
]

test('isEligibleEmployee: plain employee who leads no one is eligible', () => {
  assert.equal(isEligibleEmployee({ role: 'EMPLOYEE', position: 'Analyst', leadsAnyone: false }), true)
})

test('isEligibleEmployee: team lead excluded', () => {
  assert.equal(isEligibleEmployee({ role: 'EMPLOYEE', position: 'Analyst', leadsAnyone: true }), false)
})

test('isEligibleEmployee: partner/manager position excluded (case-insensitive)', () => {
  assert.equal(isEligibleEmployee({ role: 'EMPLOYEE', position: 'Principal', leadsAnyone: false }), false)
  assert.equal(isEligibleEmployee({ role: 'EMPLOYEE', position: 'manager', leadsAnyone: false }), false)
})

test('isEligibleEmployee: non-employee role excluded', () => {
  assert.equal(isEligibleEmployee({ role: 'HR', position: 'Analyst', leadsAnyone: false }), false)
})

test('isEligibleEmployee: null position is fine', () => {
  assert.equal(isEligibleEmployee({ role: 'EMPLOYEE', position: null, leadsAnyone: false }), true)
})

test('validateAnswers: coerces and trims per type, fills snapshot fields', () => {
  const out = validateAnswers(Q, [
    { questionId: 'q1', value: 'hello' },
    { questionId: 'q2', value: ['a', '', '  '] },
    {
      questionId: 'q3',
      value: [
        { goal: 'g', status: 'COMPLETED', comments: 'c' },
        { goal: '', status: 'NOT_STARTED', comments: '' },
      ],
    },
  ])
  assert.equal(out[0].value, 'hello')
  assert.deepEqual(out[1].value, ['a'])
  assert.deepEqual(out[2].value, [{ goal: 'g', status: 'COMPLETED', comments: 'c' }])
  assert.equal(out[2].prompt, 'p3')
  assert.equal(out[2].section, 'C')
})

test('validateAnswers: drops answers to unknown/inactive questions', () => {
  const out = validateAnswers(Q, [{ questionId: 'gone', value: 'x' }, { questionId: 'q1', value: 'ok' }])
  assert.equal(out.length, 1)
  assert.equal(out[0].questionId, 'q1')
})

test('validateAnswers: rejects bad goal status', () => {
  assert.throws(() =>
    validateAnswers(Q, [{ questionId: 'q3', value: [{ goal: 'g', status: 'WAT', comments: '' }] }]),
  )
})

test('validateAnswers: rejects TEXT given an array', () => {
  assert.throws(() => validateAnswers(Q, [{ questionId: 'q1', value: ['x'] }]))
})
