import { prisma } from '@/lib/db'
import { estimateIncomeTaxFromSlabs, FIX_IDS, FORMULA_VERSION } from '@/lib/payroll/formula-registry'
import { PayrollReconciliationMismatch } from '@/lib/payroll/reconciliation'
import { toPeriodKey, normalizePayrollName } from '@/lib/payroll/normalizers'
import { calculateAnnualProgressiveTax, calculatePresentDays, calculateWorkingDays, resolveTravelTier } from '@/lib/payroll/settings'
import { PAYABLE_EARNING_KEYS, computeCarriedBalance, type PaymentCategory } from '@/lib/payroll/payments'
import type { Prisma } from '@prisma/client'

export type InputBucket = Record<string, number>

function bucketInputs(rows: Array<{ componentKey: string; amount: number }>): InputBucket {
  const bucket: InputBucket = {}
  for (const row of rows) {
    bucket[row.componentKey] = (bucket[row.componentKey] || 0) + row.amount
  }
  return bucket
}

function getNumber(bucket: InputBucket, key: string): number {
  const value = bucket[key]
  return Number.isFinite(value) ? value : 0
}

const KNOWN_EARNING_KEYS = new Set([
  'BASIC_SALARY',
  'MEDICAL_TAX_EXEMPTION',
  'BONUS',
  'MEDICAL_ALLOWANCE',
  'TRAVEL_REIMBURSEMENT',
  'UTILITY_REIMBURSEMENT',
  'MEALS_REIMBURSEMENT',
  'MOBILE_REIMBURSEMENT',
  'EXPENSE_REIMBURSEMENT',
  'ADVANCE_LOAN',
])

// PAID stays in the deduction-key set so any lingering historical PAID input is
// never summed as a deduction. The engine no longer writes it (Auto-Paid removed).
const KNOWN_DEDUCTION_KEYS = new Set(['INCOME_TAX', 'ADJUSTMENT', 'LOAN_REPAYMENT', 'PAID'])

export interface SalaryHeadLite {
  type: string
  isTaxable: boolean
}

export interface EarningsBreakdown {
  additionalEarnings: number
  additionalTaxableEarnings: number
  additionalNonTaxableEarnings: number
}

export function computeEarningsBreakdown(
  bucket: InputBucket,
  salaryHeadByCode: Map<string, SalaryHeadLite>
): EarningsBreakdown {
  let additionalEarnings = 0
  let additionalTaxableEarnings = 0
  for (const [componentKey, amount] of Object.entries(bucket)) {
    const code = componentKey.toUpperCase()
    // Known engine keys (BASIC_SALARY, MEDICAL_ALLOWANCE, ...) are already handled
    // explicitly in the calculation; only custom salary heads count as "additional".
    if (KNOWN_EARNING_KEYS.has(code)) continue
    const head = salaryHeadByCode.get(code)
    if (!head || head.type !== 'EARNING') continue
    additionalEarnings += amount
    if (head.isTaxable) additionalTaxableEarnings += amount
  }
  return {
    additionalEarnings,
    additionalTaxableEarnings,
    additionalNonTaxableEarnings: additionalEarnings - additionalTaxableEarnings,
  }
}

// FBR rule: medical allowance is tax-exempt up to 10% of basic salary, so the
// payroll structure carves exactly 10% of basic out as the medical allowance.
export const MEDICAL_ALLOWANCE_RATE = 0.1

export function computeAutoMedicalAllowance(basicSalary: number): number {
  return Number((Math.max(0, basicSalary) * MEDICAL_ALLOWANCE_RATE).toFixed(2))
}

// Travel allowance is prorated by attendance: the monthly tier rate is paid in
// proportion to days present out of the period's working days.
export function computeTravelPayable(monthlyRate: number, presentDays: number, workingDays: number): number {
  if (workingDays <= 0) return 0
  const clampedPresent = Math.min(Math.max(0, presentDays), workingDays)
  return Number(Math.max(0, (monthlyRate * clampedPresent) / workingDays).toFixed(2))
}

