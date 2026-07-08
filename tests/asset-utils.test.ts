import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canAssignInStatus,
  ensureWarrantyDateOrder,
  getWarrantyState,
  normalizeEquipmentId,
  ASSET_CATEGORIES,
  getAssetCategoryMeta,
  isAssetCategory,
  assetCategoryHasSpecs,
  isPurchaseType,
  normalizePurchaseType,
  normalizeLaptopSpecs,
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

test('ASSET_CATEGORIES has unique values and id prefixes', () => {
  const values = new Set(ASSET_CATEGORIES.map((c) => c.value))
  const prefixes = new Set(ASSET_CATEGORIES.map((c) => c.idPrefix))
  assert.equal(values.size, ASSET_CATEGORIES.length)
  assert.equal(prefixes.size, ASSET_CATEGORIES.length)
})

test('getAssetCategoryMeta resolves case-insensitively; unknown is null', () => {
  assert.equal(getAssetCategoryMeta('laptops')?.idPrefix, 'LAP')
  assert.equal(getAssetCategoryMeta('Mobile Phones')?.idPrefix, 'MOB')
  assert.equal(getAssetCategoryMeta('Spaceship'), null)
  assert.equal(getAssetCategoryMeta(''), null)
})

test('isAssetCategory / assetCategoryHasSpecs', () => {
  assert.equal(isAssetCategory('YubiKeys'), true)
  assert.equal(isAssetCategory('Nope'), false)
  assert.equal(assetCategoryHasSpecs('Laptops'), true)
  assert.equal(assetCategoryHasSpecs('Bag'), false)
})

test('purchase type validation and normalization', () => {
  assert.equal(isPurchaseType('Refurbished'), true)
  assert.equal(isPurchaseType('rented'), false)
  assert.equal(normalizePurchaseType('brand new'), 'Brand New')
  assert.equal(normalizePurchaseType(''), null)
})

test('normalizeLaptopSpecs trims and drops empty', () => {
  assert.deepEqual(normalizeLaptopSpecs({ processor: ' i7 ', ram: '16GB', storage: '512GB SSD' }), {
    processor: 'i7',
    ram: '16GB',
    storage: '512GB SSD',
  })
  assert.equal(normalizeLaptopSpecs({ processor: '', ram: '', storage: '' }), null)
  assert.equal(normalizeLaptopSpecs(null), null)
})

