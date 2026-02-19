import { prisma } from '@/lib/db'
import { estimateIncomeTaxFromSlabs, FIX_IDS, FORMULA_VERSION } from '@/lib/payroll/formula-registry'
import { PayrollReconciliationMismatch, reconcileNetVsPaid } from '@/lib/payroll/reconciliation'
import { toPeriodKey, normalizePayrollName } from '@/lib/payroll/normalizers'
import { calculateAnnualProgressiveTax, calculatePresentDays, calculateWorkingDays, resolveTravelTier } from '@/lib/payroll/settings'
import type { Prisma } from '@prisma/client'

type InputBucket = Record<string, number>

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

const KNOWN_DEDUCTION_KEYS = new Set(['INCOME_TAX', 'ADJUSTMENT', 'LOAN_REPAYMENT', 'PAID'])

export interface RecalculateResult {
  periodId: string
  periodKey: string
  payrollCount: number
  computedCount: number
  mismatchCount: number
  mismatches: PayrollReconciliationMismatch[]
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
  const [inputs, activeFinancialYear, salaryHeads, holidays, travelTiers] = await Promise.all([
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

  const [profiles, attendanceEntries, salaryRevisions] = await Promise.all([
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
  ])

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
  const travelAutoUpserts: Array<{
    periodId: string
    payrollName: string
    userId: string
    amount: number
  }> = []

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
    const userId = rows.find((r) => r.userId)?.userId || userIdByNormalized.get(normalized) || null

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

    const additionalEarnings = Object.entries(bucket).reduce((sum, [componentKey, amount]) => {
      const code = componentKey.toUpperCase()
      if (KNOWN_EARNING_KEYS.has(code)) return sum
      const head = salaryHeadByCode.get(code)
      if (!head || head.type !== 'EARNING') return sum
      return sum + amount
    }, 0)

    const additionalDeductions = Object.entries(bucket).reduce((sum, [componentKey, amount]) => {
      const code = componentKey.toUpperCase()
      if (KNOWN_DEDUCTION_KEYS.has(code)) return sum
      const head = salaryHeadByCode.get(code)
      if (!head || head.type !== 'DEDUCTION') return sum
      return sum + amount
    }, 0)

    const additionalTaxableEarnings = Object.entries(bucket).reduce((sum, [componentKey, amount]) => {
      const code = componentKey.toUpperCase()
      const head = salaryHeadByCode.get(code)
      if (!head || head.type !== 'EARNING' || !head.isTaxable) return sum
      return sum + amount
    }, 0)
    const additionalNonTaxableEarnings = additionalEarnings - additionalTaxableEarnings

    const basicSalary = getNumber(bucket, 'BASIC_SALARY')
    const medicalAllowance = getNumber(bucket, 'MEDICAL_ALLOWANCE')
    const medicalTaxExemption =
      bucket.MEDICAL_TAX_EXEMPTION !== undefined
        ? getNumber(bucket, 'MEDICAL_TAX_EXEMPTION')
        : -medicalAllowance
    const bonus = getNumber(bucket, 'BONUS')

    const totalTaxableSalary = basicSalary + medicalTaxExemption + bonus + additionalTaxableEarnings
    // WHT Calculations in the workbook compute tax on (salary + bonus) only,
    // without the medical exemption adjustment. Use that same base for the
    // slab-based fallback so carry-forward / manual periods match the workbook.
    const incomeTax = (() => {
      if (bucket.INCOME_TAX !== undefined) return getNumber(bucket, 'INCOME_TAX')
      if (activeFinancialYear && activeFinancialYear.taxBrackets.length > 0) {
        const annual = calculateAnnualProgressiveTax(
          Math.max(0, basicSalary + bonus + additionalTaxableEarnings) * 12,
          activeFinancialYear.taxBrackets
        )
        return annual / 12
      }
      return estimateIncomeTaxFromSlabs(periodKey, basicSalary + bonus)
    })()

    const travelOverride = rows.find((r) => r.componentKey === 'TRAVEL_REIMBURSEMENT' && r.isOverride)
    let travelReimbursement = getNumber(bucket, 'TRAVEL_REIMBURSEMENT')
    if (!travelOverride && userId) {
      const profile = profileByUserId.get(userId)
      const tier = resolveTravelTier(
        travelTiers,
        profile?.transportMode,
        profile?.distanceKm ?? null,
        period.periodStart
      )
      if (tier && workingDays > 0) {
        const userAttendance = attendanceByUserId.get(userId) || []
        const presentDays =
          userAttendance.length > 0
            ? calculatePresentDays(userAttendance, period.periodStart, period.periodEnd)
            : workingDays
        const payable = Math.max(0, (tier.monthlyRate * presentDays) / workingDays)
        travelReimbursement = Number(payable.toFixed(2))
        travelAutoUpserts.push({
          periodId,
          payrollName,
          userId,
          amount: travelReimbursement,
        })
      }
    }

    const totalEarnings =
      totalTaxableSalary +
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
    const paid = getNumber(bucket, 'PAID')
    const previousBalance = previousBalanceMap.get(payrollName) || 0
    const balance = previousBalance + netSalary - paid

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

    const mismatch = reconcileNetVsPaid(payrollName, periodKey, netSalary, paid, tolerance)
    if (mismatch) mismatches.push(mismatch)

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

  await prisma.$transaction(async (tx) => {
    if (travelAutoUpserts.length > 0) {
      for (const row of travelAutoUpserts) {
        await tx.payrollInputValue.upsert({
          where: {
            periodId_payrollName_componentKey: {
              periodId: row.periodId,
              payrollName: row.payrollName,
              componentKey: 'TRAVEL_REIMBURSEMENT',
            },
          },
          update: {
            userId: row.userId,
            amount: row.amount,
            sourceMethod: 'MANUAL',
            isOverride: false,
            provenanceJson: {
              generatedBy: 'ATTENDANCE_TRAVEL',
              generatedAt: new Date().toISOString(),
            },
          },
          create: {
            periodId: row.periodId,
            payrollName: row.payrollName,
            userId: row.userId,
            componentKey: 'TRAVEL_REIMBURSEMENT',
            amount: row.amount,
            sourceMethod: 'MANUAL',
            isOverride: false,
            provenanceJson: {
              generatedBy: 'ATTENDANCE_TRAVEL',
              generatedAt: new Date().toISOString(),
            },
          },
        })
      }
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
          appliedFixes: Object.values(FIX_IDS),
          computedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    })
  })

  return {
    periodId,
    periodKey,
    payrollCount: rowsByPayroll.size,
    computedCount: computedInserts.length,
    mismatchCount: mismatches.length,
    mismatches,
    appliedFixes: Object.values(FIX_IDS),
  }
}
