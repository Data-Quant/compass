import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPrimaryCoverPersonId,
  normalizeCoverPersonIds,
  parseCoverPersonIds,
} from '../lib/leave-cover'

test('parseCoverPersonIds keeps trimmed string IDs only', () => {
  assert.deepEqual(parseCoverPersonIds([' user-1 ', '', 42, 'user-2']), ['user-1', 'user-2'])
})

test('normalizeCoverPersonIds merges array and legacy ID without duplicates', () => {
  assert.deepEqual(
    normalizeCoverPersonIds(['user-2', 'user-1', 'user-2'], 'user-3', null),
    ['user-2', 'user-1', 'user-3']
  )
})

test('normalizeCoverPersonIds excludes the employee themselves', () => {
  assert.deepEqual(
    normalizeCoverPersonIds(['user-1', 'user-2'], 'user-3', 'user-2'),
    ['user-1', 'user-3']
  )
})

test('getPrimaryCoverPersonId returns the first cover or null', () => {
  assert.equal(getPrimaryCoverPersonId(['user-3', 'user-4']), 'user-3')
  assert.equal(getPrimaryCoverPersonId([]), null)
})
