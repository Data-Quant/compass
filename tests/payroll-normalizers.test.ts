import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePayrollName,
  parseCellNumber,
  parsePeriodKey,
  periodKeyToDate,
  toPeriodKey,
} from '../lib/payroll/normalizers'

test('normalizePayrollName strips punctuation/casing noise', () => {
  assert.equal(normalizePayrollName('  Ali Raza,  '), 'ali raza')
  assert.equal(normalizePayrollName('ALI-RAZA'), 'ali raza')
})

test('parseCellNumber handles plain and formatted values', () => {
  assert.equal(parseCellNumber(123.45), 123.45)
  assert.equal(parseCellNumber('PKR 15,000'), 15000)
  assert.equal(parseCellNumber({ result: '7,250' }), 7250)
})

test('parsePeriodKey and periodKeyToDate round-trip', () => {
  const key = parsePeriodKey('2/2026')
  assert.equal(key, '02/2026')
  const date = periodKeyToDate(key!)
  assert.equal(date?.toISOString().startsWith('2026-02-01'), true)
})

test('toPeriodKey uses MM/YYYY format', () => {
  const key = toPeriodKey(new Date('2026-02-13T12:00:00.000Z'))
  assert.match(key, /^\d{2}\/\d{4}$/)
})
