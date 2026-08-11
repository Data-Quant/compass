import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTransitionTasks,
  canSubmitTransitionPlan,
  classifyTransitionReminder,
  classifyTransitionPlanAction,
  daysUntil,
  qualifiesForTransitionPlanDeadline,
  transitionPlanDeadline,
} from '../lib/leave-transition-plan'

const now = new Date('2026-07-06T09:00:00.000Z')

// 2026-07-06 is a Monday, so 07-11/07-12 is the weekend and 07-13 the next Monday.
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

test('validateTransitionTasks drops empty rows and coerces flags', () => {
  const out = validateTransitionTasks([
    {
      taskDetails: 'Hand over X',
      assignedTo: 'Sara',
      accepted: true,
      deadline: '2026-07-10',
      completed: false,
      variance: '',
      links: '',
    },
    { taskDetails: '   ', assignedTo: 'nobody' },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].taskDetails, 'Hand over X')
  assert.equal(out[0].accepted, true)
  assert.equal(out[0].completed, false)
  assert.equal(out[0].projectDept, '')
  assert.equal(out[0].deadline, '2026-07-10')
})

test('validateTransitionTasks rejects more than 50 rows', () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ taskDetails: `t${i}` }))
  assert.throws(() => validateTransitionTasks(rows))
})

test('validateTransitionTasks handles null/undefined input', () => {
  assert.deepEqual(validateTransitionTasks(null), [])
  assert.deepEqual(validateTransitionTasks(undefined), [])
})

test('canSubmitTransitionPlan requires at least one real task', () => {
  assert.equal(canSubmitTransitionPlan([]), false)
  assert.equal(canSubmitTransitionPlan(validateTransitionTasks([{ taskDetails: 'x' }])), true)
})

test('daysUntil is date-only whole days', () => {
  assert.equal(daysUntil(new Date('2026-07-09T23:00:00.000Z'), now), 3)
  assert.equal(daysUntil(new Date('2026-07-06T01:00:00.000Z'), now), 0)
})

test('classify: reminds inside window, not before', () => {
  const start = new Date('2026-07-10T00:00:00.000Z') // 4 days out
  assert.deepEqual(
    classifyTransitionReminder({ startDate: start, submitted: false, alreadyEscalated: false, now }),
    { remind: true, escalate: false, daysUntilStart: 4 },
  )
  const far = new Date('2026-07-20T00:00:00.000Z') // 14 days out
  assert.equal(
    classifyTransitionReminder({ startDate: far, submitted: false, alreadyEscalated: false, now }).remind,
    false,
  )
})

test('classify: escalates at/after the 3-day deadline, once', () => {
  const start = new Date('2026-07-09T00:00:00.000Z') // 3 days out = deadline
  assert.equal(
    classifyTransitionReminder({ startDate: start, submitted: false, alreadyEscalated: false, now }).escalate,
    true,
  )
  assert.equal(
    classifyTransitionReminder({ startDate: start, submitted: false, alreadyEscalated: true, now }).escalate,
    false,
  )
})

test('classify: submitted plans never remind or escalate', () => {
  const start = new Date('2026-07-08T00:00:00.000Z')
  assert.deepEqual(
    classifyTransitionReminder({ startDate: start, submitted: true, alreadyEscalated: false, now }),
    { remind: false, escalate: false, daysUntilStart: 2 },
  )
})

// --- Transition-plan deadline ladder (leaves longer than 2 working days) ---

test('qualifies: more than 2 *working* days, so a weekend does not inflate a short leave', () => {
  // Mon-Wed = 3 working days.
  assert.equal(
    qualifiesForTransitionPlanDeadline({ startDate: d('2026-07-13'), endDate: d('2026-07-15'), isHalfDay: false }),
    true,
  )
  // Mon-Tue = 2 working days.
  assert.equal(
    qualifiesForTransitionPlanDeadline({ startDate: d('2026-07-13'), endDate: d('2026-07-14'), isHalfDay: false }),
    false,
  )
  // Fri-Mon spans 4 calendar days but only 2 working ones, so it must NOT qualify.
  assert.equal(
    qualifiesForTransitionPlanDeadline({ startDate: d('2026-07-10'), endDate: d('2026-07-13'), isHalfDay: false }),
    false,
  )
  // Thu-Mon = Thu, Fri, Mon = 3 working days.
  assert.equal(
    qualifiesForTransitionPlanDeadline({ startDate: d('2026-07-09'), endDate: d('2026-07-13'), isHalfDay: false }),
    true,
  )
})

test('qualifies: half-days never qualify', () => {
  assert.equal(
    qualifiesForTransitionPlanDeadline({ startDate: d('2026-07-13'), endDate: d('2026-07-13'), isHalfDay: true }),
    false,
  )
})

