import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OFFICE_LOCATIONS,
  OFFICE_LOCATION_CITIES,
  getOfficeLocationValuesForFilter,
  isOfficeLocation,
  normalizeOfficeLocation,
} from '../lib/office-locations'

test('OFFICE_LOCATION_CITIES flattens all groups without duplicates', () => {
  const fromGroups = OFFICE_LOCATIONS.flatMap((group) => group.cities)
  assert.deepEqual(OFFICE_LOCATION_CITIES, fromGroups)
  assert.equal(new Set(OFFICE_LOCATION_CITIES).size, OFFICE_LOCATION_CITIES.length)
})

test('existing office cities remain valid (data-migration safety)', () => {
  for (const city of ['Karachi', 'Islamabad', 'Lahore', 'Casablanca', 'Dallas']) {
    assert.equal(isOfficeLocation(city), true, `${city} should validate`)
  }
})

test('normalizeOfficeLocation resolves case, legacy aliases, and rejects unknown', () => {
  assert.equal(normalizeOfficeLocation('karachi'), 'Karachi')
  assert.equal(normalizeOfficeLocation('Karachi Office'), 'Karachi')
  assert.equal(normalizeOfficeLocation('Jakarta'), 'Jakarta')
  assert.equal(normalizeOfficeLocation('Atlantis'), null)
  assert.equal(normalizeOfficeLocation(''), null)
  assert.equal(normalizeOfficeLocation(null), null)
})

test('isOfficeLocation accepts canonical cities and legacy aliases', () => {
  assert.equal(isOfficeLocation('Dallas'), true)
  assert.equal(isOfficeLocation('dallas office'), true)
  assert.equal(isOfficeLocation('Nowhere'), false)
})

test('getOfficeLocationValuesForFilter includes canonical city plus legacy variants', () => {
  assert.deepEqual(getOfficeLocationValuesForFilter('Karachi'), ['Karachi', 'Karachi Office'])
  assert.deepEqual(getOfficeLocationValuesForFilter('Jakarta'), ['Jakarta'])
  assert.deepEqual(getOfficeLocationValuesForFilter('Nowhere'), [])
})
