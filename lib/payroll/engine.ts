import { prisma } from '@/lib/db'
import { estimateIncomeTaxFromSlabs, FIX_IDS, FORMULA_VERSION } from '@/lib/payroll/formula-registry'
import { PayrollReconciliationMismatch, reconcileNetVsPaid } from '@/lib/payroll/reconciliation'
import { toPeriodKey } from '@/lib/payroll/normalizers'
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
      status: true,
    },
  })

  if (!period) {
    throw new Error('Payroll period not found')
  }

  const periodKey = toPeriodKey(period.periodStart)
  const inputs = await prisma.payrollInputValue.findMany({
    where: { periodId },
    orderBy: [{ payrollName: 'asc' }, { componentKey: 'asc' }],
  })

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
    const userId = rows.find((r) => r.userId)?.userId || null

    const basicSalary = getNumber(bucket, 'BASIC_SALARY')
    const medicalAllowance = getNumber(bucket, 'MEDICAL_ALLOWANCE')
    const medicalTaxExemption =
      bucket.MEDICAL_TAX_EXEMPTION !== undefined
        ? getNumber(bucket, 'MEDICAL_TAX_EXEMPTION')
        : -medicalAllowance
    const bonus = getNumber(bucket, 'BONUS')

    const totalTaxableSalary = basicSalary + medicalTaxExemption + bonus
    // WHT Calculations in the workbook compute tax on (salary + bonus) only,
    // without the medical exemption adjustment. Use that same base for the
    // slab-based fallback so carry-forward / manual periods match the workbook.
    const incomeTax =
      bucket.INCOME_TAX !== undefined
        ? getNumber(bucket, 'INCOME_TAX')
        : estimateIncomeTaxFromSlabs(periodKey, basicSalary + bonus)

    const totalEarnings =
      totalTaxableSalary +
      medicalAllowance +
      getNumber(bucket, 'TRAVEL_REIMBURSEMENT') +
      getNumber(bucket, 'UTILITY_REIMBURSEMENT') +
      getNumber(bucket, 'MEALS_REIMBURSEMENT') +
      getNumber(bucket, 'MOBILE_REIMBURSEMENT') +
      getNumber(bucket, 'EXPENSE_REIMBURSEMENT') +
      getNumber(bucket, 'ADVANCE_LOAN')

    const totalDeductions =
      incomeTax + getNumber(bucket, 'ADJUSTMENT') + getNumber(bucket, 'LOAN_REPAYMENT')
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
          travelReimbursement: getNumber(bucket, 'TRAVEL_REIMBURSEMENT'),
          utilityReimbursement: getNumber(bucket, 'UTILITY_REIMBURSEMENT'),
          mealsReimbursement: getNumber(bucket, 'MEALS_REIMBURSEMENT'),
          mobileReimbursement: getNumber(bucket, 'MOBILE_REIMBURSEMENT'),
          expenseReimbursement: getNumber(bucket, 'EXPENSE_REIMBURSEMENT'),
          advanceLoan: getNumber(bucket, 'ADVANCE_LOAN'),
          totalEarnings,
        },
        deductions: {
          incomeTax,
          adjustment: getNumber(bucket, 'ADJUSTMENT'),
          loanRepayment: getNumber(bucket, 'LOAN_REPAYMENT'),
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
