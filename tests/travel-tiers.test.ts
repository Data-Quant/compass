import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTravelTierPatch, toTravelTierDraft } from '../lib/payroll/travel-tiers'

const tier = {
  id: 't1',
  transportMode: 'CAR' as const,
  minKm: 0,
  maxKm: 5,
  monthlyRate: 11500,
  effectiveFrom: '2026-02-01T00:00:00.000Z',
  effectiveTo: null,
  isActive: true,
}

test('toTravelTierDraft renders numbers and ISO dates as input strings', () => {
  assert.deepEqual(toTravelTierDraft(tier), {
    transportMode: 'CAR',
    minKm: '0',
    maxKm: '5',
    monthlyRate: '11500',
    effectiveFrom: '2026-02-01',
    effectiveTo: '',
    isActive: true,
  })
  assert.equal(toTravelTierDraft({ ...tier, maxKm: null }).maxKm, '')
  assert.equal(toTravelTierDraft({ ...tier, effectiveTo: '2026-12-31T00:00:00.000Z' }).effectiveTo, '2026-12-31')
})

test('buildTravelTierPatch returns only the fields that changed', () => {
  const draft = { ...toTravelTierDraft(tier), monthlyRate: '12000', maxKm: '' }
  const result = buildTravelTierPatch(tier, draft)
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.patch, { monthlyRate: 12000, maxKm: null })
})

test('buildTravelTierPatch with no changes yields an empty patch', () => {
  const result = buildTravelTierPatch(tier, toTravelTierDraft(tier))
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.patch, {})
})

test('buildTravelTierPatch converts dates, mode and active flag', () => {
  const draft = {
    ...toTravelTierDraft(tier),
    transportMode: 'BIKE',
    effectiveFrom: '2026-03-01',
    effectiveTo: '2026-12-31',
    isActive: false,
  }
  const result = buildTravelTierPatch(tier, draft)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.patch, {
      transportMode: 'BIKE',
      effectiveFrom: '2026-03-01',
      effectiveTo: '2026-12-31',
      isActive: false,
    })
  }
})

test('buildTravelTierPatch rejects invalid drafts with a clear message', () => {
  const base = toTravelTierDraft(tier)
  const cases: Array<[Partial<typeof base>, RegExp]> = [
    [{ minKm: '-1' }, /Min KM/],
    [{ minKm: 'abc' }, /Min KM/],
    [{ maxKm: '2', minKm: '5' }, /Max KM/],
    [{ monthlyRate: '-5' }, /rate/i],
    [{ effectiveFrom: '' }, /Effective from/],
    [{ effectiveTo: '2026-01-01' }, /Effective to/],
    [{ transportMode: 'ROCKET' }, /mode/i],
  ]
  for (const [override, pattern] of cases) {
    const result = buildTravelTierPatch(tier, { ...base, ...override })
    assert.equal(result.ok, false, JSON.stringify(override))
    if (!result.ok) assert.match(result.error, pattern)
  }
})
