import test from 'node:test'
import assert from 'node:assert/strict'
import {
  C_LEVEL_EVALUATORS,
  HAMIZ_EVALUATOR,
  isCLevelEvaluatorName,
} from '../lib/config'

test('Hamiz is the only configured C_LEVEL evaluator', () => {
  assert.deepEqual(C_LEVEL_EVALUATORS, [HAMIZ_EVALUATOR])
  assert.equal(isCLevelEvaluatorName('Hamiz Awan'), true)
  assert.equal(isCLevelEvaluatorName(' hamiz awan '), true)
  assert.equal(isCLevelEvaluatorName('Brad Herman'), false)
  assert.equal(isCLevelEvaluatorName('Daniyal Awan'), false)
  assert.equal(isCLevelEvaluatorName('Richard Reizes'), false)
})
