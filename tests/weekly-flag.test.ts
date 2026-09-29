import test from 'node:test'
import assert from 'node:assert/strict'
import { areWeeklyEmailsEnabled, areWeeklyTestToolsEnabled, isWeeklyEnabled } from '../lib/weekly/flag'

test('the module is on only when WEEKLY_EVALUATIONS_ENABLED is exactly true', () => {
  assert.equal(isWeeklyEnabled({ WEEKLY_EVALUATIONS_ENABLED: 'true' }), true)
  assert.equal(isWeeklyEnabled({ WEEKLY_EVALUATIONS_ENABLED: '1' }), false)
  assert.equal(isWeeklyEnabled({}), false)
})

test('test tools need the module and their own flag', () => {
  assert.equal(areWeeklyTestToolsEnabled({ WEEKLY_EVALUATIONS_ENABLED: 'true', WEEKLY_TEST_TOOLS: 'true' }), true)
  assert.equal(areWeeklyTestToolsEnabled({ WEEKLY_TEST_TOOLS: 'true' }), false)
})

test('emails are sent only when WEEKLY_SEND_EMAILS is exactly true', () => {
  assert.equal(areWeeklyEmailsEnabled({ WEEKLY_SEND_EMAILS: 'true' }), true)
  assert.equal(areWeeklyEmailsEnabled({ WEEKLY_SEND_EMAILS: 'TRUE' }), false)
  assert.equal(areWeeklyEmailsEnabled({}), false)
})
