import { prisma } from '@/lib/db'
import type { AttendanceStatus, Prisma, TransportMode } from '@prisma/client'

export const SYSTEM_SALARY_HEADS = [
  {
    code: 'BASIC_SALARY',
    name: 'Basic Salary',
    type: 'EARNING',
    isTaxable: true,
    isSystem: true,
  },
  {
    code: 'MEDICAL_ALLOWANCE',
    name: 'Medical Allowance',
    type: 'EARNING',
    isTaxable: false,
    isSystem: true,
  },
  {
    code: 'MOBILE_REIMBURSEMENT',
    name: 'Mobile Allowance',
    type: 'EARNING',
    isTaxable: false,
    isSystem: true,
  },
] as const

export const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Contract', 'Intern', 'Other']

export const DEFAULT_TRAVEL_TIERS: Array<{
  transportMode: TransportMode
  minKm: number
  maxKm: number | null
  monthlyRate: number
}> = [
  { transportMode: 'BIKE', minKm: 0, maxKm: 5, monthlyRate: 7500 },
  { transportMode: 'BIKE', minKm: 6, maxKm: 10, monthlyRate: 12000 },
  { transportMode: 'BIKE', minKm: 11, maxKm: 20, monthlyRate: 18000 },
  { transportMode: 'BIKE', minKm: 21, maxKm: 25, monthlyRate: 21000 },
  { transportMode: 'BIKE', minKm: 26, maxKm: 30, monthlyRate: 24000 },
  { transportMode: 'BIKE', minKm: 31, maxKm: 40, monthlyRate: 32000 },
  { transportMode: 'CAR', minKm: 0, maxKm: 5, monthlyRate: 11500 },
  { transportMode: 'CAR', minKm: 6, maxKm: 10, monthlyRate: 18500 },
  { transportMode: 'CAR', minKm: 11, maxKm: 20, monthlyRate: 24000 },
  { transportMode: 'CAR', minKm: 21, maxKm: 25, monthlyRate: 27000 },
  { transportMode: 'CAR', minKm: 26, maxKm: 30, monthlyRate: 30000 },
  { transportMode: 'CAR', minKm: 31, maxKm: 40, monthlyRate: 40000 },
  { transportMode: 'PUBLIC_TRANSPORT', minKm: 0, maxKm: 5, monthlyRate: 11500 },
  { transportMode: 'PUBLIC_TRANSPORT', minKm: 6, maxKm: 10, monthlyRate: 18500 },
  { transportMode: 'PUBLIC_TRANSPORT', minKm: 11, maxKm: 20, monthlyRate: 24000 },
  { transportMode: 'PUBLIC_TRANSPORT', minKm: 21, maxKm: 25, monthlyRate: 27000 },
  { transportMode: 'PUBLIC_TRANSPORT', minKm: 26, maxKm: 30, monthlyRate: 30000 },
  { transportMode: 'PUBLIC_TRANSPORT', minKm: 31, maxKm: 40, monthlyRate: 40000 },
]

export const DEFAULT_FY_2025_2026 = {
  label: 'FY 2025-2026',
  startDate: new Date(Date.UTC(2025, 6, 1)),
  endDate: new Date(Date.UTC(2026, 5, 30, 23, 59, 59, 999)),
  brackets: [
    { incomeFrom: 0, incomeTo: 600000, fixedTax: 0, taxRate: 0, orderIndex: 1 },
    { incomeFrom: 600000, incomeTo: 1200000, fixedTax: 0, taxRate: 0.01, orderIndex: 2 },
    { incomeFrom: 1200000, incomeTo: 2200000, fixedTax: 6000, taxRate: 0.11, orderIndex: 3 },
    { incomeFrom: 2200000, incomeTo: 3200000, fixedTax: 116000, taxRate: 0.23, orderIndex: 4 },
    { incomeFrom: 3200000, incomeTo: 4100000, fixedTax: 346000, taxRate: 0.3, orderIndex: 5 },
    { incomeFrom: 4100000, incomeTo: null, fixedTax: 616000, taxRate: 0.35, orderIndex: 6 },
  ],
}

function normalizeDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

