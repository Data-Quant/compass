import type { LeaveStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { restoreUnstartedLeaveBalance } from '@/lib/leave-balance'
import { leaveHasStarted } from '@/lib/leave-utils'
import { removeLeaveCalendarEvent } from '@/lib/google-calendar'
import { sendLeaveCancellationNotification } from '@/lib/email'
import { safeRecordLeaveAuditEvent } from '@/lib/leave-audit'

/**
 * Cancelling a leave that never got a transition plan.
 *
 * This is the only place in the portal where a leave is cancelled with no human
 * behind it, so it deliberately reuses the same steps as the two manual paths
 * (app/api/leave/approve for HR disapproval, app/api/leave/requests for self-cancel)
 * rather than inventing a second way to cancel: restore the balance, drop the
 * calendar invite, tell everyone affected.
 */

const ACTIVE_STATUSES: LeaveStatus[] = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED']

/** Shown to everyone on the cancellation mail, so it has to explain itself in one line. */
const AUTOMATED_ACTOR_LABEL = 'P21 Compass (automatic)'

export type AutoCancelResult =
  | { cancelled: true; restoredDays: number; previousStatus: LeaveStatus }
  | { cancelled: false; reason: string }

function formatDeadline(deadline: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(deadline)
}

/**
 * Cancel one leave request whose transition-plan deadline has passed.
 *
 * Every guard is re-checked inside the transaction against a fresh read, not against
 * whatever the caller saw when it built its list. The cron decides who to cancel from
 * a query taken minutes earlier, and a plan submitted in that gap has to win.
 */
export async function autoCancelLeaveForMissingTransitionPlan(
  requestId: string,
  deadline: Date
): Promise<AutoCancelResult> {
  const reason = `No transition plan was attached by the ${formatDeadline(deadline)} deadline.`

  let outcome: AutoCancelResult

  try {
    outcome = await prisma.$transaction(async (tx) => {
      const leaveRequest = await tx.leaveRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          employeeId: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          isHalfDay: true,
          status: true,
          transitionPlanSubmittedAt: true,
        },
      })

      if (!leaveRequest) {
        return { cancelled: false, reason: 'Leave request not found' } as AutoCancelResult
      }
      if (!ACTIVE_STATUSES.includes(leaveRequest.status)) {
        return { cancelled: false, reason: 'Leave request is not active' } as AutoCancelResult
      }
      if (leaveRequest.transitionPlanSubmittedAt) {
        return { cancelled: false, reason: 'Transition plan was submitted' } as AutoCancelResult
      }
      // Belt and braces: the deadline is clamped to the day before the leave, so this
      // should be unreachable. If a run is ever missed and it is reachable, those days
      // are already availed and clawing them back would be wrong.
      if (leaveHasStarted(new Date(leaveRequest.startDate))) {
        return { cancelled: false, reason: 'Leave has already started' } as AutoCancelResult
      }

      // Only an APPROVED request has had days deducted; the earlier statuses never did.
      const restoredDays =
        leaveRequest.status === 'APPROVED'
          ? await restoreUnstartedLeaveBalance(tx, leaveRequest)
          : 0

      await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'CANCELLED',
          // rejectedBy holds a user id and there is no acting user, so the automation
          // identifies itself through the reason and the audit row instead.
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
      })

      return {
        cancelled: true,
        restoredDays,
        previousStatus: leaveRequest.status,
      } as AutoCancelResult
    })
  } catch (error) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'SYSTEM',
      eventType: 'TRANSITION_PLAN_AUTO_CANCELLED',
      status: 'FAILED',
      metadata: { deadline: deadline.toISOString() },
      error,
    })
    throw error
  }

  if (!outcome.cancelled) {
    return outcome
  }

  // The state change is recorded before the follow-ups, so a failure to mail or to
  // reach Google cannot make a cancelled leave look like it was never cancelled.
  await safeRecordLeaveAuditEvent({
    leaveRequestId: requestId,
    channel: 'SYSTEM',
    eventType: 'TRANSITION_PLAN_AUTO_CANCELLED',
    status: 'SUCCESS',
    metadata: {
      deadline: deadline.toISOString(),
      previousStatus: outcome.previousStatus,
      restoredDays: outcome.restoredDays,
      reason,
    },
  })

  try {
    await removeLeaveCalendarEvent(requestId)
  } catch (error) {
    console.error(`Failed to remove calendar event for auto-cancelled leave ${requestId}:`, error)
  }

  try {
    await sendLeaveCancellationNotification(requestId, AUTOMATED_ACTOR_LABEL, reason)
  } catch (error) {
    console.error(`Failed to send cancellation notice for auto-cancelled leave ${requestId}:`, error)
  }

  return outcome
}
