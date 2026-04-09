import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveSubscriptionOwners,
  splitSubscriptionOwnerText,
} from '../lib/subscriptions'

test('splitSubscriptionOwnerText handles common separators', () => {
  assert.deepEqual(
    splitSubscriptionOwnerText('Richard / Noha & Daniyal\nBrad, Maryam'),
    ['Richard', 'Noha', 'Daniyal', 'Brad', 'Maryam']
  )
})

test('resolveSubscriptionOwners matches multiple owners and keeps unresolved tokens', () => {
  const result = resolveSubscriptionOwners('Richard/Noha/Unknown Owner', [
    { id: 'richard', name: 'Richard Reizes', role: 'EMPLOYEE' },
    { id: 'noha', name: 'Noha Hamraoui', role: 'EXECUTION' },
    { id: 'nohelia', name: 'Nohelia Figueredo', role: 'EXECUTION' },
  ])

  assert.deepEqual(result.ownerIds, ['richard', 'noha'])
  assert.deepEqual(result.unresolvedTokens, ['Unknown Owner'])
  assert.equal(result.normalizedPersonInChargeText, 'Richard/Noha/Unknown Owner')
})

test('resolveSubscriptionOwners uses imported-name aliases when available', () => {
  const result = resolveSubscriptionOwners('Nohelia Figuerdo', [
    { id: 'nohelia', name: 'Nohelia Figueredo', role: 'EXECUTION' },
  ])

  assert.deepEqual(result.ownerIds, ['nohelia'])
  assert.deepEqual(result.unresolvedTokens, [])
})
