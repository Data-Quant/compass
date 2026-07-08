import { prisma } from '@/lib/db'
import {
  CARRY_FORWARD_COMPONENT_KEYS,
  selectCarryForwardInputs,
  type CarryForwardEmployeeStatus,
} from './carry-forward'

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

  // Reimbursements (PayrollExpenseEntry) are never carried forward — they vary
  // month to month and are re-entered per run.
  const baseInputs = await prisma.payrollInputValue.findMany({ where: { periodId: basePeriodId } })

  // Resolve the current status of every linked employee so offboarded /
  // deactivated / deleted people are dropped from the carry-forward.
  const referencedUserIds = [
    ...new Set(baseInputs.map((input) => input.userId).filter((id): id is string => Boolean(id))),
  ]
  const users =
    referencedUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: referencedUserIds } },
          select: {
            id: true,
            payrollProfile: { select: { isPayrollActive: true, exitDate: true } },
          },
        })
      : []
  const statusByUserId = new Map<string, CarryForwardEmployeeStatus>(
    users.map((user) => [
      user.id,
      {
        exists: true,
        isPayrollActive: user.payrollProfile ? user.payrollProfile.isPayrollActive : true,
        exitDate: user.payrollProfile?.exitDate ?? null,
      },
    ])
  )
  const resolveStatus = (userId: string | null): CarryForwardEmployeeStatus | null => {
    if (!userId) return null
    // A userId with no matching User row means the employee was permanently deleted.
    return statusByUserId.get(userId) ?? { exists: false, isPayrollActive: false, exitDate: null }
  }

  const salaryBaseInputs = baseInputs.filter((input) =>
    CARRY_FORWARD_COMPONENT_KEYS.has(input.componentKey)
  )
  const carriedInputs = selectCarryForwardInputs(baseInputs, resolveStatus, targetPeriod.periodStart)
  const excludedEmployeeCount = salaryBaseInputs.length - carriedInputs.length

  await prisma.$transaction(async (tx) => {
    await tx.payrollInputValue.deleteMany({ where: { periodId: targetPeriodId } })
    // Clear any reimbursements on the target; none are carried forward.
    await tx.payrollExpenseEntry.deleteMany({ where: { periodId: targetPeriodId } })

    if (carriedInputs.length > 0) {
      await tx.payrollInputValue.createMany({
        data: carriedInputs.map((input) => ({
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
          carriedInputCount: carriedInputs.length,
          carriedExpenseCount: 0,
          excludedEmployeeCount,
        },
      },
    })
  })

  return {
    basePeriodId,
    targetPeriodId,
    carriedInputCount: carriedInputs.length,
    carriedExpenseCount: 0,
    excludedEmployeeCount,
  }
}
