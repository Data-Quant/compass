import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canEditInPeriod,
  validateRating,
  hasActualChange,
  applyEdit,
  decideEdit,
} from '../lib/evaluation-edit'

const target = {
  ratingValue: 3,
  textResponse: 'Solid work',
  periodId: 'period-active',
  submittedAt: new Date('2026-07-01'),
}

test('corrections are confined to the active period', () => {
  assert.equal(canEditInPeriod(target, 'period-active').ok, true)

  const closed = canEditInPeriod(target, 'period-next')
  assert.equal(closed.ok, false)
  assert.match(closed.ok === false ? closed.reason : '', /active period/i)
})

test('with no active period nothing can be corrected', () => {
  const decision = canEditInPeriod(target, null)
  assert.equal(decision.ok, false)
})

test('ratings stay on the 1-4 scale', () => {
  for (const value of [1, 2, 3, 4]) {
    assert.equal(validateRating(value).ok, true, `${value} should be valid`)
  }

  for (const value of [0, 5, -1, 2.5, Number.NaN]) {
    assert.equal(validateRating(value).ok, false, `${value} should be rejected`)
  }
})

test('clearing a rating is allowed', () => {
  assert.equal(validateRating(null).ok, true)
  assert.equal(validateRating(undefined).ok, true)
})

test('a no-op edit is rejected so the audit log stays meaningful', () => {
  assert.equal(hasActualChange(target, { ratingValue: 3 }), false)
  assert.equal(hasActualChange(target, { textResponse: 'Solid work' }), false)
  assert.equal(hasActualChange(target, {}), false)

  // Whitespace-only differences are not changes either.
  assert.equal(hasActualChange(target, { textResponse: '  Solid work  ' }), false)
})

test('real changes are recognised', () => {
  assert.equal(hasActualChange(target, { ratingValue: 4 }), true)
  assert.equal(hasActualChange(target, { textResponse: 'Revised note' }), true)
  assert.equal(hasActualChange(target, { ratingValue: null }), true)
})

test('untouched fields are preserved', () => {
  // Editing only the rating must not wipe the comment, which is what a naive
  // update sending both fields would do.
  assert.deepEqual(applyEdit(target, { ratingValue: 4 }), {
    ratingValue: 4,
    textResponse: 'Solid work',
  })

  assert.deepEqual(applyEdit(target, { textResponse: 'Revised' }), {
    ratingValue: 3,
    textResponse: 'Revised',
  })
})

test('blank text clears the comment rather than storing whitespace', () => {
  assert.deepEqual(applyEdit(target, { textResponse: '   ' }), {
    ratingValue: 3,
    textResponse: null,
  })
})

test('the full gate applies period, range and change checks in order', () => {
  assert.equal(decideEdit({ target, input: { ratingValue: 4 }, activePeriodId: 'period-active' }).ok, true)

  // Period is checked before the value, so an out-of-range edit to a closed
  // period reports the period problem rather than the rating.
  const closed = decideEdit({ target, input: { ratingValue: 9 }, activePeriodId: 'period-old' })
  assert.equal(closed.ok, false)
  assert.match(closed.ok === false ? closed.reason : '', /active period/i)

  const outOfRange = decideEdit({ target, input: { ratingValue: 9 }, activePeriodId: 'period-active' })
  assert.equal(outOfRange.ok, false)
  assert.match(outOfRange.ok === false ? outOfRange.reason : '', /between/i)

  const noop = decideEdit({ target, input: { ratingValue: 3 }, activePeriodId: 'period-active' })
  assert.equal(noop.ok, false)
  assert.match(noop.ok === false ? noop.reason : '', /nothing changed/i)
})
