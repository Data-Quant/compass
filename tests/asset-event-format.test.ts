import test from 'node:test'
import assert from 'node:assert/strict'
import { formatAssetEvent } from '../lib/asset-event-format'

test('formats create, update, and assignment events', () => {
  assert.equal(formatAssetEvent('ASSET_CREATED', { equipmentId: 'LAP-0001' }), 'Asset created (LAP-0001)')
  assert.equal(formatAssetEvent('ASSET_CREATED', {}), 'Asset created')
  assert.equal(
    formatAssetEvent('ASSET_UPDATED', { fields: ['assetName', 'vendor'] }),
    'Details updated: assetName, vendor'
  )
  assert.equal(formatAssetEvent('ASSET_UPDATED', { fields: [] }), 'Details updated')
  assert.equal(
    formatAssetEvent('ASSET_ASSIGNED', { employeeName: 'Jane Doe', note: 'Onboarding' }),
    'Assigned to Jane Doe — Onboarding'
  )
})

test('formats status and condition changes with readable labels', () => {
  assert.equal(
    formatAssetEvent('STATUS_CHANGED', { from: 'IN_REPAIR', to: 'IN_STOCK', note: 'Back from repair' }),
    'Status changed from IN REPAIR to IN STOCK — Back from repair'
  )
  assert.equal(
    formatAssetEvent('CONDITION_CHANGED', { from: 'GOOD', to: 'DAMAGED' }),
    'Condition changed from GOOD to DAMAGED'
  )
})

test('formats migration and unknown events, and tolerates bad payloads', () => {
  assert.equal(
    formatAssetEvent('ASSET_MIGRATED', {
      oldEquipmentId: 'EQUIP-101',
      newEquipmentId: 'LAP-0001',
      oldCategory: 'laptop',
      newCategory: 'Laptops',
    }),
    'Renumbered EQUIP-101 → LAP-0001 (category laptop → Laptops)'
  )
  assert.equal(formatAssetEvent('SOMETHING_ELSE', null), 'SOMETHING ELSE')
  assert.equal(formatAssetEvent('STATUS_CHANGED', null), 'Status changed to unknown')
})
