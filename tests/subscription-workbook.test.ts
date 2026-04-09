import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { parseSubscriptionWorkbook } from '../lib/subscriptions-workbook'

test('parseSubscriptionWorkbook imports only canonical active and canceled sheets', async () => {
  const workbook = new ExcelJS.Workbook()

  const activeSheet = workbook.addWorksheet('Details')
  activeSheet.addRow([
    'Service',
    'Team',
    'Users (email addresses)',
    'Payment Method',
    'Purpose',
    'Cost',
    'Subscription Type (Monthly/Yearly)',
    'Person In Charge',
    'Billed To (Company or Client)',
    'Renewal Date',
    'Notice Period to Cancel',
    'Status',
  ])
  activeSheet.addRow([
    'Claude',
    'Execution',
    'noha@plutus21.com',
    'Corporate Card',
    'AI research and writing',
    '$120/mo',
    'Monthly',
    'Richard/Noha',
    'Company',
    'EOM',
    '30 days',
    'Active',
  ])

  const canceledSheet = workbook.addWorksheet('Canceled Subscriptions')
  canceledSheet.addRow([
    '',
    'Service',
    'Team',
    'Users (email addresses)',
    'Last Payment Made on',
    'Payment Method',
    'Purpose',
    'Cost',
    'Subscription Type (Monthly/Yearly)',
    'Person In Charge',
    'Billed To (Company or Client)',
    'Renewal Date',
  ])
  canceledSheet.addRow([
    '',
    'HubSpot Legacy',
    'Growth',
    'sales@plutus21.com',
    '2026-03-01',
    'Card',
    'Legacy CRM',
    '$400/mo',
    'Monthly',
    'Daniyal',
    'Company',
    'Monthly',
  ])

  const ignoredSheet = workbook.addWorksheet('All Subscriptions')
  ignoredSheet.addRow(['Service'])
  ignoredSheet.addRow(['Should Be Ignored'])

  const buffer = await workbook.xlsx.writeBuffer()
  const rows = await parseSubscriptionWorkbook(buffer as ArrayBuffer)

  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map((row) => ({ name: row.name, status: row.status, sourceSheet: row.sourceSheet })),
    [
      { name: 'Claude', status: 'ACTIVE', sourceSheet: 'Details' },
      { name: 'HubSpot Legacy', status: 'CANCELED', sourceSheet: 'Canceled Subscriptions' },
    ]
  )
  assert.equal(rows[0].personInChargeText, 'Richard/Noha')
  assert.equal(rows[0].noticePeriodText, '30 days')
  assert.equal(rows[1].lastPaymentText, '2026-03-01')
  assert.equal(rows[1].noticePeriodText, null)
})

test('parseSubscriptionWorkbook preserves non-active workbook status as a note', async () => {
  const workbook = new ExcelJS.Workbook()

  const activeSheet = workbook.addWorksheet('Details')
  activeSheet.addRow([
    'Service',
    'Team',
    'Users (email addresses)',
    'Payment Method',
    'Purpose',
    'Cost',
    'Subscription Type (Monthly/Yearly)',
    'Person In Charge',
    'Billed To (Company or Client)',
    'Renewal Date',
    'Notice Period to Cancel',
    'Status',
  ])
  activeSheet.addRow([
    'OpenAI',
    'Execution',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'Pending cancellation',
  ])

  const canceledSheet = workbook.addWorksheet('Canceled Subscriptions')
  canceledSheet.addRow([
    '',
    'Service',
    'Team',
    'Users (email addresses)',
    'Last Payment Made on',
    'Payment Method',
    'Purpose',
    'Cost',
    'Subscription Type (Monthly/Yearly)',
    'Person In Charge',
    'Billed To (Company or Client)',
    'Renewal Date',
  ])

  const buffer = await workbook.xlsx.writeBuffer()
  const rows = await parseSubscriptionWorkbook(buffer as ArrayBuffer)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'ACTIVE')
  assert.equal(rows[0].notes, 'Workbook status: Pending cancellation')
})
