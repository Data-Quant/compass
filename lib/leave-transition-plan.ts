import { z } from 'zod'
import { calculateLeaveDuration } from '@/lib/leave-utils'

export interface TransitionTask {
  taskDetails: string
  projectDept: string
  assignedTo: string
  accepted: boolean | null
  deadline: string | null
  completed: boolean | null
  variance: string
  links: string
}

const MAX_ROWS = 50
const MAX_TEXT = 2000

const rawTaskSchema = z.object({
  taskDetails: z.string().max(MAX_TEXT).optional().default(''),
  projectDept: z.string().max(MAX_TEXT).optional().default(''),
  assignedTo: z.string().max(MAX_TEXT).optional().default(''),
  accepted: z.boolean().nullish(),
  deadline: z.string().max(50).nullish(),
  completed: z.boolean().nullish(),
  variance: z.string().max(MAX_TEXT).optional().default(''),
  links: z.string().max(MAX_TEXT).optional().default(''),
})

/**
 * Validate and normalize raw task rows into the stored shape. Drops rows with an empty
 * `taskDetails`. Throws on shape/bounds violations (too many rows, oversized text).
 */
export function validateTransitionTasks(raw: unknown): TransitionTask[] {
  const parsed = z.array(rawTaskSchema).max(MAX_ROWS).parse(raw ?? [])
  return parsed
    .filter((t) => (t.taskDetails || '').trim().length > 0)
    .map((t) => ({
      taskDetails: t.taskDetails.trim(),
      projectDept: (t.projectDept || '').trim(),
      assignedTo: (t.assignedTo || '').trim(),
      accepted: t.accepted ?? null,
      deadline: (t.deadline || '').trim() || null,
      completed: t.completed ?? null,
      variance: (t.variance || '').trim(),
      links: (t.links || '').trim(),
    }))
}

/** A plan can be submitted only if it has at least one task with details. */
export function canSubmitTransitionPlan(tasks: TransitionTask[]): boolean {
  return tasks.some((t) => t.taskDetails.trim().length > 0)
}

function toDateOnly(d: Date): Date {
  // Leave start dates are stored at UTC midnight; compare on the UTC calendar day so the
  // result is independent of the server's local timezone.
  const copy = new Date(d)
  copy.setUTCHours(0, 0, 0, 0)
  return copy
}

/** Whole days from `now` (date-only) to `startDate` (date-only). */
export function daysUntil(startDate: Date, now: Date = new Date()): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((toDateOnly(startDate).getTime() - toDateOnly(now).getTime()) / msPerDay)
}

const DEADLINE_DAYS = 3
const DEFAULT_WINDOW = 5

/**
 * Decide whether an upcoming leave with a missing transition plan should get an applicant
 * reminder and/or an HR escalation on today's cron run.
 * - remind: leave starts within the reminder window and is unsubmitted.
 * - escalate: at/after the deadline (<= DEADLINE_DAYS to start), unsubmitted, not yet escalated.
 */
export function classifyTransitionReminder(input: {
  startDate: Date
  submitted: boolean
  alreadyEscalated: boolean
  now?: Date
  reminderWindow?: number
}): { remind: boolean; escalate: boolean; daysUntilStart: number } {
  const daysUntilStart = daysUntil(input.startDate, input.now ?? new Date())
  if (input.submitted || daysUntilStart < 0) {
    return { remind: false, escalate: false, daysUntilStart }
  }
  const window = input.reminderWindow ?? DEFAULT_WINDOW
  const remind = daysUntilStart <= window
  const escalate = daysUntilStart <= DEADLINE_DAYS && !input.alreadyEscalated
  return { remind, escalate, daysUntilStart }
}

/**
 * The deadline ladder for long leaves.
 *
 * A leave longer than two working days gets a notice seven days out, a warning the
 * day before its deadline, and is cancelled once the deadline passes with no plan
 * attached. Short leaves keep classifyTransitionReminder above: reminders and an HR
 * escalation, but never cancellation.
 */

