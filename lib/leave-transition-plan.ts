import { z } from 'zod'

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
