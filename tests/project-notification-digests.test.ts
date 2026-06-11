import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateNextProjectNotificationDigestAt,
  isValidProjectNotificationTime,
} from '../lib/project-notification-digests'

test('project notification time validation accepts only HH:mm values', () => {
  assert.equal(isValidProjectNotificationTime('00:00'), true)
  assert.equal(isValidProjectNotificationTime('09:30'), true)
  assert.equal(isValidProjectNotificationTime('23:59'), true)
  assert.equal(isValidProjectNotificationTime('24:00'), false)
  assert.equal(isValidProjectNotificationTime('9:30'), false)
  assert.equal(isValidProjectNotificationTime('12:60'), false)
})

test('daily project digest schedules today when the selected time has not passed in Karachi', () => {
  const next = calculateNextProjectNotificationDigestAt({
    digestFrequency: 'DAILY',
    digestTime: '09:00',
    from: new Date('2026-06-11T03:30:00.000Z'), // 08:30 Asia/Karachi
  })

  assert.equal(next.toISOString(), '2026-06-11T04:00:00.000Z')
})

test('daily project digest schedules tomorrow when the selected time already passed in Karachi', () => {
  const next = calculateNextProjectNotificationDigestAt({
    digestFrequency: 'DAILY',
    digestTime: '09:00',
    from: new Date('2026-06-11T05:00:00.000Z'), // 10:00 Asia/Karachi
  })

  assert.equal(next.toISOString(), '2026-06-12T04:00:00.000Z')
})

test('weekly project digest schedules same weekday if still upcoming, otherwise next week', () => {
  const sameDay = calculateNextProjectNotificationDigestAt({
    digestFrequency: 'WEEKLY',
    digestTime: '09:00',
    digestWeekday: 4, // Thursday
    from: new Date('2026-06-11T03:30:00.000Z'), // Thursday 08:30 Asia/Karachi
  })
  const nextWeek = calculateNextProjectNotificationDigestAt({
    digestFrequency: 'WEEKLY',
    digestTime: '09:00',
    digestWeekday: 4,
    from: new Date('2026-06-11T05:00:00.000Z'), // Thursday 10:00 Asia/Karachi
  })

  assert.equal(sameDay.toISOString(), '2026-06-11T04:00:00.000Z')
  assert.equal(nextWeek.toISOString(), '2026-06-18T04:00:00.000Z')
})
