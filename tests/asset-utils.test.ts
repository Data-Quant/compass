import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canAssignInStatus,
  ensureWarrantyDateOrder,
  getWarrantyState,
  normalizeEquipmentId,
} from '../lib/asset-utils'

test('normalizeEquipmentId trims, uppercases, and collapses spaces', () => {
  assert.equal(normalizeEquipmentId('  lp 001  '), 'LP-001')
})

test('canAssignInStatus blocks retired/lost/disposed', () => {
  assert.equal(canAssignInStatus('IN_STOCK'), true)
  assert.equal(canAssignInStatus('ASSIGNED'), true)
  assert.equal(canAssignInStatus('IN_REPAIR'), true)
  assert.equal(canAssignInStatus('RETIRED'), false)
  assert.equal(canAssignInStatus('LOST'), false)
  assert.equal(canAssignInStatus('DISPOSED'), false)
})

test('ensureWarrantyDateOrder validates purchase to warranty ordering', () => {
  const purchase = new Date('2026-01-01T00:00:00.000Z')
  const warrantyEnd = new Date('2026-12-31T00:00:00.000Z')
  const invalid = new Date('2025-12-31T00:00:00.000Z')

  assert.equal(ensureWarrantyDateOrder(purchase, warrantyEnd), null)
  assert.equal(
    ensureWarrantyDateOrder(purchase, invalid),
    'warrantyEndDate cannot be earlier than purchaseDate'
  )
})

test('getWarrantyState marks expired, expiring, and valid', () => {
  const ref = new Date('2026-02-18T00:00:00.000Z')

  assert.equal(getWarrantyState(null, ref), 'NONE')
  assert.equal(getWarrantyState('2026-02-10', ref), 'EXPIRED')
  assert.equal(getWarrantyState('2026-03-01', ref), 'EXPIRING')
  assert.equal(getWarrantyState('2026-08-01', ref), 'VALID')
})

