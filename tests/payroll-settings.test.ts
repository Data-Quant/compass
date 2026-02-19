import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateAnnualProgressiveTax, calculateWorkingDays, resolveTravelTier } from '../lib/payroll/settings'

test('calculateAnnualProgressiveTax applies bracket fixed + variable logic', () => {
  const tax = calculateAnnualProgressiveTax(2_500_000, [
    { incomeFrom: 0, incomeTo: 600_000, fixedTax: 0, taxRate: 0 },
    { incomeFrom: 600_000, incomeTo: 1_200_000, fixedTax: 0, taxRate: 0.01 },
    { incomeFrom: 1_200_000, incomeTo: 2_200_000, fixedTax: 6_000, taxRate: 0.11 },
    { incomeFrom: 2_200_000, incomeTo: 3_200_000, fixedTax: 116_000, taxRate: 0.23 },
  ])

  // 116,000 + (2,500,000 - 2,200,000)*23%
  assert.equal(tax, 185000)
})

test('calculateWorkingDays excludes weekends and holidays', () => {
  const days = calculateWorkingDays({
    periodStart: new Date(Date.UTC(2026, 1, 1)),
    periodEnd: new Date(Date.UTC(2026, 1, 28)),
    holidays: [new Date(Date.UTC(2026, 1, 5)), new Date(Date.UTC(2026, 1, 19))],
    weekendDays: [0, 6],
  })

  // Feb 2026 has 20 weekdays; two holidays => 18.
  assert.equal(days, 18)
})

test('resolveTravelTier selects matching mode and distance range', () => {
  const tier = resolveTravelTier(
    [
      {
        transportMode: 'BIKE',
        minKm: 0,
        maxKm: 5,
        monthlyRate: 7500,
        effectiveFrom: new Date(Date.UTC(2025, 0, 1)),
        effectiveTo: null,
        isActive: true,
      },
      {
        transportMode: 'BIKE',
        minKm: 6,
        maxKm: 10,
        monthlyRate: 12000,
        effectiveFrom: new Date(Date.UTC(2025, 0, 1)),
        effectiveTo: null,
        isActive: true,
      },
    ],
    'BIKE',
    7,
    new Date(Date.UTC(2026, 1, 1))
  )

  assert.equal(tier?.monthlyRate, 12000)
})

