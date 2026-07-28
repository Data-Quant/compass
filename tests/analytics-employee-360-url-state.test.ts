import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseEmployee360Domain,
  parseEmployee360UrlState,
  updateEmployee360SearchParams,
} from '../lib/analytics/employee-360-url-state'

test('Employee 360 URL state restores a valid deep link', () => {
  const state = parseEmployee360UrlState(
    new URLSearchParams(
      'employeeId=employee-a&periodId=period-2&compareId=employee-b&domain=clients'
    )
  )

  assert.deepEqual(state, {
    employeeId: 'employee-a',
    periodId: 'period-2',
    compareId: 'employee-b',
    domain: 'clients',
  })
})

test('Employee 360 URL state falls back to overview for an unknown domain', () => {
  assert.equal(parseEmployee360Domain('made-up-domain'), 'overview')
  assert.equal(parseEmployee360Domain(null), 'overview')
})

test('Employee 360 URL state prevents self-comparison', () => {
  const parsed = parseEmployee360UrlState(
    new URLSearchParams('employeeId=employee-a&compareId=employee-a')
  )
  assert.equal(parsed.compareId, null)

  const updated = updateEmployee360SearchParams(
    new URLSearchParams('employeeId=employee-a&compareId=employee-b'),
    { compareId: 'employee-a' }
  )
  assert.equal(updated.get('compareId'), null)
})

test('pivoting to another employee can clear comparison without losing period or domain', () => {
  const updated = updateEmployee360SearchParams(
    new URLSearchParams(
      'employeeId=employee-a&periodId=period-2&compareId=employee-b&domain=timeline'
    ),
    { employeeId: 'employee-c', compareId: null }
  )

  assert.equal(updated.get('employeeId'), 'employee-c')
  assert.equal(updated.get('periodId'), 'period-2')
  assert.equal(updated.get('domain'), 'timeline')
  assert.equal(updated.get('compareId'), null)
})
