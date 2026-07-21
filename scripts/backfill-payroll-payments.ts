import { prisma } from '../lib/db'
import { PAYABLE_EARNING_KEYS } from '../lib/payroll/payments'

// One-time: for every non-DRAFT period, seed a PayrollPayment per payable
// earning category at the computed amount (fully paid), preserving current
// zero balances as Auto-Paid is retired. Then delete AUTO_PAID_NET input rows.
async function main() {
  const periods = await prisma.payrollPeriod.findMany({
    where: { status: { not: 'DRAFT' } },
    select: { id: true, periodStart: true, status: true },
    orderBy: { periodStart: 'asc' },
  })

  const earningField: Record<string, string> = {
    BASIC_SALARY: 'basicSalary',
    MEDICAL_ALLOWANCE: 'medicalAllowance',
    BONUS: 'bonus',
    TRAVEL_REIMBURSEMENT: 'travelReimbursement',
    MOBILE_REIMBURSEMENT: 'mobileReimbursement',
    UTILITY_REIMBURSEMENT: 'utilityReimbursement',
    MEALS_REIMBURSEMENT: 'mealsReimbursement',
    EXPENSE_REIMBURSEMENT: 'expenseReimbursement',
    ADVANCE_LOAN: 'advanceLoan',
  }

  for (const p of periods) {
    const receipts = await prisma.payrollReceipt.findMany({
      where: { periodId: p.id },
      select: { payrollName: true, userId: true, receiptJson: true },
    })
    let created = 0
    for (const r of receipts) {
      const earnings =
        ((r.receiptJson as { earnings?: Record<string, number> })?.earnings) ?? {}
      for (const key of PAYABLE_EARNING_KEYS) {
        const amount = Number(earnings[earningField[key]] ?? 0)
        await prisma.payrollPayment.upsert({
          where: {
            periodId_payrollName_componentKey: {
              periodId: p.id,
              payrollName: r.payrollName,
              componentKey: key,
            },
          },
          create: {
            periodId: p.id,
            payrollName: r.payrollName,
            userId: r.userId,
            componentKey: key,
            paidAmount: amount,
          },
          update: { paidAmount: amount },
        })
        created++
      }
    }
    const removed = await prisma.payrollInputValue.deleteMany({
      where: {
        periodId: p.id,
        componentKey: 'PAID',
        provenanceJson: { path: ['generatedBy'], equals: 'AUTO_PAID_NET' },
      },
    })
    console.log(
      `${p.periodStart.toISOString().slice(0, 7)} [${p.status}]: ${receipts.length} employees, ${created} payment rows seeded, ${removed.count} AUTO_PAID_NET inputs removed`
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
