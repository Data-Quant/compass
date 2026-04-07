import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isHREvaluatorName,
  normalizeImportedName,
  resolveImportedName,
} from '../lib/mapping-import'

test('resolveImportedName keeps the Fakayha spelling canonical', () => {
  assert.equal(resolveImportedName('Fakaya Jamil'), 'Fakayha Jamil')
  assert.equal(resolveImportedName(' Fakayha   Jamil '), 'Fakayha Jamil')
})

test('normalizeImportedName collapses spacing and casing', () => {
  assert.equal(normalizeImportedName('  Muhammad   Affan SIDDIQUI  '), 'muhammad affan siddiqui')
})

test('isHREvaluatorName recognizes configured HR evaluators', () => {
  assert.equal(isHREvaluatorName('Saman Fahim'), true)
  assert.equal(isHREvaluatorName('saman   fahim'), true)
  assert.equal(isHREvaluatorName('Muhammad Affan Siddiqui'), false)
})
