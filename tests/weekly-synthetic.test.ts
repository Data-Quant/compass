import test from 'node:test'
import assert from 'node:assert/strict'
import { answerProblem } from '../lib/weekly/answer-rules'
import { fakeScore } from '../lib/weekly/ai/fake-model'
import { syntheticAnswer } from '../lib/weekly/content/synthetic'
import { isNearDuplicate } from '../lib/weekly/similarity'

const seeds = Array.from({ length: 20 }, (_, i) => `prompt-${i}`)
const text = (a: ReturnType<typeof syntheticAnswer>) => [a.situation, a.action, a.result].join('\n')

test('one evaluator’s synthetic answers are rarely near-copies of each other', () => {
  const answers = seeds.map((seed) => syntheticAnswer(seed, 'Reliability'))
  let pairs = 0
  let copies = 0
  for (let i = 0; i < answers.length; i += 1) {
    for (let j = i + 1; j < answers.length; j += 1) {
      pairs += 1
      if (isNearDuplicate(text(answers[i]), text(answers[j]))) copies += 1
    }
  }
  assert.ok(copies / pairs < 0.1, `${copies} of ${pairs} pairs look copied`)
})

test('every synthetic answer passes the answer rules, and the stand-in model reads its quality', () => {
  for (const seed of seeds) {
    const answer = syntheticAnswer(seed, 'Quality of Work')
    assert.equal(answerProblem(answer), null, seed)
    const scored = fakeScore(`${text(answer)}\n${answer.shortfall}`)
    if (answer.quality === 'EMPTY_PRAISE') assert.equal(scored.sufficiency, 'INSUFFICIENT', seed)
    if (answer.quality === 'STRONG') assert.equal(scored.score, 4, seed)
    if (answer.quality === 'SOLID') assert.equal(scored.score, 2, seed)
    if (answer.quality === 'WEAK') assert.equal(scored.score, 1, seed)
    if (answer.quality === 'SENSITIVE') assert.deepEqual(scored.flags, ['SENSITIVE_CONTENT'], seed)
  }
})
