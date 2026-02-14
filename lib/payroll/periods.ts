import { prisma } from '@/lib/db'

export async function carryForwardPayrollPeriod(
  basePeriodId: string,
  targetPeriodId: string,
  actorId: string
) {
  const [basePeriod, targetPeriod] = await Promise.all([
    prisma.payrollPeriod.findUnique({ where: { id: basePeriodId } }),
    prisma.payrollPeriod.findUnique({ where: { id: targetPeriodId } }),
  ])

  if (!basePeriod) throw new Error('Base payroll period not found')
  if (!targetPeriod) throw new Error('Target payroll period not found')

  const [baseInputs, baseExpenses] = await Promise.all([
    prisma.payrollInputValue.findMany({ where: { periodId: basePeriodId } }),
    prisma.payrollExpenseEntry.findMany({ where: { periodId: basePeriodId } }),
  ])

  await prisma.$transaction(async (tx) => {
    await tx.payrollInputValue.deleteMany({ where: { periodId: targetPeriodId } })
    await tx.payrollExpenseEntry.deleteMany({ where: { periodId: targetPeriodId } })

    if (baseInputs.length > 0) {
      await tx.payrollInputValue.createMany({
        data: baseInputs.map((input) => ({
          periodId: targetPeriodId,
          payrollName: input.payrollName,
          userId: input.userId,
          componentKey: input.componentKey,
          amount: input.amount,
          sourceSheet: input.sourceSheet,
          sourceCell: input.sourceCell,
          sourceMethod: 'CARRY_FORWARD',
          isOverride: false,
          note: `Carried forward from ${basePeriod.label}`,
          provenanceJson: {
            carriedForwardFromPeriodId: basePeriodId,
            originalInputId: input.id,
          },
        })),
      })
    }

    if (baseExpenses.length > 0) {
      await tx.payrollExpenseEntry.createMany({
        data: baseExpenses.map((expense) => ({
          periodId: targetPeriodId,
          userId: expense.userId,
          payrollName: expense.payrollName,
          categoryKey: expense.categoryKey,
          description: expense.description,
          amount: expense.amount,
          sheetName: expense.sheetName,
          rowRef: expense.rowRef,
          enteredById: actorId,
        })),
      })
    }

    await tx.payrollComputedValue.deleteMany({ where: { periodId: targetPeriodId } })
    await tx.payrollReceipt.deleteMany({ where: { periodId: targetPeriodId } })

    await tx.payrollPeriod.update({
      where: { id: targetPeriodId },
      data: {
        status: 'DRAFT',
        sourceType: 'CARRY_FORWARD',
        summaryJson: {
          carriedForwardFromPeriodId: basePeriodId,
          carriedForwardAt: new Date().toISOString(),
          carriedInputCount: baseInputs.length,
          carriedExpenseCount: baseExpenses.length,
        },
      },
    })
  })

  return {
    basePeriodId,
    targetPeriodId,
    carriedInputCount: baseInputs.length,
    carriedExpenseCount: baseExpenses.length,
  }
}
