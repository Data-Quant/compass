import test from 'node:test'
import assert from 'node:assert/strict'
import { stableHash } from '../lib/weekly/hash'
import { redactNames } from '../lib/weekly/redact'
import { looksSensitive } from '../lib/weekly/sensitive'
import { isNearDuplicate, trigramSimilarity } from '../lib/weekly/similarity'

const people = [{ name: 'Ana Torvik', placeholder: 'the person' }, { name: 'Layla Mercer', placeholder: 'the evaluator' }]

test('names are removed in full, by part, in possessives and in any case, but not inside other words', () => {
  assert.equal(redactNames('Ana Torvik sent it.', people), 'the person sent it.')
  assert.equal(redactNames("I asked ana; Ana's report was late.", people), "I asked the person; the person's report was late.")
  assert.equal(redactNames('Layla told Torvik about it.', people), 'the evaluator told the person about it.')
  assert.equal(redactNames('Anand and Banana stay.', people), 'Anand and Banana stay.')
  assert.equal(redactNames('Al did it.', [{ name: 'Al Bo', placeholder: 'the person' }]), 'Al did it.')
})

test('near-duplicate answers are caught, different ones are not', () => {
  const answer = 'The client moved the launch forward by a week and they rebuilt the plan the same afternoon with named owners.'
  assert.equal(trigramSimilarity(answer, answer), 1)
  assert.equal(isNearDuplicate(answer, answer.replace('afternoon', 'evening')), true)
  assert.equal(isNearDuplicate(answer, 'We reviewed the quarterly budget and found two errors in the forecast.'), false)
  assert.equal(trigramSimilarity('', answer), 0)
})

test('health, harassment and legal matters are flagged; similar-looking words are not', () => {
  assert.equal(looksSensitive('They told me about a serious health condition.'), true)
  assert.equal(looksSensitive('She reported harassment by a client.'), true)
  assert.equal(looksSensitive('The vendor threatened legal action.'), true)
  assert.equal(looksSensitive('We kept the pipeline healthy and the forecast bullish.'), false)
})

test('the hash is stable', () => {
  assert.equal(stableHash('abc'), stableHash('abc'))
  assert.notEqual(stableHash('abc'), stableHash('abd'))
})
