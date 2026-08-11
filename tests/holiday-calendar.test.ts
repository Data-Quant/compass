import test from 'node:test'
import assert from 'node:assert/strict'
import type { TeamTag } from '@prisma/client'
import { buildHolidayEventPayload } from '../lib/holiday-calendar'

const eid = {
  id: 'hol_eid',
  name: 'Eid-ul-Adha',
  holidayDate: new Date('2026-05-27T00:00:00.000Z'),
  teamTags: ['PAKISTAN', 'THREE_E_PAKISTAN'] as TeamTag[],
}

const legacy = {
  id: 'hol_newyear',
  name: "New Year's Day",
  holidayDate: new Date('2026-01-01T00:00:00.000Z'),
  teamTags: [] as TeamTag[],
}

test('holiday event is all-day with Google exclusive end date', () => {
  const payload = buildHolidayEventPayload({ holiday: eid, attendeeEmails: [] })

  // A single-day holiday ends the *next* day: Google treats the end of an all-day
  // event as exclusive, so 05-27 would otherwise render as a zero-length event.
  assert.deepEqual(payload.start, { date: '2026-05-27' })
  assert.deepEqual(payload.end, { date: '2026-05-28' })
})

test('holiday event carries the holidayId used to find it again', () => {
  const payload = buildHolidayEventPayload({ holiday: eid, attendeeEmails: [] })
  assert.equal(payload.extendedProperties.private.holidayId, 'hol_eid')
})

test('a company-wide invite does not expose its guest list', () => {
  // These invites go to entire teams at once. Without this, every recipient sees
  // everyone else's address and can invite others onto a company holiday.
  const payload = buildHolidayEventPayload({
    holiday: eid,
    attendeeEmails: ['a@plutus21.com', 'b@plutus21.com'],
  })
  assert.equal(payload.guestsCanSeeOtherGuests, false)
  assert.equal(payload.guestsCanInviteOthers, false)
  assert.deepEqual(payload.attendees, [{ email: 'a@plutus21.com' }, { email: 'b@plutus21.com' }])
})

test('an empty attendee list omits the attendees field entirely', () => {
  const payload = buildHolidayEventPayload({ holiday: eid, attendeeEmails: [] })
  assert.equal('attendees' in payload, false)
})

test('the description names the teams that actually observe the holiday', () => {
  const payload = buildHolidayEventPayload({ holiday: eid, attendeeEmails: [] })
  assert.match(payload.description, /Pakistan Team/)
  assert.match(payload.description, /3E Pakistan Team/)
  assert.doesNotMatch(payload.description, /Morocco/)
})

test('an untagged holiday reads as company-wide, not as a list of every team', () => {
  // Empty teamTags means "predates tagging, applies to everyone" -- see lib/holidays.ts.
  const payload = buildHolidayEventPayload({ holiday: legacy, attendeeEmails: [] })
  assert.match(payload.description, /All teams/)
  assert.equal(payload.summary, "Public Holiday — New Year's Day")
})

test('the holiday blocks the day rather than showing as free', () => {
  const payload = buildHolidayEventPayload({ holiday: eid, attendeeEmails: [] })
  assert.equal(payload.transparency, 'opaque')
})
