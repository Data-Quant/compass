import { Prisma } from '@prisma/client'
import { calculateLeaveDuration, leaveHasStarted } from '@/lib/leave-utils'

type LeaveRequestLike = {
  employeeId: string
  startDate: Date
  endDate: Date
  isHalfDay: boolean
  leaveType: string
}

/**
 * Restores the used leave days for a cancelled/disapproved request — but ONLY
 * when the leave has not started yet. Days for a leave already begun or past are
 * treated as availed and are never clawed back. Returns the number of days
 * restored (0 if none). Must run inside a transaction.
 */
export async function restoreUnstartedLeaveBalance(
  tx: Prisma.TransactionClient,
  leaveRequest: LeaveRequestLike
): Promise<number> {
  const start = new Date(leaveRequest.startDate)
  if (leaveHasStarted(start)) return 0

  const daysUsed = calculateLeaveDuration(start, new Date(leaveRequest.endDate), leaveRequest.isHalfDay)
  if (daysUsed <= 0) return 0

  const usedField = `${leaveRequest.leaveType.toLowerCase()}Used` as 'casualUsed' | 'sickUsed' | 'annualUsed'
  const balance = await tx.leaveBalance.findUnique({
    where: { employeeId_year: { employeeId: leaveRequest.employeeId, year: start.getFullYear() } },
  })
  if (!balance) return 0

  const decrementBy = Math.min(balance[usedField], daysUsed)
  if (decrementBy <= 0) return 0

  await tx.leaveBalance.update({
    where: { employeeId_year: { employeeId: leaveRequest.employeeId, year: start.getFullYear() } },
    data: { [usedField]: { decrement: decrementBy } },
  })
  return decrementBy
}
