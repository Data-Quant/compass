// §7 Reminders. Defaults 14/7/1 days before the deadline (per campaign).
// - Offsets that fall before the task's start (cycle open / enrollment) are skipped.
// - Keys are per offset, so an extension re-anchors reminders without
//   repeating offsets already sent.
// - Reminders stop on submission and resume after a return verdict
//   (immediate notice — sent by the review flow — plus a day-5 reminder
//   when the remaining window is the 7 days after the verdict).
// - Final and Exempt tasks never get reminders.
import { addDays } from './dates'
import { isAwaitingFirstSubmission, isReturned, RESUBMIT_WINDOW_DAYS } from './timeline'
import type { TaskStatus } from './types'

export const RETURN_REMINDER_DAY = 5

export interface ReminderState {
  status: TaskStatus
  deadline: Date
  startedAt: Date
  offsets: readonly number[]
  lastVerdictAt: Date | null
  resubmitDueAt: Date | null
  sentKeys: ReadonlySet<string>
}

export interface ReminderPlan {
  /** The one reminder to send now (the most urgent), or null. */
  send: { key: string; kind: 'DEADLINE' | 'RETURN_DAY5'; daysLeft: number } | null
  /** Keys to record as handled (includes stale offsets superseded by `send`). */
  markSent: string[]
}

export const deadlineReminderKey = (offset: number) => `deadline:${offset}`
export const returnReminderKey = (verdictAt: Date) => `return-day5:${verdictAt.toISOString()}`

const EMPTY: ReminderPlan = { send: null, markSent: [] }

function windowIsVerdictPlusSeven(state: ReminderState): boolean {
  if (!state.lastVerdictAt || !state.resubmitDueAt) return false
  return state.resubmitDueAt.getTime() === addDays(state.lastVerdictAt, RESUBMIT_WINDOW_DAYS).getTime()
}

function deadlinePlan(state: ReminderState, now: Date): ReminderPlan {
  if (now.getTime() > state.deadline.getTime()) return EMPTY
  const due = [...new Set(state.offsets)]
    .filter((offset) => offset > 0)
    .map((offset) => ({ offset, at: addDays(state.deadline, -offset) }))
    .filter(({ offset, at }) => at.getTime() >= state.startedAt.getTime() && at.getTime() <= now.getTime() && !state.sentKeys.has(deadlineReminderKey(offset)))
    .sort((a, b) => a.offset - b.offset)
  if (due.length === 0) return EMPTY
  const daysLeft = Math.max(0, Math.ceil((state.deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
  return {
    send: { key: deadlineReminderKey(due[0].offset), kind: 'DEADLINE', daysLeft },
    markSent: due.map(({ offset }) => deadlineReminderKey(offset)),
  }
}

export function planReminder(state: ReminderState, now: Date): ReminderPlan {
  if (isAwaitingFirstSubmission(state.status)) return deadlinePlan(state, now)
  if (!isReturned(state.status)) return EMPTY
  if (windowIsVerdictPlusSeven(state) && state.lastVerdictAt && state.resubmitDueAt) {
    const key = returnReminderKey(state.lastVerdictAt)
    const at = addDays(state.lastVerdictAt, RETURN_REMINDER_DAY)
    if (state.sentKeys.has(key) || now.getTime() < at.getTime() || now.getTime() > state.resubmitDueAt.getTime()) return EMPTY
    return { send: { key, kind: 'RETURN_DAY5', daysLeft: RESUBMIT_WINDOW_DAYS - RETURN_REMINDER_DAY }, markSent: [key] }
  }
  // Window still ends at D: the remaining deadline offsets resume.
  return deadlinePlan(state, now)
}
