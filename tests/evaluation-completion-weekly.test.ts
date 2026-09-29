import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSubmittedCountMap, isEvaluationInBankForRelationshipType } from '../lib/evaluation-completion'

const row = (bank: 'PEER' | 'TEAM_LEAD', source?: string) => ({
  evaluatorId: 'cara', evaluateeId: 'ana', submittedAt: new Date(), leadQuestionId: null, question: { relationshipType: bank }, source,
})

test('weekly cross-department evidence comes from the peer questions; classic rows keep the old bank', () => {
  assert.equal(isEvaluationInBankForRelationshipType(row('PEER', 'AI_WEEKLY'), 'CROSS_DEPARTMENT'), true)
  assert.equal(isEvaluationInBankForRelationshipType(row('PEER', 'MANUAL'), 'CROSS_DEPARTMENT'), false)
  assert.equal(isEvaluationInBankForRelationshipType(row('TEAM_LEAD', 'MANUAL'), 'CROSS_DEPARTMENT'), true)
  assert.equal(isEvaluationInBankForRelationshipType(row('TEAM_LEAD', 'AI_WEEKLY'), 'CROSS_DEPARTMENT'), false)
  assert.equal(isEvaluationInBankForRelationshipType(row('PEER'), 'PEER'), true)
})

test('the completion count sees weekly cross-department rows', () => {
  const counts = buildSubmittedCountMap([row('PEER', 'AI_WEEKLY'), row('PEER', 'AI_WEEKLY')], [{ evaluatorId: 'cara', evaluateeId: 'ana', relationshipType: 'CROSS_DEPARTMENT' }])
  assert.equal(counts.get('cara:ana:CROSS_DEPARTMENT'), 2)
})
