import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decryptPayrollField,
  decryptSensitivePayrollProfileFields,
  encryptPayrollField,
  encryptSensitivePayrollProfileFields,
  isEncryptedPayrollField,
} from '../lib/payroll/sensitive-fields'
import { canDeletePayrollPeriodStatus } from '../lib/payroll/period-status'

const TEST_KEY = '0123456789abcdef0123456789abcdef'

function withEncryptionKey<T>(key: string | undefined, fn: () => T): T {
  const previous = process.env.PAYROLL_FIELD_ENCRYPTION_KEY
  if (key === undefined) {
    delete process.env.PAYROLL_FIELD_ENCRYPTION_KEY
  } else {
    process.env.PAYROLL_FIELD_ENCRYPTION_KEY = key
  }

  try {
    return fn()
  } finally {
    if (previous === undefined) {
      delete process.env.PAYROLL_FIELD_ENCRYPTION_KEY
    } else {
      process.env.PAYROLL_FIELD_ENCRYPTION_KEY = previous
    }
  }
}

test('payroll sensitive fields encrypt and decrypt with AES-GCM envelope format', () => {
  withEncryptionKey(TEST_KEY, () => {
    const encrypted = encryptPayrollField('accountNumber', 'PK-123456')

    assert.equal(isEncryptedPayrollField(encrypted), true)
    assert.notEqual(encrypted, 'PK-123456')
    assert.equal(decryptPayrollField('accountNumber', encrypted), 'PK-123456')
  })
})

test('payroll sensitive profile helper encrypts only sensitive values', () => {
  withEncryptionKey(TEST_KEY, () => {
    const encrypted = encryptSensitivePayrollProfileFields({
      cnicNumber: '12345-1234567-1',
      bankName: 'Bank',
      accountTitle: 'Employee',
      accountNumber: '001122',
    })

    assert.equal(isEncryptedPayrollField(encrypted.cnicNumber), true)
    assert.equal(isEncryptedPayrollField(encrypted.accountNumber), true)
    assert.deepEqual(decryptSensitivePayrollProfileFields(encrypted), {
      cnicNumber: '12345-1234567-1',
      bankName: 'Bank',
      accountTitle: 'Employee',
      accountNumber: '001122',
    })
  })
})

test('payroll sensitive field decrypt keeps legacy plaintext readable', () => {
  withEncryptionKey(undefined, () => {
    assert.equal(decryptPayrollField('bankName', 'Legacy Bank'), 'Legacy Bank')
  })
})

test('payroll sensitive field save fails closed without encryption key', () => {
  withEncryptionKey(undefined, () => {
    assert.throws(
      () => encryptPayrollField('accountNumber', '001122'),
      /PAYROLL_FIELD_ENCRYPTION_KEY is required/
    )
  })
})

test('payroll period deletion is blocked for finalized statuses', () => {
  assert.equal(canDeletePayrollPeriodStatus('DRAFT'), true)
  assert.equal(canDeletePayrollPeriodStatus('CALCULATED'), true)
  assert.equal(canDeletePayrollPeriodStatus('FAILED'), true)
  assert.equal(canDeletePayrollPeriodStatus('APPROVED'), false)
  assert.equal(canDeletePayrollPeriodStatus('SENDING'), false)
  assert.equal(canDeletePayrollPeriodStatus('SENT'), false)
  assert.equal(canDeletePayrollPeriodStatus('LOCKED'), false)
})
