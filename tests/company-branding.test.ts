import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isThreeEDepartment,
  normalizeCompanyView,
  userMatchesCompanyView,
} from '../lib/company-branding'

test('normalizeCompanyView defaults to plutus and recognizes 3E input', () => {
  assert.equal(normalizeCompanyView(undefined), 'plutus')
  assert.equal(normalizeCompanyView(null), 'plutus')
  assert.equal(normalizeCompanyView('plutus'), 'plutus')
  assert.equal(normalizeCompanyView(' 3E '), '3e')
})

test('isThreeEDepartment only matches exact 3E department values', () => {
  assert.equal(isThreeEDepartment('3E'), true)
  assert.equal(isThreeEDepartment(' 3e '), true)
  assert.equal(isThreeEDepartment('Three E'), false)
  assert.equal(isThreeEDepartment('HR'), false)
})

test('HR users appear in both company views', () => {
  const hrUser = {
    id: '1',
    name: 'Areebah',
    role: 'HR',
    department: 'HR',
  }

  assert.equal(userMatchesCompanyView(hrUser, 'plutus'), true)
  assert.equal(userMatchesCompanyView(hrUser, '3e'), true)
})

test('3E and Plutus filters separate non-HR users correctly', () => {
  const threeEUser = {
    id: '2',
    name: 'Ali',
    role: 'EMPLOYEE',
    department: '3E',
  }
  const plutusUser = {
    id: '3',
    name: 'Sara',
    role: 'EMPLOYEE',
    department: 'Product',
  }

  assert.equal(userMatchesCompanyView(threeEUser, '3e'), true)
  assert.equal(userMatchesCompanyView(threeEUser, 'plutus'), false)
  assert.equal(userMatchesCompanyView(plutusUser, 'plutus'), true)
  assert.equal(userMatchesCompanyView(plutusUser, '3e'), false)
})
