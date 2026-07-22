import { prisma } from '@/lib/db'
import {
  PAYABLE_EARNING_KEYS,
  computeCarriedBalance,
  computeNetPaid,
  paymentStatus,
  type PaymentStatus,
} from '@/lib/payroll/payments'

export type PaymentGridRow = {
  payrollName: string
  userId: string | null
  netSalary: number
  previousBalance: number
  categories: { componentKey: string; computed: number; paid: number }[]
  /** Full medical tax exemption (negative). The client scales it by the live paid ratio. */
  medicalTaxExemption: number
  /** Full income tax and other deductions. The client scales it by the live paid ratio. */
  totalDeductions: number
  /** Net amount disbursed -- equals the payslip's Net Salary when fully paid. */
  paidTotal: number
  balance: number
  status: PaymentStatus
}

export type PaymentMark = {
  payrollName: string
  userId: string | null
  amounts: Record<string, number>
}

/** Map a PAYABLE_EARNING_KEYS entry to its receiptJson.earnings field. */
const EARNING_FIELD: Record<string, string> = {
  BASIC_SALARY: 'basicSalary',
  MEDICAL_ALLOWANCE: 'medicalAllowance',
  BONUS: 'bonus',
  TRAVEL_REIMBURSEMENT: 'travelReimbursement',
  MOBILE_REIMBURSEMENT: 'mobileReimbursement',
  EXPENSE_REIMBURSEMENT: 'expenseReimbursement',
  ADVANCE_LOAN: 'advanceLoan',
}

function computedForKey(earnings: Record<string, number>, key: string): number {
  const field = EARNING_FIELD[key]
  const v = field ? earnings[field] : 0
  return Number.isFinite(v) ? Number(v) : 0
}

/** The previous period's carried BALANCE per employee, this period's opening balance. */
async function previousBalanceMap(periodStart: Date): Promise<Map<string, number>> {
  const prev = await prisma.payrollPeriod.findFirst({
    where: { periodStart: { lt: periodStart } },
    orderBy: { periodStart: 'desc' },
    select: { id: true },
  })
  if (!prev) return new Map()
  const rows = await prisma.payrollComputedValue.findMany({
    where: { periodId: prev.id, metricKey: 'BALANCE' },
    select: { payrollName: true, amount: true },
  })
  return new Map(rows.map((r) => [r.payrollName, r.amount]))
}

export async function getPaymentGrid(periodId: string): Promise<PaymentGridRow[]> {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    select: { periodStart: true },
  })
  if (!period) return []

  const [receipts, payments, prevBalances] = await Promise.all([
    prisma.payrollReceipt.findMany({
      where: { periodId },
      select: { payrollName: true, userId: true, receiptJson: true },
      orderBy: { payrollName: 'asc' },
    }),
    prisma.payrollPayment.findMany({
      where: { periodId },
      select: { payrollName: true, componentKey: true, paidAmount: true },
    }),
    previousBalanceMap(period.periodStart),
  ])

  const paidByPayroll = new Map<string, Map<string, number>>()
  for (const p of payments) {
    const inner = paidByPayroll.get(p.payrollName) ?? new Map<string, number>()
    inner.set(p.componentKey, p.paidAmount)
    paidByPayroll.set(p.payrollName, inner)
  }
  const hasRecords = new Set(payments.map((p) => p.payrollName))

  return receipts.map((r) => {
    const json = (r.receiptJson ?? {}) as {
      earnings?: Record<string, number>
      deductions?: { totalDeductions?: number }
      net?: { netSalary?: number }
    }
    const earnings = json.earnings ?? {}
    const netSalary = json.net?.netSalary ?? 0
    // Both are withheld rather than disbursed, and both scale with how much of
    // the earning line items was actually paid.
    const medicalTaxExemption = Number(earnings.medicalTaxExemption ?? 0)
    const totalDeductions = Number(json.deductions?.totalDeductions ?? 0)
    const previousBalance = prevBalances.get(r.payrollName) ?? 0
    const recorded = paidByPayroll.get(r.payrollName)
    // Default each cell to the computed amount when nothing is recorded yet.
    const categories = PAYABLE_EARNING_KEYS.map((key) => {
      const computed = computedForKey(earnings, key)
      const paid = hasRecords.has(r.payrollName) ? recorded?.get(key) ?? 0 : computed
      return { componentKey: key, computed, paid }
    })
    const netPaid = computeNetPaid(categories, netSalary)
    return {
      payrollName: r.payrollName,
      userId: r.userId,
      netSalary,
      previousBalance,
      categories,
      medicalTaxExemption,
      totalDeductions,
      paidTotal: netPaid,
      balance: computeCarriedBalance(previousBalance, netSalary, netPaid),
      status: paymentStatus(categories),
    }
  })
}

export async function savePaymentMarks(periodId: string, marks: PaymentMark[]): Promise<void> {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    select: { periodStart: true },
  })
  if (!period) throw new Error('Payroll period not found')
  const prevBalances = await previousBalanceMap(period.periodStart)

  const grid = await getPaymentGrid(periodId)
  const rowByPayroll = new Map(grid.map((g) => [g.payrollName, g]))

  await prisma.$transaction(
    async (tx) => {
      for (const mark of marks) {
        const row = rowByPayroll.get(mark.payrollName)
        if (!row) continue

        // Upsert one PayrollPayment per payable category.
        for (const key of PAYABLE_EARNING_KEYS) {
          const paidAmount = Number(mark.amounts[key] ?? 0)
          await tx.payrollPayment.upsert({
            where: {
              periodId_payrollName_componentKey: {
                periodId,
                payrollName: mark.payrollName,
                componentKey: key,
              },
            },
            create: {
              periodId,
              payrollName: mark.payrollName,
              userId: mark.userId,
              componentKey: key,
              paidAmount,
            },
            update: { paidAmount, userId: mark.userId },
          })
        }

        // Targeted balance update — no engine recalc. Balance is in net terms:
        // withholding scales with how much of the earnings was actually paid.
        const categories = PAYABLE_EARNING_KEYS.map((key) => ({
          computed: row.categories.find((c) => c.componentKey === key)?.computed ?? 0,
          paid: Number(mark.amounts[key] ?? 0),
        }))
        const previousBalance = prevBalances.get(mark.payrollName) ?? 0
        const netPaid = computeNetPaid(categories, row.netSalary)
        const balance = computeCarriedBalance(previousBalance, row.netSalary, netPaid)

        await tx.payrollComputedValue.updateMany({
          where: { periodId, payrollName: mark.payrollName, metricKey: 'BALANCE' },
          data: { amount: balance },
        })

        const receipt = await tx.payrollReceipt.findUnique({
          where: { periodId_payrollName: { periodId, payrollName: mark.payrollName } },
          select: { receiptJson: true },
        })
        if (receipt) {
          const json = (receipt.receiptJson ?? {}) as Record<string, unknown>
          const net = (json.net ?? {}) as Record<string, unknown>
          json.net = { ...net, paid: netPaid, previousBalance, balance }
          await tx.payrollReceipt.update({
            where: { periodId_payrollName: { periodId, payrollName: mark.payrollName } },
            data: { receiptJson: json as never },
          })
        }
      }
    },
    { timeout: 60_000, maxWait: 10_000 }
  )
}