test('deadline: full notice gives the whole 2-day window', () => {
  assert.deepEqual(
    transitionPlanDeadline({ noticeDate: d('2026-07-06'), startDate: d('2026-07-13') }),
    d('2026-07-08'),
  )
})

test('deadline: a late booking compresses, never past the day before the leave', () => {
  // Booked 3 days out: notice+2 and start-1 coincide.
  assert.deepEqual(
    transitionPlanDeadline({ noticeDate: d('2026-07-06'), startDate: d('2026-07-09') }),
    d('2026-07-08'),
  )
  // Booked 2 days out: clamped to start-1, a one-day window.
  assert.deepEqual(
    transitionPlanDeadline({ noticeDate: d('2026-07-06'), startDate: d('2026-07-08') }),
    d('2026-07-07'),
  )
})

test('deadline: a zero or negative window yields no deadline at all', () => {
  // Starts tomorrow — start-1 is the notice day itself, so there is no window.
  assert.equal(transitionPlanDeadline({ noticeDate: d('2026-07-06'), startDate: d('2026-07-07') }), null)
  // Starts today.
  assert.equal(transitionPlanDeadline({ noticeDate: d('2026-07-06'), startDate: d('2026-07-06') }), null)
})

const noNotice = { submitted: false, noticeSentAt: null, finalWarningSentAt: null }

test('classify action: notice fires at 7 days out, not before', () => {
  assert.equal(
    classifyTransitionPlanAction({ startDate: d('2026-07-26'), ...noNotice, now }).action,
    'none',
  )
  assert.equal(
    classifyTransitionPlanAction({ startDate: d('2026-07-13'), ...noNotice, now }).action,
    'notice',
  )
})

test('classify action: a late booking still gets its notice immediately', () => {
  assert.equal(
    classifyTransitionPlanAction({ startDate: d('2026-07-10'), ...noNotice, now }).action,
    'notice',
  )
})

test('classify action: warning the day before the deadline, cancel on it', () => {
  const base = { startDate: d('2026-07-13'), submitted: false, noticeSentAt: d('2026-07-06') }
  // Notice day itself: nothing further yet.
  assert.equal(
    classifyTransitionPlanAction({ ...base, finalWarningSentAt: null, now: d('2026-07-06') }).action,
    'none',
  )
  assert.equal(
    classifyTransitionPlanAction({ ...base, finalWarningSentAt: null, now: d('2026-07-07') }).action,
    'final_warning',
  )
  assert.equal(
    classifyTransitionPlanAction({ ...base, finalWarningSentAt: d('2026-07-07'), now: d('2026-07-08') }).action,
    'cancel',
  )
})

test('classify action: cancellation does not wait on a warning that never sent', () => {
  // A failed warning send must not block the deadline, or one SMTP error grants
  // an indefinite extension.
  assert.equal(
    classifyTransitionPlanAction({
      startDate: d('2026-07-13'),
      submitted: false,
      noticeSentAt: d('2026-07-06'),
      finalWarningSentAt: null,
      now: d('2026-07-08'),
    }).action,
    'cancel',
  )
})

test('classify action: a one-day window skips the separate warning', () => {
  const base = { startDate: d('2026-07-08'), submitted: false, noticeSentAt: d('2026-07-06'), finalWarningSentAt: null }
  assert.equal(classifyTransitionPlanAction({ ...base, now: d('2026-07-06') }).action, 'none')
  assert.equal(classifyTransitionPlanAction({ ...base, now: d('2026-07-07') }).action, 'cancel')
})

test('classify action: no window means it is never auto-cancelled', () => {
  assert.equal(
    classifyTransitionPlanAction({
      startDate: d('2026-07-07'),
      submitted: false,
      noticeSentAt: d('2026-07-06'),
      finalWarningSentAt: null,
      now: d('2026-07-07'),
    }).action,
    'none',
  )
})

test('classify action: a submitted plan silences every rung', () => {
  assert.equal(
    classifyTransitionPlanAction({
      startDate: d('2026-07-13'),
      submitted: true,
      noticeSentAt: d('2026-07-06'),
      finalWarningSentAt: null,
      now: d('2026-07-08'),
    }).action,
    'none',
  )
})

test('classify action: a leave that already started is never cancelled', () => {
  assert.equal(
    classifyTransitionPlanAction({
      startDate: d('2026-07-13'),
      submitted: false,
      noticeSentAt: d('2026-07-06'),
      finalWarningSentAt: null,
      now: d('2026-07-14'),
    }).action,
    'none',
  )
})
