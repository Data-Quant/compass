import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPayslipEmail, payslipFileName, resolvePayslipCc } from '../lib/payroll/payslip-email'

test('payslipFileName strips unsafe characters and joins with underscores', () => {
  assert.equal(payslipFileName('Ammar Hassan', 'August 2026'), 'Payslip_Ammar_Hassan_August_2026.pdf')
  assert.equal(payslipFileName("O'Neil / Jr.", 'Sep 2026'), 'Payslip_ONeil_Jr_Sep_2026.pdf')
})

test('buildPayslipEmail produces subject, body and attachment metadata', () => {
  const email = buildPayslipEmail({
    employeeName: 'Ammar <Hassan>',
    periodLabel: 'August 2026',
  })

  assert.equal(email.subject, 'Pay Slip - Ammar <Hassan> - August 2026')
  assert.equal(email.fileName, 'Payslip_Ammar_Hassan_August_2026.pdf')
  assert.match(email.html, /Ammar &lt;Hassan&gt;/)
  assert.match(email.html, /August 2026/)
  assert.match(email.html, /confidential/i)
  assert.doesNotMatch(email.html, /<Hassan>/)
  assert.match(email.text, /August 2026/)
})

test('resolvePayslipCc parses the configured list and never CCs the recipient themself', () => {
  assert.deepEqual(resolvePayslipCc('a@x.com, B@x.com ,, ', 'someone@x.com'), ['a@x.com', 'b@x.com'])
  assert.deepEqual(resolvePayslipCc('a@x.com,b@x.com', 'A@x.com'), ['b@x.com'])
  assert.deepEqual(resolvePayslipCc(undefined, 'someone@x.com'), ['shoaib@plutus21.com'])
  assert.deepEqual(resolvePayslipCc('', 'shoaib@plutus21.com'), [])
})
