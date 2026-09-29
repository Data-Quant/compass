import test from 'node:test'
import assert from 'node:assert/strict'
import { isKpiEnabled } from '../lib/kpi/flag'

test('the KPI module is enabled only by the exact string "true"', () => {
  assert.equal(isKpiEnabled({ KPI_ENABLED: 'true' }), true)
  for (const value of [undefined, '', 'TRUE', '1', 'yes']) {
    assert.equal(isKpiEnabled({ KPI_ENABLED: value }), false, String(value))
  }
})
