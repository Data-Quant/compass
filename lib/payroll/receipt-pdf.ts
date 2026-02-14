/**
 * PDF receipt generator for payroll payment receipts.
 *
 * Generates a traditional-style receipt matching the Excel workbook format,
 * suitable for HelloSign (Dropbox Sign) signature requests.
 *
 * Uses PDFKit for server-side PDF generation.
 */

import PDFDocument from 'pdfkit'

/* ---------- Types ---------- */

export interface ReceiptData {
  employeeName: string
  cnicNumber?: string
  periodLabel: string
  earnings: {
    basicSalary: number
    medicalTaxExemption: number
    bonus: number
    medicalAllowance: number
    travelReimbursement: number
    utilityReimbursement: number
    mealsReimbursement: number
    mobileReimbursement: number
    expenseReimbursement: number
    advanceLoan: number
    totalEarnings: number
  }
  deductions: {
    incomeTax: number
    adjustment: number
    loanRepayment: number
    totalDeductions: number
  }
  net: {
    netSalary: number
    paid: number
    balance: number
  }
  company?: {
    name?: string
    phone?: string
    email?: string
  }
}

/* ---------- Helpers ---------- */

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function money(v: number): string {
  const abs = Math.abs(v)
  const formatted = abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v < 0) return `(${formatted})`
  return formatted
}

/* ---------- PDF Generator ---------- */

export async function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 60,
        info: {
          Title: `Payment Receipt - ${data.employeeName} - ${data.periodLabel}`,
          Author: data.company?.name || 'Apollo Ventures',
          Subject: 'Employee Payment Receipt',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
      const leftMargin = doc.page.margins.left
      const rightEdge = doc.page.width - doc.page.margins.right

      /* ---- Header ---- */
      doc.fontSize(14).font('Helvetica-Bold')
      doc.text('Employee Payment Receipt', leftMargin, 60, { align: 'center', width: pageWidth })

      doc.fontSize(11).font('Helvetica')
      doc.text(data.employeeName, leftMargin, 82, { align: 'center', width: pageWidth })

      if (data.cnicNumber) {
        doc.fontSize(10)
        doc.text(data.cnicNumber, leftMargin, 96, { align: 'center', width: pageWidth })
      }

      const periodY = data.cnicNumber ? 118 : 104
      doc.fontSize(10).font('Helvetica')
      doc.text(data.periodLabel, rightEdge - 100, periodY, { width: 100, align: 'right' })

      /* ---- Table dimensions ---- */
      const tableLeft = leftMargin
      const tableWidth = pageWidth
      const labelColWidth = tableWidth - 120
      const amountColWidth = 120
      const amountRight = tableLeft + tableWidth
      const rowHeight = 20

      let y = periodY + 30

      /* ---- Earnings section header ---- */
      y = drawSectionHeader(doc, 'EARNINGS:', tableLeft, y, tableWidth, rowHeight)

      /* ---- Earnings rows ---- */
      y = drawRow(doc, 'Basic Salary', money(data.earnings.basicSalary), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Tax exemption on medical (10%)', money(data.earnings.medicalTaxExemption), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Bonus', money(data.earnings.bonus), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)

      // Total Taxable Salary (bold)
      const totalTaxable = num(data.earnings.basicSalary) + num(data.earnings.medicalTaxExemption) + num(data.earnings.bonus)
      y = drawRow(doc, 'Total Taxable Salary', money(totalTaxable), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight, true)

      y = drawRow(doc, 'Medical Allowance', money(data.earnings.medicalAllowance), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Travel Reimbursement', money(data.earnings.travelReimbursement), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Mobile Internet Reimbursement', money(data.earnings.mobileReimbursement), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Reimbursements (Personal / Office Purchases)', money(data.earnings.expenseReimbursement), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Advance Salary (Loan)', money(data.earnings.advanceLoan), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Total Earnings', money(data.earnings.totalEarnings), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight, true)

      y += 8

      /* ---- Deductions section header ---- */
      y = drawSectionHeader(doc, 'DEDUCTIONS:', tableLeft, y, tableWidth, rowHeight)

      y = drawRow(doc, 'Income Tax', money(data.deductions.incomeTax), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Adjustment (+Refund/-Deduction)', money(data.deductions.adjustment), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Loan Repayments', money(data.deductions.loanRepayment), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Total Deductions', money(data.deductions.totalDeductions), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight, true)

      y += 8

      /* ---- Net section ---- */
      y = drawRow(doc, 'Net Salary', money(data.net.netSalary), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight, true, true)
      y = drawRow(doc, 'Paid', money(data.net.paid), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight)
      y = drawRow(doc, 'Balance', money(data.net.balance), tableLeft, y, labelColWidth, amountColWidth, amountRight, rowHeight, false, true)

      /* ---- Signature lines ---- */
      y += 50

      const sigLineWidth = 200
      doc.fontSize(10).font('Helvetica')

      // Accountant
      doc.moveTo(tableLeft, y).lineTo(tableLeft + sigLineWidth, y).stroke()
      doc.font('Helvetica-Bold').text('Accountant', tableLeft, y + 4)

      y += 50

      // Employee
      doc.moveTo(tableLeft, y).lineTo(tableLeft + sigLineWidth, y).stroke()
      doc.font('Helvetica-Bold').text('Employee', tableLeft, y + 4)

      y += 50

      // HR Representative
      doc.moveTo(tableLeft, y).lineTo(tableLeft + sigLineWidth, y).stroke()
      doc.font('Helvetica-Bold').text('HR Representative', tableLeft, y + 4)

      /* ---- Company footer ---- */
      y += 50
      const companyName = data.company?.name || 'Apollo Ventures'
      const companyPhone = data.company?.phone || '+92 321 2918609'
      const companyEmail = data.company?.email || 'apolloventurespk@gmail.com'

      doc.font('Helvetica-Bold').fontSize(10)
      doc.text(companyName, leftMargin, y, { align: 'center', width: pageWidth })
      doc.font('Helvetica').fontSize(9)
      doc.text(`t: ${companyPhone}, e: ${companyEmail}`, leftMargin, y + 14, { align: 'center', width: pageWidth })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/* ---------- Drawing helpers ---------- */

function drawSectionHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  // Dark background header
  doc.save()
  doc.rect(x, y, width * 0.35, height).fill('#1a1a2e')
  doc.restore()

  doc.font('Helvetica-Bold').fontSize(9).fillColor('white')
  doc.text(title, x + 4, y + 5, { width: width * 0.35 - 8 })
  doc.fillColor('black')

  return y + height
}

function drawRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  labelWidth: number,
  amountWidth: number,
  amountRight: number,
  height: number,
  bold?: boolean,
  bordered?: boolean,
): number {
  const font = bold ? 'Helvetica-Bold' : 'Helvetica'

  if (bordered) {
    doc.save()
    doc.rect(x, y, labelWidth + amountWidth, height).lineWidth(0.5).stroke('#333333')
    doc.restore()
  }

  doc.font(font).fontSize(9).fillColor('black')
  doc.text(label, x + 4, y + 5, { width: labelWidth - 8 })
  doc.text(value, amountRight - amountWidth + 4, y + 5, {
    width: amountWidth - 8,
    align: 'right',
  })

  if (!bordered) {
    // Light bottom border
    doc.save()
    doc.moveTo(x, y + height).lineTo(amountRight, y + height).lineWidth(0.25).strokeColor('#cccccc').stroke()
    doc.restore()
  }

  return y + height
}
