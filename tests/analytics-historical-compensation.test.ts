import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHistoricalCompensationEventMarkers,
  buildHistoricalCompensationSeries,
  classifyCompensationRevision,
} from '../lib/analytics/historical-compensation'

const receipt = (args: {
  id: string
  date: string
  currency?: string
  basicSalary: number
  bonus?: number
}) => ({
  id: args.id,
  periodId: `period-${args.id}`,
  periodName: args.date.slice(0, 7),
  effectiveFrom: args.date,
  currency: args.currency ?? 'PKR',
  receiptJson: {
    earnings: {
      basicSalary: args.basicSalary,
      bonus: args.bonus ?? 0,
    },
  },
})

test('builds base-pay and bonus history from payroll receipts', () => {
  const result = buildHistoricalCompensationSeries({
    receipts: [
      receipt({ id: 'jan', date: '2026-01-01', basicSalary: 100_000 }),
      receipt({ id: 'feb', date: '2026-02-01', basicSalary: 120_000, bonus: 10_000 }),
    ],
  })

  assert.deepEqual(result.currencies, ['PKR'])
  assert.deepEqual(
    result.points.map((point) => [point.baseSalary, point.bonus, point.totalCash]),
    [
      [100_000, 0, 100_000],
      [120_000, 10_000, 130_000],
    ]
  )
  assert.deepEqual(result.events.map((event) => event.type), [
    'PAY_INCREASE',
    'BONUS_INCREASE',
  ])
  assert.equal(result.events[0].title, 'Pay bump')
  assert.equal(result.events[0].delta, 20_000)
})

test('does not compare amounts across currencies', () => {
  const result = buildHistoricalCompensationSeries({
    receipts: [
      receipt({ id: 'pkr', date: '2026-01-01', currency: 'PKR', basicSalary: 100_000 }),
      receipt({ id: 'usd', date: '2026-02-01', currency: 'USD', basicSalary: 2_000 }),
    ],
  })

  assert.deepEqual(result.currencies, ['PKR', 'USD'])
  assert.equal(result.events.length, 0)
})

test('promotion and role events require explicit revision notes', () => {
  assert.equal(classifyCompensationRevision('Promoted to Engineering Lead'), 'PROMOTION')
  assert.equal(classifyCompensationRevision('Designation changed to Senior Analyst'), 'ROLE_CHANGE')
  assert.equal(classifyCompensationRevision('Annual adjustment'), 'COMPENSATION_REVISION')
})

test('adds explicit promotion markers at their revised base salary', () => {
  const result = buildHistoricalCompensationSeries({
    receipts: [receipt({ id: 'jan', date: '2026-01-01', basicSalary: 100_000 })],
    revisions: [
      {
        id: 'revision-1',
        effectiveFrom: '2026-01-15',
        note: 'Promotion to Team Lead',
        lines: [
          { componentKey: 'BASIC_SALARY', componentName: 'Basic salary', amount: 125_000 },
        ],
      },
    ],
  })

  const event = result.events[0]
  assert.equal(event.type, 'PROMOTION')
  assert.equal(event.source, 'SALARY_REVISION')
  assert.equal(event.anchorAmount, 125_000)
  assert.equal(event.detail, 'Promotion to Team Lead')
})

test('ignores malformed receipts rather than inventing zero salary points', () => {
  const result = buildHistoricalCompensationSeries({
    receipts: [
      {
        id: 'bad',
        periodId: 'period-bad',
        periodName: 'Bad',
        effectiveFrom: 'not-a-date',
        currency: 'PKR',
        receiptJson: { earnings: { basicSalary: 'unknown' } },
      },
    ],
  })

  assert.deepEqual(result.points, [])
  assert.deepEqual(result.events, [])
})

test('event markers cover the full history and group overlapping events on the employee line', () => {
  const january = '2024-01-01T00:00:00.000Z'
  const december = '2024-12-01T00:00:00.000Z'
  const event = (id: string, effectiveFrom: string, title: string, currency = 'PKR') => ({
    id,
    effectiveFrom,
    type: 'PAY_INCREASE' as const,
    title,
    detail: null,
    currency,
    previousAmount: 100_000,
    amount: 120_000,
    delta: 20_000,
    anchorAmount: 120_000,
    source: 'PAYROLL' as const,
  })

  const markers = buildHistoricalCompensationEventMarkers([
    {
      id: 'employee-1',
      name: 'Employee One',
      events: [
        event('first', january, 'First event'),
        event('overlap', january, 'Overlapping event'),
        event('last', december, 'Last event'),
        event('other-currency', december, 'USD event', 'USD'),
      ],
    },
  ], 'PKR')

  assert.equal(markers.length, 2)
  assert.deepEqual(markers[0].events.map((entry) => entry.id), ['first', 'overlap'])
  assert.equal(markers[1].events[0].id, 'last')
  assert.equal(markers[0].anchorAmount, 120_000)
})