export async function ensurePayrollMasterDefaults() {
  await prisma.$transaction(async (tx) => {
    for (const typeName of DEFAULT_EMPLOYMENT_TYPES) {
      await tx.payrollEmploymentType.upsert({
        where: { name: typeName },
        update: { isActive: true },
        create: { name: typeName, isActive: true },
      })
    }

    for (const head of SYSTEM_SALARY_HEADS) {
      await tx.payrollSalaryHead.upsert({
        where: { code: head.code },
        update: {
          name: head.name,
          type: head.type,
          isTaxable: head.isTaxable,
          isSystem: head.isSystem,
          isActive: true,
        },
        create: {
          code: head.code,
          name: head.name,
          type: head.type,
          isTaxable: head.isTaxable,
          isSystem: head.isSystem,
          isActive: true,
        },
      })
    }

    const fy = await tx.payrollFinancialYear.findUnique({
      where: { label: DEFAULT_FY_2025_2026.label },
      select: { id: true },
    })

    const financialYear = fy
      ? await tx.payrollFinancialYear.update({
          where: { id: fy.id },
          data: {
            startDate: DEFAULT_FY_2025_2026.startDate,
            endDate: DEFAULT_FY_2025_2026.endDate,
          },
        })
      : await tx.payrollFinancialYear.create({
          data: {
            label: DEFAULT_FY_2025_2026.label,
            startDate: DEFAULT_FY_2025_2026.startDate,
            endDate: DEFAULT_FY_2025_2026.endDate,
            isActive: true,
          },
        })

    const existingBrackets = await tx.payrollTaxBracket.count({
      where: { financialYearId: financialYear.id },
    })
    if (existingBrackets === 0) {
      await tx.payrollTaxBracket.createMany({
        data: DEFAULT_FY_2025_2026.brackets.map((bracket) => ({
          financialYearId: financialYear.id,
          incomeFrom: bracket.incomeFrom,
          incomeTo: bracket.incomeTo,
          fixedTax: bracket.fixedTax,
          taxRate: bracket.taxRate,
          orderIndex: bracket.orderIndex,
        })),
      })
    }

    const tiersCount = await tx.payrollTravelAllowanceTier.count()
    if (tiersCount === 0) {
      const now = new Date()
      await tx.payrollTravelAllowanceTier.createMany({
        data: DEFAULT_TRAVEL_TIERS.map((tier) => ({
          transportMode: tier.transportMode,
          minKm: tier.minKm,
          maxKm: tier.maxKm,
          monthlyRate: tier.monthlyRate,
          effectiveFrom: now,
          effectiveTo: null,
          isActive: true,
        })),
      })
    }
  })
}

export async function getActiveFinancialYearForDate(date: Date) {
  return prisma.payrollFinancialYear.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
    },
    include: {
      taxBrackets: {
        orderBy: { orderIndex: 'asc' },
      },
    },
    orderBy: { isActive: 'desc' },
  })
}

export function calculateAnnualProgressiveTax(
  annualIncome: number,
  brackets: Array<{ incomeFrom: number; incomeTo: number | null; fixedTax: number; taxRate: number }>
): number {
  const taxable = Math.max(0, annualIncome)
  const bracket =
    brackets.find((b) => taxable >= b.incomeFrom && (b.incomeTo === null || taxable < b.incomeTo)) ||
    brackets[brackets.length - 1]

  if (!bracket) return 0
  return Math.max(0, bracket.fixedTax + Math.max(0, taxable - bracket.incomeFrom) * bracket.taxRate)
}

export async function estimateConfiguredMonthlyTax(date: Date, monthlyTaxableIncome: number): Promise<number | null> {
  const financialYear = await getActiveFinancialYearForDate(date)
  if (!financialYear || financialYear.taxBrackets.length === 0) return null

  const annual = calculateAnnualProgressiveTax(monthlyTaxableIncome * 12, financialYear.taxBrackets)
  return annual / 12
}

export function resolveTravelTier(
  tiers: Array<{
    transportMode: TransportMode
    minKm: number
    maxKm: number | null
    monthlyRate: number
    effectiveFrom: Date
    effectiveTo: Date | null
    isActive: boolean
  }>,
  transportMode: TransportMode | null | undefined,
  distanceKm: number | null | undefined,
  onDate: Date
) {
  if (!transportMode || distanceKm === null || distanceKm === undefined) return null
  const targetDate = normalizeDate(onDate).getTime()
  const tier = tiers.find((row) => {
    if (!row.isActive) return false
    if (row.transportMode !== transportMode) return false
    const starts = normalizeDate(row.effectiveFrom).getTime() <= targetDate
    const ends = row.effectiveTo ? normalizeDate(row.effectiveTo).getTime() >= targetDate : true
    const inRange = distanceKm >= row.minKm && (row.maxKm === null || distanceKm <= row.maxKm)
    return starts && ends && inRange
  })
  return tier || null
}

export function eachDayBetween(start: Date, end: Date): Date[] {
  const out: Date[] = []
  let current = normalizeDate(start)
  const max = normalizeDate(end)

  while (current.getTime() <= max.getTime()) {
    out.push(current)
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1))
  }
  return out
}

export function calculateWorkingDays(params: {
  periodStart: Date
  periodEnd: Date
  holidays: Date[]
  weekendDays?: number[]
}): number {
  const weekendDays = params.weekendDays || [0, 6] // Sun + Sat
  const holidaySet = new Set(params.holidays.map((d) => normalizeDate(d).toISOString()))
  const days = eachDayBetween(params.periodStart, params.periodEnd)
  return days.filter((day) => {
    if (weekendDays.includes(day.getUTCDay())) return false
    if (holidaySet.has(normalizeDate(day).toISOString())) return false
    return true
  }).length
}

export function calculatePresentDays(
  attendanceEntries: Array<{ attendanceDate: Date; status: AttendanceStatus }>,
  periodStart: Date,
  periodEnd: Date
): number {
  const start = normalizeDate(periodStart).getTime()
  const end = normalizeDate(periodEnd).getTime()
  return attendanceEntries.filter((entry) => {
    const date = normalizeDate(entry.attendanceDate).getTime()
    return date >= start && date <= end && entry.status === 'PRESENT'
  }).length
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}
