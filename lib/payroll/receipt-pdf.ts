/**
 * Pay slip PDF generator.
 *
 * Renders the Apollo Ventures pay slip: branded banner, NTN, employee block,
 * side-by-side earnings and deductions tables, net payable amount,
 * confidentiality note, accountant stamp and signature.
 *
 * Uses PDFKit for server-side PDF generation. Layout mirrors the reference
 * pay slip supplied by Finance (Sept 2026).
 */

import PDFDocument from 'pdfkit'
import type { PayslipData } from './payslip-data'
import { payslipBannerBuffer, payslipSignatureBuffer, payslipStampBuffer } from './payslip-assets'

/* ---------- Constants ---------- */

const COMPANY_NTN = 'NTN# 2309373-7'
const COMPANY_PHONE = '+92 321 2918609'
const COMPANY_EMAIL = 'apolloventurespk@gmail.com'

const CONFIDENTIALITY_NOTE =
  'All employees should keep their salaries, benefits, bonuses and any other form of compensation ' +
  'confidential, and avoid providing or otherwise broadcasting this information with other employees, ' +
  'or with any third-party that does not have a bona fide need to know.'

const PAGE_MARGIN = 50
const BANNER_TOP = 36
const TABLE_GAP = 24
const ROW_HEIGHT = 15
const AMOUNT_COL_WIDTH = 70
const FONT = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const FONT_ITALIC = 'Helvetica-Oblique'
const FONT_BOLD_ITALIC = 'Helvetica-BoldOblique'
const BORDER_COLOR = '#333333'
const HEADER_FILL = '#e5e5e5'

/* ---------- Helpers ---------- */

export function formatPayslipMoney(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return value < 0 ? `(${formatted})` : formatted
}

interface TableRowSpec {
  label: string
  value: number
  bold?: boolean
}

function earningsRows(e: PayslipData['earnings']): TableRowSpec[] {
  const rows: TableRowSpec[] = [
    { label: 'Basic Salary', value: e.basicSalary },
    { label: 'Medical Exemption (10% of Basic)', value: e.medicalTaxExemption },
    { label: 'Bonus', value: e.bonus },
    { label: 'Total Taxable Salary', value: e.totalTaxableSalary, bold: true },
    { label: 'Medical Allowance', value: e.medicalAllowance },
    { label: 'Travel Reimbursement', value: e.travelReimbursement },
    { label: 'Mobile Internet Reimbursement', value: e.mobileReimbursement },
    { label: 'Reimbursements (Personal / Office)', value: e.expenseReimbursement },
    { label: 'Advance Salary (Loan)', value: e.advanceLoan },
  ]
  return e.additionalEarnings !== 0
    ? [...rows, { label: 'Other Earnings', value: e.additionalEarnings }]
    : rows
}

function deductionRows(d: PayslipData['deductions']): TableRowSpec[] {
  const rows: TableRowSpec[] = [
    { label: 'Income Tax', value: d.incomeTax },
    { label: 'Adjustment (+Refund/-Deduction)', value: d.adjustment },
    { label: 'Loan Repayments', value: d.loanRepayment },
  ]
  return d.additionalDeductions !== 0
    ? [...rows, { label: 'Other Deductions', value: d.additionalDeductions }]
    : rows
}

/* ---------- Drawing primitives ---------- */

type Doc = PDFKit.PDFDocument

function drawLabelValue(doc: Doc, label: string, value: string, x: number, y: number, labelWidth: number) {
  doc.font(FONT_BOLD).fontSize(9).fillColor('black').text(label, x, y, { width: labelWidth, lineBreak: false })
  doc.font(FONT).fontSize(9).text(value, x + labelWidth, y, { lineBreak: false })
}

function drawAmountRow(doc: Doc, row: TableRowSpec, x: number, y: number, width: number) {
  const font = row.bold ? FONT_BOLD : FONT
  doc.font(font).fontSize(9).fillColor('black')
  doc.text(row.label, x + 4, y + 3, { width: width - AMOUNT_COL_WIDTH - 8, lineBreak: false })
  doc.text(formatPayslipMoney(row.value), x + width - AMOUNT_COL_WIDTH, y + 3, {
    width: AMOUNT_COL_WIDTH - 4,
    align: 'right',
    lineBreak: false,
  })
}

