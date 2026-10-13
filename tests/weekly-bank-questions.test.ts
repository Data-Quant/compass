import test from 'node:test'
import assert from 'node:assert/strict'
import { bankQuestionProblem, createBankQuestionSchema, updateBankQuestionSchema } from '../lib/weekly/bank-questions'

test('quarter-end form banks take rating and written questions', () => {
  for (const bank of ['C_LEVEL', 'DEPT', 'HR'] as const) {
    assert.equal(bankQuestionProblem(bank, 'RATING'), null)
    assert.equal(bankQuestionProblem(bank, 'TEXT'), null)
  }
})

test('the weekly banks take written comment questions here; their rating questions are weekly topics', () => {
  for (const bank of ['DIRECT_REPORT', 'TEAM_LEAD', 'PEER'] as const) {
    assert.equal(bankQuestionProblem(bank, 'TEXT'), null)
    assert.match(bankQuestionProblem(bank, 'RATING') ?? '', /weekly topics/)
  }
})

test('banks nothing reads any more are refused', () => {
  assert.match(bankQuestionProblem('SELF', 'TEXT') ?? '', /no longer used/)
  assert.match(bankQuestionProblem('CROSS_DEPARTMENT', 'RATING') ?? '', /no longer used/)
})

test('a question needs text, a known bank and type, and nothing else', () => {
  assert.equal(createBankQuestionSchema.safeParse({ relationshipType: 'HR', questionText: 'Attendance', questionType: 'RATING', ratingDescriptions: { 1: 'Often late' } }).success, true)
  assert.equal(createBankQuestionSchema.safeParse({ relationshipType: 'HR', questionText: '   ', questionType: 'RATING' }).success, false)
  assert.equal(createBankQuestionSchema.safeParse({ relationshipType: 'SELF', questionText: 'Goals', questionType: 'TEXT' }).success, false)
  assert.equal(createBankQuestionSchema.safeParse({ relationshipType: 'HR', questionText: 'Attendance', questionType: 'SCALE' }).success, false)
  assert.equal(updateBankQuestionSchema.safeParse({ id: 'q1', questionText: 'Attendance', questionType: 'TEXT', relationshipType: 'PEER' }).success, false, 'the bank cannot change')
})