/** More than this many working days puts a leave on the deadline ladder. */
const DEADLINE_LADDER_MIN_WORKING_DAYS = 2
/** How far ahead of the leave the notice goes out. */
export const NOTICE_LEAD_DAYS = 7
/** How long the applicant has to respond to the notice. */
const RESPONSE_DAYS = 2

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

/**
 * Whether a leave is long enough to be auto-cancelled for a missing plan.
 *
 * Deliberately measured in *working* days via calculateLeaveDuration, so a Friday-to-
 * Monday absence counts as the two days it actually costs the team rather than four.
 * Half-days return 0.5 and so can never qualify.
 */
export function qualifiesForTransitionPlanDeadline(leave: {
  startDate: Date
  endDate: Date
  isHalfDay: boolean
}): boolean {
  return (
    calculateLeaveDuration(leave.startDate, leave.endDate, leave.isHalfDay) >
    DEADLINE_LADDER_MIN_WORKING_DAYS
  )
}

/**
 * When the plan is due, derived from the notice that actually went out.
 *
 * Two days from the notice, but never later than the day before the leave starts --
 * otherwise a leave booked at short notice would have a deadline falling after it had
 * already begun, and cancelling a leave someone is already on is not recoverable.
 *
 * Returns null when that clamp leaves no window at all (the leave starts today or
 * tomorrow). No window means no auto-cancellation: someone who booked a day out never
 * had a chance to respond, so they fall back to reminders and HR escalation instead.
 */
export function transitionPlanDeadline(input: { noticeDate: Date; startDate: Date }): Date | null {
  const notice = toDateOnly(input.noticeDate)
  const fromNotice = addDays(notice, RESPONSE_DAYS)
  const dayBeforeStart = addDays(toDateOnly(input.startDate), -1)

  const deadline = fromNotice.getTime() < dayBeforeStart.getTime() ? fromNotice : dayBeforeStart

  return deadline.getTime() <= notice.getTime() ? null : deadline
}

export type TransitionPlanAction = 'none' | 'notice' | 'final_warning' | 'cancel'

/**
 * The single rung due today for one long leave, given what has already been sent.
 *
 * `noticeSentAt` / `finalWarningSentAt` come from successful audit rows, so a failed
 * send simply leaves the rung due again tomorrow. Cancellation is checked before the
 * warning on purpose: a warning that never sent must not postpone the deadline, or one
 * SMTP failure would grant an open-ended extension.
 */
export function classifyTransitionPlanAction(input: {
  startDate: Date
  submitted: boolean
  noticeSentAt: Date | null
  finalWarningSentAt: Date | null
  now?: Date
}): { action: TransitionPlanAction; deadline: Date | null } {
  const now = toDateOnly(input.now ?? new Date())
  const daysUntilStart = daysUntil(input.startDate, now)

  // Once the leave is under way its days are committed; nothing further applies.
  if (input.submitted || daysUntilStart < 0) {
    return { action: 'none', deadline: null }
  }

  if (!input.noticeSentAt) {
    return {
      action: daysUntilStart <= NOTICE_LEAD_DAYS ? 'notice' : 'none',
      deadline: null,
    }
  }

  const deadline = transitionPlanDeadline({
    noticeDate: input.noticeSentAt,
    startDate: input.startDate,
  })
  if (!deadline) {
    return { action: 'none', deadline: null }
  }

  if (now.getTime() >= deadline.getTime()) {
    return { action: 'cancel', deadline }
  }

  // Skipped when the window is a single day, because the warning would land on the
  // notice day itself -- the notice already carries the warning in that case.
  const warningDate = addDays(deadline, -1)
  const warningIsDistinct = warningDate.getTime() > toDateOnly(input.noticeSentAt).getTime()

  if (!input.finalWarningSentAt && warningIsDistinct && now.getTime() >= warningDate.getTime()) {
    return { action: 'final_warning', deadline }
  }

  return { action: 'none', deadline }
}