function strokeLine(doc: Doc, x1: number, y1: number, x2: number, y2: number) {
  doc.save()
  doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.75).strokeColor(BORDER_COLOR).stroke()
  doc.restore()
}

function strokeBox(doc: Doc, x: number, y: number, width: number, height: number) {
  doc.save()
  doc.rect(x, y, width, height).lineWidth(0.75).strokeColor(BORDER_COLOR).stroke()
  doc.restore()
}

interface AmountTableSpec {
  title: string
  rows: TableRowSpec[]
  total: TableRowSpec
  /** Total height the table box must occupy so paired tables align at the bottom. */
  boxHeight: number
}

function drawAmountTable(doc: Doc, spec: AmountTableSpec, x: number, y: number, width: number): number {
  strokeBox(doc, x, y, width, spec.boxHeight)

  // Title band
  doc.save()
  doc.rect(x, y, width, ROW_HEIGHT).fill(HEADER_FILL)
  doc.restore()
  doc.font(FONT_BOLD).fontSize(9).fillColor('black')
  doc.text(spec.title, x, y + 3, { width, align: 'center', lineBreak: false })
  strokeLine(doc, x, y + ROW_HEIGHT, x + width, y + ROW_HEIGHT)

  // Column headers
  let cursor = y + ROW_HEIGHT
  doc.font(FONT_BOLD).fontSize(9)
  doc.text('Description', x + 4, cursor + 3, { lineBreak: false })
  doc.text('Amount', x + width - AMOUNT_COL_WIDTH, cursor + 3, {
    width: AMOUNT_COL_WIDTH - 4,
    align: 'right',
    lineBreak: false,
  })
  cursor += ROW_HEIGHT

  for (const row of spec.rows) {
    drawAmountRow(doc, row, x, cursor, width)
    cursor += ROW_HEIGHT
  }

  // Total row pinned to the bottom of the box
  const totalY = y + spec.boxHeight - ROW_HEIGHT
  strokeLine(doc, x, totalY, x + width, totalY)
  drawAmountRow(doc, { ...spec.total, bold: true }, x, totalY, width)

  return y + spec.boxHeight
}

function drawBoxedRows(doc: Doc, rows: TableRowSpec[], x: number, y: number, width: number): number {
  const height = rows.length * ROW_HEIGHT
  strokeBox(doc, x, y, width, height)
  rows.forEach((row, index) => drawAmountRow(doc, row, x, y + index * ROW_HEIGHT, width))
  return y + height
}

/* ---------- Sections ---------- */

function drawHeader(doc: Doc, data: PayslipData, left: number, pageWidth: number): number {
  const bannerHeight = pageWidth / 4 // banner artwork is 4:1
  doc.image(payslipBannerBuffer(), left, BANNER_TOP, { width: pageWidth, height: bannerHeight })

  let y = BANNER_TOP + bannerHeight + 6
  doc.font('Times-Bold').fontSize(9).fillColor('black')
  doc.text(COMPANY_NTN, left, y, { width: pageWidth, align: 'right', lineBreak: false })

  y += 26
  doc.font(FONT_BOLD).fontSize(18).text('Payslip', left, y, { lineBreak: false })

  y += 32
  drawLabelValue(doc, 'Pay Period:', data.periodLabel, left, y, 80)

  y += 26
  const colGap = pageWidth / 2 + 10
  const leftRows: Array<[string, string]> = [
    ['Employee Name:', data.employeeName],
    ['Designation:', data.designation ?? '-'],
    ['CNIC:', data.cnicNumber ?? '-'],
  ]
  const rightRows: Array<[string, string]> = [
    ['Department:', data.department ?? '-'],
    ['Employee Status:', data.employmentStatus ?? '-'],
    ['Account Number:', data.accountNumber ?? '-'],
  ]
  leftRows.forEach(([label, value], i) => drawLabelValue(doc, label, value, left, y + i * 14, 80))
  rightRows.forEach(([label, value], i) => drawLabelValue(doc, label, value, left + colGap, y + i * 14, 84))

  return y + leftRows.length * 14 + 22
}

