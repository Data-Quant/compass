import test from 'node:test'
import assert from 'node:assert/strict'
import { nextVariant, planBatch, type BatchInput, type SchedulableSlot } from '../lib/weekly/scheduler'

const slot = (id: string, overrides: Partial<SchedulableSlot> = {}): SchedulableSlot => ({
  id, evaluateeId: `e-${id}`, perspective: 'PEER', status: 'OPEN', confirmedSamples: 0, hasOpenPrompt: false, lastAskedWeek: null, snoozedUntilWeek: null, ...overrides,
})
const input = (slots: SchedulableSlot[], overrides: Partial<BatchInput> = {}): BatchInput => ({
  week: 1, totalWeeks: 13, cap: 5, openPromptCount: 0, slots, evidenceByEvaluatee: new Map(), ...overrides,
})
const many = (n: number, overrides: Partial<SchedulableSlot> = {}) => Array.from({ length: n }, (_, i) => slot(`s${String(i).padStart(2, '0')}`, overrides))

test('questions are paced across the question weeks, not front-loaded', () => {
  assert.equal(planBatch(input(many(13))).length, 2) // ceil(13 / 11)
  assert.equal(planBatch(input(many(3))).length, 1)
  assert.equal(planBatch(input(many(3), { week: 11 })).length, 3)
})

test('the weekly cap holds, and carried-over questions count toward it', () => {
  assert.equal(planBatch(input(many(80))).length, 5)
  assert.equal(planBatch(input(many(13), { openPromptCount: 2 })).length, 0)
  assert.equal(planBatch(input(many(80), { openPromptCount: 3 })).length, 2)
})

test('nothing is released outside the cycle', () => {
  assert.deepEqual(planBatch(input(many(5), { week: 0 })), [])
  assert.deepEqual(planBatch(input(many(5), { week: 14 })), [])
})

test('at most two questions about one person per batch', () => {
  const slots = many(6, { evaluateeId: 'same' })
  assert.equal(planBatch(input(slots, { week: 11 })).length, 2)
})

test('lead questions first, then the person with the least evidence', () => {
  const slots = [
    slot('peer-rich', { evaluateeId: 'rich' }),
    slot('peer-poor', { evaluateeId: 'poor' }),
    slot('lead', { evaluateeId: 'rich', perspective: 'LEAD' }),
  ]
  const evidence = new Map([['rich', 5], ['poor', 0]])
  assert.deepEqual(planBatch(input(slots, { week: 11, evidenceByEvaluatee: evidence })), ['lead', 'peer-poor', 'peer-rich'])
})

test('snoozed, recently asked, answered-and-open and closed slots are skipped', () => {
  const slots = [
    slot('snoozed', { snoozedUntilWeek: 5 }),
    slot('recent', { lastAskedWeek: 2 }),
    slot('open', { hasOpenPrompt: true }),
    slot('closed', { status: 'CLOSED_NOT_OBSERVED' }),
    slot('cancelled', { status: 'CANCELLED' }),
    slot('done', { status: 'SATISFIED', confirmedSamples: 1 }),
    slot('ready'),
  ]
  // A short cycle leaves one question week at week 4, so pacing does not limit the batch here.
  assert.deepEqual(planBatch(input(slots, { week: 4, totalWeeks: 6, cap: 10 })), ['ready'])
  assert.deepEqual(planBatch(input(slots, { week: 5, totalWeeks: 5, cap: 10 })).sort(), ['ready', 'recent', 'snoozed'])
})

test('lead slots may take a second sample after the first is confirmed, never in catch-up weeks', () => {
  const slots = [slot('lead-done', { perspective: 'LEAD', status: 'SATISFIED', confirmedSamples: 1, lastAskedWeek: 1 }), slot('fresh')]
  assert.deepEqual(planBatch(input(slots, { week: 11, cap: 5 })), ['fresh', 'lead-done'])
  assert.deepEqual(planBatch(input(slots, { week: 12, cap: 5 })), ['fresh'])
})

test('catch-up weeks still ask first samples nobody has been asked yet', () => {
  assert.equal(planBatch(input(many(4), { week: 12 })).length, 2) // ceil(4 / 2 weeks left)
})

test('prompt variants rotate: the least-used variant first, A before B', () => {
  const variants = [{ id: 'a', variant: 'A' }, { id: 'b', variant: 'B' }]
  assert.equal(nextVariant(variants, [])?.id, 'a')
  assert.equal(nextVariant(variants, ['a'])?.id, 'b')
  assert.equal(nextVariant(variants, ['a', 'b'])?.id, 'a')
  assert.equal(nextVariant([], []), null)
})
