import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../lib/security-checks/dates'
import { cycleDatesFor, cycleLengthError, openAtForCycle } from '../lib/security-checks/recurrence'
import { deadlineReminderKey, planReminder, returnReminderKey, type ReminderState } from '../lib/security-checks/reminders'
import { planNewJoiner } from '../lib/security-checks/enrollment'

const OPEN = new Date('2026-11-01T04:00:00Z')

test('cycle deadline is end of the Karachi day deadlineDays after open; scheduled close is +7', () => {
  const dates = cycleDatesFor(OPEN, 14)
  assert.equal(dates.deadline.toISOString(), '2026-11-15T18:59:59.999Z')
  assert.equal(dates.scheduledCloseAt.toISOString(), '2026-11-22T18:59:59.999Z')
})

test('fixed anchor opens cycles one interval apart from the first open date', () => {
  const base = { frequency: 'EVERY_4_MONTHS', anchor: 'FIXED_CALENDAR', firstOpenAt: OPEN, previousScheduledCloseAt: null } as const
  assert.equal(openAtForCycle({ ...base, cycleNumber: 1 })?.toISOString(), OPEN.toISOString())
  assert.equal(openAtForCycle({ ...base, cycleNumber: 2 })?.toISOString(), '2027-03-01T04:00:00.000Z')
  assert.equal(openAtForCycle({ ...base, cycleNumber: 4 })?.toISOString(), '2027-11-01T04:00:00.000Z')
})

test('relative anchor opens one interval after the previous scheduled close; one-time has no second cycle', () => {
  const previousClose = new Date('2026-11-22T18:59:59.999Z')
  const next = openAtForCycle({
    frequency: 'QUARTERLY',
    anchor: 'RELATIVE_TO_CLOSE',
    firstOpenAt: OPEN,
    cycleNumber: 2,
    previousScheduledCloseAt: previousClose,
  })
  assert.equal(next?.toISOString(), '2027-02-22T18:59:59.999Z')
  assert.equal(
    openAtForCycle({ frequency: 'ONE_TIME', anchor: 'FIXED_CALENDAR', firstOpenAt: OPEN, cycleNumber: 2, previousScheduledCloseAt: previousClose }),
    null,
  )
})

test('a deadline too long for the frequency is refused (no overlapping cycles)', () => {
  assert.equal(cycleLengthError('QUARTERLY', 'FIXED_CALENDAR', 30), null)
  assert.match(cycleLengthError('QUARTERLY', 'FIXED_CALENDAR', 85) ?? '', /too long/)
  assert.equal(cycleLengthError('ONE_TIME', 'FIXED_CALENDAR', 365), null)
})

const D = new Date('2026-11-30T18:59:59.999Z')
const reminderState = (overrides: Partial<ReminderState> = {}): ReminderState => ({
  status: 'NOT_STARTED',
  deadline: D,
  startedAt: new Date('2026-11-01T04:00:00Z'),
  offsets: [14, 7, 1],
  lastVerdictAt: null,
  resubmitDueAt: null,
  sentKeys: new Set(),
  ...overrides,
})

test('deadline reminders fire at 14/7/1 days before D, once each', () => {
  assert.equal(planReminder(reminderState(), addDays(D, -15)).send, null)
  const first = planReminder(reminderState(), addDays(D, -14))
  assert.equal(first.send?.key, deadlineReminderKey(14))
  const again = planReminder(reminderState({ sentKeys: new Set([deadlineReminderKey(14)]) }), addDays(D, -13))
  assert.equal(again.send, null)
})

test('missed runs send only the most urgent reminder and mark the stale ones', () => {
  const plan = planReminder(reminderState(), addDays(D, -0.5))
  assert.equal(plan.send?.key, deadlineReminderKey(1))
  assert.deepEqual([...plan.markSent].sort(), [deadlineReminderKey(1), deadlineReminderKey(14), deadlineReminderKey(7)].sort())
})

test('offsets before the task start are skipped; an extension does not repeat sent offsets', () => {
  const late = reminderState({ startedAt: addDays(D, -10) })
  assert.equal(planReminder(late, addDays(D, -9.9)).send, null)
  assert.equal(planReminder(late, addDays(D, -7)).send?.key, deadlineReminderKey(7))
  const extended = reminderState({ deadline: addDays(D, 10), sentKeys: new Set([deadlineReminderKey(14), deadlineReminderKey(7)]) })
  assert.equal(planReminder(extended, addDays(D, 3)).send, null)
  assert.equal(planReminder(extended, addDays(D, 9)).send?.key, deadlineReminderKey(1))
})

test('reminders stop on submission and at final/exempt statuses', () => {
  for (const status of ['PENDING_REVIEW', 'VERIFIED', 'EXEMPT', 'EXPIRED', 'CANCELLED'] as const) {
    assert.equal(planReminder(reminderState({ status }), addDays(D, -1)).send, null, status)
  }
})

test('after a return verdict with a verdict+7 window, a day-5 reminder fires once', () => {
  const verdictAt = addDays(D, 2)
  const state = reminderState({ status: 'REJECTED', lastVerdictAt: verdictAt, resubmitDueAt: addDays(verdictAt, 7) })
  assert.equal(planReminder(state, addDays(verdictAt, 4)).send, null)
  assert.equal(planReminder(state, addDays(verdictAt, 5)).send?.key, returnReminderKey(verdictAt))
  assert.equal(planReminder({ ...state, sentKeys: new Set([returnReminderKey(verdictAt)]) }, addDays(verdictAt, 6)).send, null)
})

test('after an early return verdict (window = D), remaining deadline offsets resume', () => {
  const verdictAt = addDays(D, -20)
  const state = reminderState({ status: 'REQUIRES_INFO', lastVerdictAt: verdictAt, resubmitDueAt: D, sentKeys: new Set([deadlineReminderKey(14)]) })
  assert.equal(planReminder(state, addDays(D, -7)).send?.key, deadlineReminderKey(7))
})

test('new joiner gets a fresh deadline capped at scheduled close', () => {
  const cycle = { deadline: new Date('2026-11-15T18:59:59.999Z'), scheduledCloseAt: new Date('2026-11-22T18:59:59.999Z') }
  const early = planNewJoiner(cycle, 'QUARTERLY', 5, new Date('2026-11-03T04:00:00Z'))
  assert.deepEqual(early, { action: 'ENROLL', deadline: new Date('2026-11-08T18:59:59.999Z'), lateEnrollment: true })
  const capped = planNewJoiner(cycle, 'QUARTERLY', 14, new Date('2026-11-12T04:00:00Z'))
  assert.equal(capped.action === 'ENROLL' && capped.deadline.toISOString(), cycle.scheduledCloseAt.toISOString())
})

test('new joiner with <7 days left goes to the next cycle (recurring) or gets 14 days (one-time)', () => {
  const cycle = { deadline: new Date('2026-11-15T18:59:59.999Z'), scheduledCloseAt: new Date('2026-11-22T18:59:59.999Z') }
  const now = new Date('2026-11-18T04:00:00Z')
  assert.deepEqual(planNewJoiner(cycle, 'ANNUALLY', 14, now), { action: 'NEXT_CYCLE' })
  assert.deepEqual(planNewJoiner(cycle, 'ONE_TIME', 14, now), {
    action: 'ENROLL',
    deadline: new Date('2026-12-02T18:59:59.999Z'),
    lateEnrollment: true,
  })
})
