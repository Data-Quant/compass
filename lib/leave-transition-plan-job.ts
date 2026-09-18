import type { LeaveStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  classifyTransitionReminder,
  classifyTransitionPlanAction,
  qualifiesForTransitionPlanDeadline,
  transitionPlanDeadline,
  transitionPlanRequired,
  NOTICE_LEAD_DAYS,
} from '@/lib/leave-transition-plan'
import { autoCancelLeaveForMissingTransitionPlan } from '@/lib/leave-auto-cancel'
import {
  sendTransitionPlanReminderNotification,
  sendTransitionPlanEscalation,
  sendTransitionPlanDeadlineNotice,
  sendTransitionPlanFinalWarning,
} from '@/lib/email'

/**
 * The daily transition-plan job.
 *
 * Two ladders run side by side, decided per request by length:
 *
 * - Longer than two working days: notice seven days out, a warning the day before the
 *   deadline, then automatic cancellation. `lib/leave-transition-plan.ts` holds the
 *   date arithmetic; this file only fetches state and dispatches.
 * - Two days or less: the original behaviour, unchanged -- daily reminders inside the
 *   window and one HR escalation. These are never cancelled.
 *
 * A long leave booked so late that it has no room for a response window falls back to
 * the short ladder, so it is still chased but never auto-cancelled.
 */

const ACTIVE_STATUSES: LeaveStatus[] = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED']

type Candidate = {
  id: string
  leaveType: string
  startDate: Date
  endDate: Date
  isHalfDay: boolean
}

export type TransitionPlanJobResult = {
  success: true
  dryRun: boolean
  reminderWindow: number
  candidates: number
  reminded: number
  escalated: number
  noticed: number
  warned: number
  cancelled: number
  failed: number
  errors: string[]
  requestIds: {
    remind: string[]
    escalate: string[]
    notice: string[]
    finalWarning: string[]
    cancel: string[]
  }
}

function utcStartOfDay(value: Date): Date {
  const copy = new Date(value)
  copy.setUTCHours(0, 0, 0, 0)
  return copy
}

/**
 * The first *successful* send of each kind, per request.
 *
 * Earliest wins: the notice row is what the deadline is measured from, so if a second
 * notice ever went out it must not push the deadline back and hand out a free
 * extension. Failed and skipped rows are ignored entirely, which is what makes a
 * failed send retry tomorrow rather than start a clock nobody received.
 */
