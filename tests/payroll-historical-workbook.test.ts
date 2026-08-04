import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { parsePayrollWorkbook } from '../lib/payroll/workbook-parser'

async function buildHistoricalWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheets: Array<[string, number]> = [
    ['Basic Salary', 100_000],
    ['Mobile', 5_000],
    ['Travel', 10_000],
    ['Internal Bonus', 7_500],
    ['Client Bonus', 2_500],
  ]

  for (const [sheetName, amount] of sheets) {
    const sheet = workbook.addWorksheet(sheetName)
    sheet.getCell('A1').value = 'Employee Names'
    sheet.getCell('B1').value = new Date(Date.UTC(2024, 6, 1))
    sheet.getCell('A2').value = 'Areebah Example'
    sheet.getCell('B2').value = amount
    sheet.getCell('A3').value = 'Total'
    sheet.getCell('B3').value = amount
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test('historical payroll layout is parsed from column A and supplemental bonuses are summed', async () => {
  const parsed = await parsePayrollWorkbook(await buildHistoricalWorkbook())

  assert.deepEqual(parsed.periodKeys, ['07/2024'])
  assert.deepEqual(parsed.payrollNames, ['Areebah Example'])

  const byComponent = new Map(parsed.inputValues.map((value) => [value.componentKey, value]))
  assert.equal(byComponent.get('BASIC_SALARY')?.amount, 100_000)
  assert.equal(byComponent.get('MOBILE_REIMBURSEMENT')?.amount, 5_000)
  assert.equal(byComponent.get('TRAVEL_REIMBURSEMENT')?.amount, 10_000)
  assert.equal(byComponent.get('BONUS')?.amount, 10_000)
  assert.equal(byComponent.get('BONUS')?.sourceSheet, 'Internal Bonus + Client Bonus')
  assert.equal(parsed.inputValues.some((value) => value.payrollName === 'Total'), false)
})