function drawTables(doc: Doc, data: PayslipData, left: number, y: number, pageWidth: number): number {
  const tableWidth = (pageWidth - TABLE_GAP) / 2
  const earnings = earningsRows(data.earnings)
  const deductions = deductionRows(data.deductions)
  const rowCount = Math.max(earnings.length, deductions.length)
  const boxHeight = (rowCount + 3) * ROW_HEIGHT // title + column header + rows + total

  drawAmountTable(
    doc,
    {
      title: 'EARNINGS',
      rows: earnings,
      total: { label: 'Total Earnings', value: data.earnings.totalEarnings },
      boxHeight,
    },
    left,
    y,
    tableWidth,
  )
  const bottom = drawAmountTable(
    doc,
    {
      title: 'DEDUCTIONS',
      rows: deductions,
      total: { label: 'Total Deductions', value: data.deductions.totalDeductions },
      boxHeight,
    },
    left + tableWidth + TABLE_GAP,
    y,
    tableWidth,
  )

  const netRows: TableRowSpec[] = [{ label: 'Net Payable Amount', value: data.net.netSalary, bold: true }]
  const withBalance =
    data.net.balance !== 0
      ? [
          ...netRows,
          { label: 'Paid', value: data.net.paid },
          { label: 'Balance', value: data.net.balance, bold: true },
        ]
      : netRows

  return drawBoxedRows(doc, withBalance, left, bottom + 12, tableWidth)
}

function drawFooter(doc: Doc, left: number, afterTablesY: number, pageWidth: number) {
  // The stamp, signature and contact line are anchored to the page bottom so
  // extra table rows (other earnings, balance) can never push them onto a
  // second page. The note flows between the tables and the stamp.
  const pageBottom = doc.page.height - PAGE_MARGIN
  const contactY = pageBottom - 12
  const lineY = contactY - 30
  const signatureWidth = 150
  const signatureY = lineY - 86
  const stampWidth = 170
  const stampY = signatureY - 84
  const stampX = left + pageWidth - stampWidth
  const noteY = Math.min(afterTablesY, stampY - 48)

  doc.font(FONT_BOLD_ITALIC).fontSize(8.5).fillColor('black')
  doc.text('NOTE: ', left, noteY, { continued: true })
  doc.font(FONT_ITALIC).text(CONFIDENTIALITY_NOTE, { width: pageWidth * 0.9 })

  doc.image(payslipStampBuffer(), stampX, stampY, { width: stampWidth })
  doc.image(payslipSignatureBuffer(), left + pageWidth - signatureWidth - 10, signatureY, { width: signatureWidth })

  doc.save()
  doc.moveTo(stampX, lineY).lineTo(left + pageWidth, lineY).lineWidth(0.75).strokeColor('black').stroke()
  doc.restore()
  doc.font(FONT_BOLD).fontSize(9)
  doc.text('Accountant', stampX, lineY + 4, { width: stampWidth, align: 'center', lineBreak: false })

  doc.font(FONT_BOLD).fontSize(9)
  doc.text(`t: ${COMPANY_PHONE}, e: ${COMPANY_EMAIL}`, left, contactY, {
    width: pageWidth,
    align: 'center',
    lineBreak: false,
  })
}

/* ---------- Public API ---------- */

export async function generatePayslipPdf(data: PayslipData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE_MARGIN,
        info: {
          Title: `Payslip - ${data.employeeName} - ${data.periodLabel}`,
          Author: 'Apollo Ventures',
          Subject: 'Employee Pay Slip',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const left = doc.page.margins.left
      const pageWidth = doc.page.width - doc.page.margins.right - left

      const afterHeader = drawHeader(doc, data, left, pageWidth)
      const afterTables = drawTables(doc, data, left, afterHeader, pageWidth)
      drawFooter(doc, left, afterTables + 28, pageWidth)

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