// A user can be deleted after a period is calculated, leaving carried-forward
// inputs pointing at a userId that no longer exists. PayrollReceipt.userId has a
// foreign key, so writing one would abort the whole calculation — coerce unknown
// userIds to null instead.
export function resolveValidUserId(
  userId: string | null | undefined,
  validUserIds: Set<string>
): string | null {
  return userId && validUserIds.has(userId) ? userId : null
}

export type TravelSkipReason =
  | 'UNMAPPED_EMPLOYEE'
  | 'MISSING_TRANSPORT_PROFILE'
  | 'NO_TIER_MATCH'

export interface TravelSkip {
  payrollName: string
  reason: TravelSkipReason
}

export interface RecalculateResult {
  periodId: string
  periodKey: string
  payrollCount: number
  computedCount: number
  mismatchCount: number
  mismatches: PayrollReconciliationMismatch[]
  travelSkips: TravelSkip[]
  appliedFixes: string[]
}

export async function recalculatePayrollPeriod(periodId: string, tolerance = 1): Promise<RecalculateResult> {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      status: true,
    },
  })

  if (!period) {
    throw new Error('Payroll period not found')
  }

  const periodKey = toPeriodKey(period.periodStart)
  const [inputs, activeFinancialYear, salaryHeads, holidays, travelTiers, payments] = await Promise.all([
    prisma.payrollInputValue.findMany({
      where: { periodId },
      orderBy: [{ payrollName: 'asc' }, { componentKey: 'asc' }],
    }),
    prisma.payrollFinancialYear.findFirst({
      where: {
        startDate: { lte: period.periodStart },
        endDate: { gte: period.periodStart },
      },
      include: {
        taxBrackets: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { isActive: 'desc' },
    }),
    prisma.payrollSalaryHead.findMany({
      where: { isActive: true },
      select: {
        code: true,
        type: true,
        isTaxable: true,
      },
    }),
    prisma.payrollPublicHoliday.findMany({
      where: {
        holidayDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
      select: { holidayDate: true },
    }),
    prisma.payrollTravelAllowanceTier.findMany({
      where: {
        isActive: true,
        effectiveFrom: { lte: period.periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.periodStart } }],
      },
      orderBy: [{ transportMode: 'asc' }, { minKm: 'asc' }],
    }),
    prisma.payrollPayment.findMany({
      where: { periodId },
      select: { payrollName: true, componentKey: true, paidAmount: true },
    }),
  ])

  const previousPeriod = await prisma.payrollPeriod.findFirst({
    where: { periodStart: { lt: period.periodStart } },
    orderBy: { periodStart: 'desc' },
    select: { id: true },
  })

  const previousBalances = previousPeriod
    ? await prisma.payrollComputedValue.findMany({
        where: { periodId: previousPeriod.id, metricKey: 'BALANCE' },
        select: { payrollName: true, amount: true },
      })
    : []

  const previousBalanceMap = new Map(previousBalances.map((b) => [b.payrollName, b.amount]))

  // Paid amounts recorded in the Payments step, per employee per category.
  const paidByPayroll = new Map<string, Map<string, number>>()
  for (const p of payments) {
    const inner = paidByPayroll.get(p.payrollName) ?? new Map<string, number>()
    inner.set(p.componentKey, p.paidAmount)
    paidByPayroll.set(p.payrollName, inner)
  }

  const rowsByPayroll = new Map<string, typeof inputs>()
  for (const row of inputs) {
    const existing = rowsByPayroll.get(row.payrollName) || []
    existing.push(row)
    rowsByPayroll.set(row.payrollName, existing)
  }

  const payrollNames = [...rowsByPayroll.keys()]
  const normalizedByPayroll = new Map(payrollNames.map((name) => [name, normalizePayrollName(name)]))
  const normalizedNames = [...new Set([...normalizedByPayroll.values()])]

  const identityMappings = await prisma.payrollIdentityMapping.findMany({
    where: { normalizedPayrollName: { in: normalizedNames } },
    select: { normalizedPayrollName: true, userId: true },
  })
  const userIdByNormalized = new Map(identityMappings.map((row) => [row.normalizedPayrollName, row.userId]))

  const userIds = new Set<string>()
  for (const [payrollName, rows] of rowsByPayroll.entries()) {
    const rowUserId = rows.find((r) => Boolean(r.userId))?.userId || null
    const mappedUserId = rowUserId || userIdByNormalized.get(normalizedByPayroll.get(payrollName) || '') || null
    if (mappedUserId) userIds.add(mappedUserId)
  }

  const [profiles, attendanceEntries, salaryRevisions, existingUsers] = await Promise.all([
    prisma.payrollEmployeeProfile.findMany({
      where: { userId: { in: [...userIds] } },
      select: {
        id: true,
        userId: true,
        distanceKm: true,
        transportMode: true,
      },
    }),
    prisma.payrollAttendanceEntry.findMany({
      where: {
        periodId,
        userId: { in: [...userIds] },
      },
      select: {
        userId: true,
        attendanceDate: true,
        status: true,
      },
    }),
    prisma.payrollSalaryRevision.findMany({
      where: {
        employeeProfile: {
          userId: {
            in: [...userIds],
          },
        },
        effectiveFrom: {
          lte: period.periodStart,
        },
      },
      orderBy: [{ employeeProfileId: 'asc' }, { effectiveFrom: 'desc' }],
      include: {
        employeeProfile: {
          select: { userId: true },
        },
        lines: {
          include: {
            salaryHead: {
              select: { code: true },
            },
          },
        },
      },
    }),
    // A user can be deleted after a period is calculated, leaving dangling
    // userIds on carried-forward inputs. Track which ones still exist so we
    // never write a receipt FK that references a missing user.
    prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true },
    }),
  ])

  const validUserIds = new Set(existingUsers.map((u) => u.id))
  const profileByUserId = new Map(profiles.map((row) => [row.userId, row]))
  const latestRevisionByUserId = new Map<string, (typeof salaryRevisions)[number]>()
  for (const revision of salaryRevisions) {
    const key = revision.employeeProfile.userId
    if (!latestRevisionByUserId.has(key)) {
      latestRevisionByUserId.set(key, revision)
    }
  }
  const attendanceByUserId = new Map<string, typeof attendanceEntries>()
  for (const entry of attendanceEntries) {
    const list = attendanceByUserId.get(entry.userId) || []
    list.push(entry)
    attendanceByUserId.set(entry.userId, list)
  }

  const salaryHeadByCode = new Map(
    salaryHeads.map((head) => [head.code.toUpperCase(), head] as const)
  )
  const workingDays = calculateWorkingDays({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    holidays: holidays.map((h) => h.holidayDate),
  })
  const autoInputUpserts: Array<{
    periodId: string
    payrollName: string
    userId: string | null
    componentKey: string
    amount: number
    generatedBy: string
  }> = []
  const travelSkips: TravelSkip[] = []

  const mismatches: PayrollReconciliationMismatch[] = []
  const computedInserts: Array<{
    periodId: string
    payrollName: string
    userId: string | null
    metricKey: string
    amount: number
    formulaKey: string
    formulaVersion: string
    lineageJson: Prisma.InputJsonValue
  }> = []
  const receiptUpserts: Array<{
    periodId: string
    payrollName: string
    userId: string | null
    receiptJson: Prisma.InputJsonValue
    status: 'READY'
    version: number
  }> = []

  for (const [payrollName, rows] of rowsByPayroll.entries()) {
    const bucket = bucketInputs(rows)
    const normalized = normalizedByPayroll.get(payrollName) || normalizePayrollName(payrollName)
    const resolvedUserId = rows.find((r) => r.userId)?.userId || userIdByNormalized.get(normalized) || null
    // Drop userIds that no longer reference an existing user so receipts/computed
    // rows are written with null rather than a dangling foreign key.
    const userId = resolveValidUserId(resolvedUserId, validUserIds)

    if (userId) {
      const revision = latestRevisionByUserId.get(userId)
      if (revision) {
        for (const line of revision.lines) {
          const code = line.salaryHead.code.toUpperCase()
          const hasManualOverride = rows.some(
            (row) => row.componentKey.toUpperCase() === code && row.isOverride
          )
          if (!hasManualOverride && bucket[code] === undefined) {
            bucket[code] = line.amount
          }
        }
      }
    }

    const { additionalEarnings, additionalTaxableEarnings, additionalNonTaxableEarnings } =
      computeEarningsBreakdown(bucket, salaryHeadByCode)

    const additionalDeductions = Object.entries(bucket).reduce((sum, [componentKey, amount]) => {
      const code = componentKey.toUpperCase()
      if (KNOWN_DEDUCTION_KEYS.has(code)) return sum
      const head = salaryHeadByCode.get(code)
      if (!head || head.type !== 'DEDUCTION') return sum
      return sum + amount
    }, 0)

    const basicSalary = getNumber(bucket, 'BASIC_SALARY')

    // Auto-carve 10% of basic salary as the medical allowance unless the cell
    // was manually overridden. A salary-revision value is also replaced: the
    // 10% structure is uniform, and only grid overrides opt out of it.
    const medicalOverride = rows.some((r) => r.componentKey === 'MEDICAL_ALLOWANCE' && r.isOverride)
    if (!medicalOverride && basicSalary > 0) {
      bucket.MEDICAL_ALLOWANCE = computeAutoMedicalAllowance(basicSalary)
      autoInputUpserts.push({
        periodId,
        payrollName,
        userId,
        componentKey: 'MEDICAL_ALLOWANCE',
        amount: bucket.MEDICAL_ALLOWANCE,
        generatedBy: 'AUTO_MEDICAL_10PCT',
      })
    }
    const medicalAllowance = getNumber(bucket, 'MEDICAL_ALLOWANCE')
    // FBR rule: medical allowance is tax-exempt up to 10% of basic salary.
    // Stored as a negative value because it offsets taxable income.
    const medicalTaxExemption =
      bucket.MEDICAL_TAX_EXEMPTION !== undefined
        ? getNumber(bucket, 'MEDICAL_TAX_EXEMPTION')
        : -Math.min(medicalAllowance, basicSalary * 0.1)
    const bonus = getNumber(bucket, 'BONUS')

    // Bonus is non-taxable — excluded from taxable salary and tax base.
    const totalTaxableSalary = basicSalary + medicalTaxExemption + additionalTaxableEarnings
    const incomeTax = (() => {
      if (bucket.INCOME_TAX !== undefined) return getNumber(bucket, 'INCOME_TAX')
      const monthlyTaxBase = Math.max(0, totalTaxableSalary)
      if (activeFinancialYear && activeFinancialYear.taxBrackets.length > 0) {
        const annual = calculateAnnualProgressiveTax(monthlyTaxBase * 12, activeFinancialYear.taxBrackets)
        return annual / 12
      }
      return estimateIncomeTaxFromSlabs(periodKey, monthlyTaxBase)
    })()

    const travelOverride = rows.find((r) => r.componentKey === 'TRAVEL_REIMBURSEMENT' && r.isOverride)
    let travelReimbursement = getNumber(bucket, 'TRAVEL_REIMBURSEMENT')
    if (!travelOverride) {
      const profile = userId ? profileByUserId.get(userId) : undefined
      if (!userId) {
        travelSkips.push({ payrollName, reason: 'UNMAPPED_EMPLOYEE' })
      } else if (!profile || !profile.transportMode || profile.distanceKm === null || profile.distanceKm === undefined) {
        travelSkips.push({ payrollName, reason: 'MISSING_TRANSPORT_PROFILE' })
      } else {
        // Resolve against period end so tiers that become effective mid-period still apply.
        const tier = resolveTravelTier(travelTiers, profile.transportMode, profile.distanceKm, period.periodEnd)
        if (!tier) {
          travelSkips.push({ payrollName, reason: 'NO_TIER_MATCH' })
        } else if (workingDays > 0) {
          // Unmarked attendance is treated exactly like absence: present days come
          // straight from marked PRESENT entries (0 when nothing is marked), so
          // travel prorates down to 0 instead of paying a full month. The value is
          // always persisted, overwriting any stale auto-written amount.
          const userAttendance = attendanceByUserId.get(userId) || []
          const presentDays = calculatePresentDays(userAttendance, period.periodStart, period.periodEnd, {
            holidays: holidays.map((h) => h.holidayDate),
          })
          travelReimbursement = computeTravelPayable(tier.monthlyRate, presentDays, workingDays)
          autoInputUpserts.push({
            periodId,
            payrollName,
            userId,
            componentKey: 'TRAVEL_REIMBURSEMENT',
            amount: travelReimbursement,
            generatedBy: 'ATTENDANCE_TRAVEL',
          })
        }
      }
    }

    const totalEarnings =
      totalTaxableSalary +
      bonus +
      medicalAllowance +
      travelReimbursement +
      getNumber(bucket, 'UTILITY_REIMBURSEMENT') +
      getNumber(bucket, 'MEALS_REIMBURSEMENT') +
      getNumber(bucket, 'MOBILE_REIMBURSEMENT') +
      getNumber(bucket, 'EXPENSE_REIMBURSEMENT') +
      getNumber(bucket, 'ADVANCE_LOAN') +
      additionalNonTaxableEarnings

    const totalDeductions =
      incomeTax + getNumber(bucket, 'ADJUSTMENT') + getNumber(bucket, 'LOAN_REPAYMENT') + additionalDeductions
    const netSalary = totalEarnings - totalDeductions

    // The rolling balance is driven by recorded payments (the Payments step),
    // not an assumption. When payments exist for this employee, the balance
    // carries the unpaid earnings; otherwise the full net is still owed.
    const previousBalance = previousBalanceMap.get(payrollName) || 0
    const recordedPaid = paidByPayroll.get(payrollName)
    let paid: number
    let balance: number
    if (recordedPaid) {
      const categories: PaymentCategory[] = PAYABLE_EARNING_KEYS.map((key) => ({
        computed: getNumber(bucket, key),
        paid: recordedPaid.get(key) ?? 0,
      }))
      balance = computeCarriedBalance(previousBalance, categories)
      // Net-equivalent disbursed, kept on the receipt for the pay stub.
      paid = netSalary - (balance - previousBalance)
    } else {
      paid = 0
      balance = previousBalance + netSalary
    }

    const metrics: Record<string, number> = {
      TOTAL_TAXABLE_SALARY: totalTaxableSalary,
      TOTAL_EARNINGS: totalEarnings,
      TOTAL_DEDUCTIONS: totalDeductions,
      NET_SALARY: netSalary,
      BALANCE: balance,
    }

    for (const [metricKey, amount] of Object.entries(metrics)) {
      computedInserts.push({
        periodId,
        payrollName,
        userId,
        metricKey,
        amount,
        formulaKey: metricKey,
        formulaVersion: FORMULA_VERSION,
        lineageJson: {
          periodKey,
          taxFinancialYearId: activeFinancialYear?.id || null,
          workingDays,
          fixes: [
            FIX_IDS.TRAVEL_SUMIF_RANGE,
            FIX_IDS.GROSS_MEDICAL_ALIGNMENT,
            FIX_IDS.TAX_SLAB_REF_BOUNDS,
            FIX_IDS.PAID_BALANCE_ROLLING,
          ],
        } as Prisma.InputJsonValue,
      })
    }

    receiptUpserts.push({
      periodId,
      payrollName,
      userId,
      receiptJson: {
        periodKey,
        payrollName,
        earnings: {
          basicSalary,
          medicalTaxExemption,
          bonus,
          medicalAllowance,
          travelReimbursement,
          utilityReimbursement: getNumber(bucket, 'UTILITY_REIMBURSEMENT'),
          mealsReimbursement: getNumber(bucket, 'MEALS_REIMBURSEMENT'),
          mobileReimbursement: getNumber(bucket, 'MOBILE_REIMBURSEMENT'),
          expenseReimbursement: getNumber(bucket, 'EXPENSE_REIMBURSEMENT'),
          advanceLoan: getNumber(bucket, 'ADVANCE_LOAN'),
          additionalEarnings,
          totalEarnings,
        },
        deductions: {
          incomeTax,
          adjustment: getNumber(bucket, 'ADJUSTMENT'),
          loanRepayment: getNumber(bucket, 'LOAN_REPAYMENT'),
          additionalDeductions,
          totalDeductions,
        },
        net: {
          netSalary,
          paid,
          previousBalance,
          balance,
        },
      } as Prisma.InputJsonValue,
      status: 'READY',
      version: 1,
    })
  }

  // Split auto-generated inputs into batch creates and value-changed updates so
  // the transaction stays well under the interactive-transaction timeout.
  const existingInputByKey = new Map(inputs.map((row) => [`${row.payrollName}|${row.componentKey}`, row]))
  const autoCreates = autoInputUpserts.filter((row) => !existingInputByKey.has(`${row.payrollName}|${row.componentKey}`))
  const autoUpdates = autoInputUpserts.filter((row) => {
    const existing = existingInputByKey.get(`${row.payrollName}|${row.componentKey}`)
    return existing !== undefined && (existing.amount !== row.amount || existing.userId !== row.userId)
  })

  await prisma.$transaction(async (tx) => {
    if (autoCreates.length > 0) {
      await tx.payrollInputValue.createMany({
        data: autoCreates.map((row) => ({
          periodId: row.periodId,
          payrollName: row.payrollName,
          userId: row.userId,
          componentKey: row.componentKey,
          amount: row.amount,
          sourceMethod: 'MANUAL',
          isOverride: false,
          provenanceJson: {
            generatedBy: row.generatedBy,
            generatedAt: new Date().toISOString(),
          },
        })),
      })
    }

    for (const row of autoUpdates) {
      await tx.payrollInputValue.update({
        where: {
          periodId_payrollName_componentKey: {
            periodId: row.periodId,
            payrollName: row.payrollName,
            componentKey: row.componentKey,
          },
        },
        data: {
          userId: row.userId,
          amount: row.amount,
          sourceMethod: 'MANUAL',
          isOverride: false,
          provenanceJson: {
            generatedBy: row.generatedBy,
            generatedAt: new Date().toISOString(),
          },
        },
      })
    }

    await tx.payrollComputedValue.deleteMany({ where: { periodId } })
    if (computedInserts.length > 0) {
      await tx.payrollComputedValue.createMany({
        data: computedInserts,
      })
    }

    await tx.payrollReceipt.deleteMany({ where: { periodId } })
    if (receiptUpserts.length > 0) {
      await tx.payrollReceipt.createMany({
        data: receiptUpserts,
      })
    }

    await tx.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: 'CALCULATED',
        summaryJson: {
          periodKey,
          tolerance,
          mismatchCount: mismatches.length,
          mismatches,
          travelSkips,
          appliedFixes: Object.values(FIX_IDS),
          computedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    })
  }, { timeout: 60_000, maxWait: 10_000 })

  return {
    periodId,
    periodKey,
    payrollCount: rowsByPayroll.size,
    computedCount: computedInserts.length,
    mismatchCount: mismatches.length,
    mismatches,
    travelSkips,
    appliedFixes: Object.values(FIX_IDS),
  }
}
