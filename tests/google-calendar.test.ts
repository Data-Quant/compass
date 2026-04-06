import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLeaveEventPayload,
  buildTeamInviteEmailSet,
  shouldIncludeExecutiveLeaveInviteForPosition,
} from '../lib/google-calendar'

test('executive leave invite rule includes principals, managers, and junior partners', () => {
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Principal'), true)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Software Engineering Manager'), true)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Junior Partner'), true)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('JP'), true)
})

test('executive leave invite rule excludes non-managerial positions', () => {
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Associate'), false)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Senior Associate'), false)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Analyst'), false)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition(null), false)
})

test('half-day leave event payload uses the leave request timezone', () => {
  const payload = buildLeaveEventPayload({
    leaveRequest: {
      id: 'leave-1',
      employeeId: 'user-1',
      leaveType: 'CASUAL',
      isHalfDay: true,
      halfDaySession: 'FIRST_HALF',
      requestTimezone: 'America/New_York',
      unavailableStartTime: '09:00',
      unavailableEndTime: '13:00',
      startDate: new Date('2026-04-10T00:00:00.000Z'),
      endDate: new Date('2026-04-10T00:00:00.000Z'),
      status: 'APPROVED',
      reason: 'Medical appointment',
      transitionPlan: 'Covered by teammate',
      employee: {
        name: 'Faizan Jabbar',
        department: 'Technology',
      },
    } as any,
    attendeeEmails: ['ammar@plutus21.com'],
  })

  assert.deepEqual(payload.start, {
    dateTime: '2026-04-10T09:00:00',
    timeZone: 'America/New_York',
  })
  assert.deepEqual(payload.end, {
    dateTime: '2026-04-10T13:00:00',
    timeZone: 'America/New_York',
  })
})

test('half-day leave event payload falls back to default timezone when request timezone is invalid', () => {
  const payload = buildLeaveEventPayload({
    leaveRequest: {
      id: 'leave-2',
      employeeId: 'user-2',
      leaveType: 'SICK',
      isHalfDay: true,
      halfDaySession: 'SECOND_HALF',
      requestTimezone: 'Mars/Olympus_Mons',
      unavailableStartTime: '14:00',
      unavailableEndTime: '18:00',
      startDate: new Date('2026-04-11T00:00:00.000Z'),
      endDate: new Date('2026-04-11T00:00:00.000Z'),
      status: 'APPROVED',
      reason: 'Doctor visit',
      transitionPlan: '',
      employee: {
        name: 'Naseer Ahmed',
        department: 'Technology',
      },
    } as any,
    attendeeEmails: [],
  })

  assert.deepEqual(payload.start, {
    dateTime: '2026-04-11T14:00:00',
    timeZone: 'Asia/Karachi',
  })
  assert.deepEqual(payload.end, {
    dateTime: '2026-04-11T18:00:00',
    timeZone: 'Asia/Karachi',
  })
})

test('team leave invite helper includes upstream leads, direct reports, and peers from canonical mappings', () => {
  const emails = buildTeamInviteEmailSet({
    employeeId: 'ammar',
    leadMappings: [
      {
        evaluator: { email: 'hamiz@plutus21.com' },
      },
    ],
    directReportMappings: [
      {
        evaluatee: { email: 'haider@plutus21.com' },
      },
      {
        evaluatee: { email: 'anees@plutus21.com' },
      },
    ],
    peerMappings: [
      {
        evaluatorId: 'ammar',
        evaluateeId: 'satish',
        evaluator: { email: 'ammar@plutus21.com' },
        evaluatee: { email: 'satish@plutus21.com' },
      },
      {
        evaluatorId: 'eman',
        evaluateeId: 'ammar',
        evaluator: { email: 'eman@plutus21.com' },
        evaluatee: { email: 'ammar@plutus21.com' },
      },
    ],
  })

  assert.deepEqual(
    [...emails].sort(),
    [
      'anees@plutus21.com',
      'eman@plutus21.com',
      'haider@plutus21.com',
      'hamiz@plutus21.com',
      'satish@plutus21.com',
    ]
  )
})
