/**
 * Pure builders for the pay slip email: subject, body and attachment name.
 * Kept free of transport and database concerns so they are unit-testable.
 */

import { escapeHtml } from '../sanitize'

export interface PayslipEmailInput {
  employeeName: string
  periodLabel: string
}

export interface PayslipEmailContent {
  subject: string
  fileName: string
  html: string
  text: string
}

/** Finance contact copied on every pay slip unless PAYSLIP_CC_EMAILS overrides it. */
export const DEFAULT_PAYSLIP_CC = 'shoaib@plutus21.com'

/**
 * Resolves the CC list for a pay slip email from the raw PAYSLIP_CC_EMAILS
 * value (comma-separated). An unset value falls back to the Finance default;
 * an explicitly empty value disables CC. The recipient is never CC'd to
 * themself.
 */
export function resolvePayslipCc(rawList: string | undefined, recipientEmail: string): string[] {
  const source = rawList === undefined ? DEFAULT_PAYSLIP_CC : rawList
  const recipient = recipientEmail.trim().toLowerCase()
  const seen = new Set<string>()
  return source
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => {
      if (!email || email === recipient || seen.has(email)) return false
      seen.add(email)
      return true
    })
}

const CONFIDENTIALITY_NOTE =
  'Please keep your salary, benefits and any other compensation details confidential, ' +
  'and do not share them with other employees or any third party without a bona fide need to know.'

function toFileToken(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

export function payslipFileName(employeeName: string, periodLabel: string): string {
  return `Payslip_${toFileToken(employeeName)}_${toFileToken(periodLabel)}.pdf`
}

export function buildPayslipEmail(input: PayslipEmailInput): PayslipEmailContent {
  const name = escapeHtml(input.employeeName)
  const period = escapeHtml(input.periodLabel)

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Pay Slip - ${period}</h2>
      <p>Dear ${name},</p>
      <p>Please find attached your pay slip for <strong>${period}</strong>.</p>
      <p style="font-size: 13px; color: #4b5563;">${escapeHtml(CONFIDENTIALITY_NOTE)}</p>
      <p style="font-size: 13px; color: #4b5563;">
        If anything on the pay slip looks incorrect, please reach out to the Finance team.
      </p>
      <p style="margin-top: 24px;">Best regards,<br/>Finance Team</p>
    </div>
  `

  const text = [
    `Pay Slip - ${input.periodLabel}`,
    '',
    `Dear ${input.employeeName},`,
    '',
    `Please find attached your pay slip for ${input.periodLabel}.`,
    '',
    CONFIDENTIALITY_NOTE,
    '',
    'If anything on the pay slip looks incorrect, please reach out to the Finance team.',
    '',
    'Best regards,',
    'Finance Team',
  ].join('\n')

  return {
    subject: `Pay Slip - ${input.employeeName} - ${input.periodLabel}`,
    fileName: payslipFileName(input.employeeName, input.periodLabel),
    html,
    text,
  }
}
