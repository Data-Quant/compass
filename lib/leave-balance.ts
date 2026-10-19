import { Prisma } from '@prisma/client'
import { cancellableLeaveDays } from '@/lib/leave-utils'

type LeaveRequestLike = {
  employeeId: string
  startDate: Date
  endDate: Date
  isHalfDay: boolean
  leaveType: string
}

/**
 * Restores the used days of a cancelled or disapproved APPROVED request: the working days from today (or its start,
 * if later) to its last day. A leave cancelled on its first day gets every day back; one already underway gets today
 * and the rest. Callers refuse the cancellation on or after the last day (canCancelLeave), so nothing is restored then.
 * Returns the number of days restored. Must run inside a transaction.
 */
export async function restoreCancelledLeaveBalance(
  tx: Prisma.TransactionClient,
  leaveRequest: LeaveRequestLike,
  now = new Date()
): Promise<number> {
  const daysToRestore = cancellableLeaveDays(leaveRequest, now)
  if (daysToRestore <= 0) return 0

  const start = new Date(leaveRequest.startDate)
  const usedField = `${leaveRequest.leaveType.toLowerCase()}Used` as 'casualUsed' | 'sickUsed' | 'annualUsed'
  const balance = await tx.leaveBalance.findUnique({
    where: { employeeId_year: { employeeId: leaveRequest.employeeId, year: start.getFullYear() } },
  })
  if (!balance) return 0

  const decrementBy = Math.min(balance[usedField], daysToRestore)
  if (decrementBy <= 0) return 0

  await tx.leaveBalance.update({
    where: { employeeId_year: { employeeId: leaveRequest.employeeId, year: start.getFullYear() } },
    data: { [usedField]: { decrement: decrementBy } },
  })
  return decrementBy
}
