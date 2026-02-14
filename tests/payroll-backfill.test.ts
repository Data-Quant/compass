import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRosterAliasMap, selectLatestPeriodKeys } from '../lib/payroll/backfill'

test('selectLatestPeriodKeys returns most recent N keys in ascending order', () => {
  const keys = ['03/2025', '01/2025', '02/2025', '12/2024', '04/2025']
  const latest = selectLatestPeriodKeys(keys, 3)
  assert.deepEqual(latest, ['02/2025', '03/2025', '04/2025'])
})

test('buildRosterAliasMap maps workbook names to real employee names in order', () => {
  const aliases = buildRosterAliasMap(
    ['Dummy A', 'Dummy B', 'Dummy C'],
    [
      { id: 'u2', name: 'Basit' },
      { id: 'u1', name: 'Aliya' },
    ]
  )

  const a = aliases.get('dummy a')
  const b = aliases.get('dummy b')
  const c = aliases.get('dummy c')

  assert.equal(a?.payrollName, 'Aliya')
  assert.equal(a?.userId, 'u1')
  assert.equal(b?.payrollName, 'Basit')
  assert.equal(b?.userId, 'u2')
  assert.equal(c?.payrollName, 'Aliya')
  assert.equal(c?.userId, 'u1')
})