async function loadLadderState(requestIds: string[]) {
  const noticeSentAt = new Map<string, Date>()
  const finalWarningSentAt = new Map<string, Date>()

  if (requestIds.length === 0) {
    return { noticeSentAt, finalWarningSentAt }
  }

  const rows = await prisma.leaveAuditEvent.findMany({
    where: {
      leaveRequestId: { in: requestIds },
      status: 'SUCCESS',
      eventType: { in: ['TRANSITION_PLAN_NOTICE', 'TRANSITION_PLAN_FINAL_WARNING'] },
    },
    select: { leaveRequestId: true, eventType: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  for (const row of rows) {
    const target =
      row.eventType === 'TRANSITION_PLAN_NOTICE' ? noticeSentAt : finalWarningSentAt
    if (!target.has(row.leaveRequestId)) {
      target.set(row.leaveRequestId, row.createdAt)
    }
  }

  return { noticeSentAt, finalWarningSentAt }
}

/** Requests already escalated to HR, so the escalation cannot repeat daily. */
async function loadEscalatedIds(requestIds: string[]) {
  if (requestIds.length === 0) return new Set<string>()

  const rows = await prisma.leaveAuditEvent.findMany({
    where: {
      eventType: 'TRANSITION_PLAN_ESCALATION',
      status: 'SUCCESS',
      leaveRequestId: { in: requestIds },
    },
    select: { leaveRequestId: true },
  })

  return new Set(rows.map((row) => row.leaveRequestId))
}

export async function runTransitionPlanReminders(
  reminderWindow = 5,
  dryRun = false
): Promise<TransitionPlanJobResult> {
  const today = utcStartOfDay(new Date())

  // The window has to reach whichever ladder looks furthest ahead, or long leaves
  // would never be seen on the day their notice is due.
  const horizon = Math.max(reminderWindow, NOTICE_LEAD_DAYS)
  const cutoff = new Date(today)
  cutoff.setUTCDate(cutoff.getUTCDate() + horizon)

  const allUnsubmitted: Candidate[] = await prisma.leaveRequest.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      transitionPlanSubmittedAt: null,
      startDate: { gte: today, lte: cutoff },
    },
    select: { id: true, leaveType: true, startDate: true, endDate: true, isHalfDay: true },
    orderBy: { startDate: 'asc' },
  })

  // Half-days and single sick days need no plan, so they are never reminded,
  // escalated or cancelled. The rule lives in transitionPlanRequired, shared with
  // the UI, so what the badge says and what the cron chases cannot disagree.
  const candidates = allUnsubmitted.filter((c) =>
    transitionPlanRequired({
      leaveType: c.leaveType,
      isHalfDay: c.isHalfDay,
      startDate: new Date(c.startDate),
      endDate: new Date(c.endDate),
    })
  )

  const longLeaves = candidates.filter((c) =>
    qualifiesForTransitionPlanDeadline({
      startDate: new Date(c.startDate),
      endDate: new Date(c.endDate),
      isHalfDay: c.isHalfDay,
    })
  )
  const longLeaveIds = new Set(longLeaves.map((c) => c.id))

  const { noticeSentAt, finalWarningSentAt } = await loadLadderState(
    longLeaves.map((c) => c.id)
  )

  const toNotice: Array<{ id: string; deadline: Date }> = []
  const toWarn: Array<{ id: string; deadline: Date }> = []
  const toCancel: Array<{ id: string; deadline: Date }> = []
  // Long leaves with no room for a response window rejoin the short ladder below.
  const shortLadder: Candidate[] = candidates.filter((c) => !longLeaveIds.has(c.id))

  for (const candidate of longLeaves) {
    const startDate = new Date(candidate.startDate)
    const noticeDate = noticeSentAt.get(candidate.id) ?? null

    const { action, deadline } = classifyTransitionPlanAction({
      startDate,
      submitted: false,
      noticeSentAt: noticeDate,
      finalWarningSentAt: finalWarningSentAt.get(candidate.id) ?? null,
      now: today,
    })

    if (action === 'notice') {
      // The deadline this notice would establish. Null means the leave starts too
      // soon to give anyone a fair window, so it is chased but never cancelled.
      const prospective = transitionPlanDeadline({ noticeDate: today, startDate })
      if (prospective) {
        toNotice.push({ id: candidate.id, deadline: prospective })
      } else {
        shortLadder.push(candidate)
      }
      continue
    }

    if (action === 'final_warning' && deadline) {
      toWarn.push({ id: candidate.id, deadline })
      continue
    }

    if (action === 'cancel' && deadline) {
      toCancel.push({ id: candidate.id, deadline })
    }

    // Anything else is 'none': either the leave is further out than the notice lead
    // time, or its notice has gone out and today is simply not a rung.
  }

  const escalatedIds = await loadEscalatedIds(shortLadder.map((c) => c.id))

  const shortDecisions = shortLadder.map((c) => ({
    id: c.id,
    ...classifyTransitionReminder({
      startDate: new Date(c.startDate),
      submitted: false,
      alreadyEscalated: escalatedIds.has(c.id),
      now: today,
      reminderWindow,
    }),
  }))

  const toRemind = shortDecisions.filter((d) => d.remind).map((d) => d.id)
  const toEscalate = shortDecisions.filter((d) => d.escalate).map((d) => d.id)

  const requestIds = {
    remind: toRemind,
    escalate: toEscalate,
    notice: toNotice.map((n) => n.id),
    finalWarning: toWarn.map((w) => w.id),
    cancel: toCancel.map((c) => c.id),
  }

  const result: TransitionPlanJobResult = {
    success: true,
    dryRun,
    reminderWindow,
    candidates: candidates.length,
    reminded: 0,
    escalated: 0,
    noticed: 0,
    warned: 0,
    cancelled: 0,
    failed: 0,
    errors: [],
    requestIds,
  }

  // A dry run reports exactly what a real run would do, from the same decisions --
  // this is how a cancellation list gets checked against real data before it fires.
  if (dryRun) {
    return result
  }

  for (const requestId of toRemind) {
    const outcome = await sendTransitionPlanReminderNotification(requestId)
    if (outcome.success) {
      result.reminded += 1
    } else if ('error' in outcome && outcome.error) {
      result.failed += 1
      result.errors.push(`${requestId} (reminder): ${outcome.error}`)
    }
    // Guard skips return `message`, not `error` -- a no-op, not a failure.
  }

  for (const requestId of toEscalate) {
    const outcome = await sendTransitionPlanEscalation(requestId)
    if (outcome.success) {
      result.escalated += 1
    } else if ('message' in outcome && outcome.message) {
      result.failed += 1
      result.errors.push(`${requestId} (escalation): ${outcome.message}`)
    }
  }

  for (const { id, deadline } of toNotice) {
    const outcome = await sendTransitionPlanDeadlineNotice(id, deadline)
    if (outcome.success) {
      result.noticed += 1
    } else if ('error' in outcome && outcome.error) {
      result.failed += 1
      result.errors.push(`${id} (notice): ${outcome.error}`)
    }
  }

  for (const { id, deadline } of toWarn) {
    const outcome = await sendTransitionPlanFinalWarning(id, deadline)
    if (outcome.success) {
      result.warned += 1
    } else if ('error' in outcome && outcome.error) {
      result.failed += 1
      result.errors.push(`${id} (final warning): ${outcome.error}`)
    }
  }

  for (const { id, deadline } of toCancel) {
    try {
      const outcome = await autoCancelLeaveForMissingTransitionPlan(id, deadline)
      if (outcome.cancelled) result.cancelled += 1
    } catch (error) {
      result.failed += 1
      result.errors.push(
        `${id} (auto-cancel): ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return result
}
