// String unions mirroring the Prisma enums, so pure logic and client code
// never import @prisma/client.

export const TASK_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'REQUIRES_INFO',
  'REJECTED',
  'VERIFIED',
  'EXPIRED',
  'NOT_APPLICABLE',
  'CANCELLED',
  'EXEMPT',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export type SubtaskStatus = 'OPEN' | 'PENDING_REVIEW' | 'REQUIRES_INFO' | 'REJECTED' | 'VERIFIED' | 'NOT_APPLICABLE'
export type SubtaskSource = 'TASK' | 'ADMIN' | 'EMPLOYEE' | 'DECLARATION'
export type ExpiryReason = 'NO_SUBMISSION' | 'WINDOW_LAPSED' | 'REJECTED_POST_CLOSE' | 'UNREVIEWED'
export type ReviewActionType = 'VERIFY' | 'REJECT' | 'REQUEST_INFO' | 'APPROVE_NA' | 'DENY_NA' | 'REOPEN' | 'TASK_NA'
export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED'
export type CycleStatus = 'OPEN' | 'CLOSING' | 'CLOSED'

export const SUBTASK_MODES = ['NONE', 'ADMIN_DEFINED', 'EMPLOYEE_DEFINED', 'ADMIN_WITH_EMPLOYEE_ADDITIONS'] as const
export type SubtaskMode = (typeof SUBTASK_MODES)[number]

export const FREQUENCIES = ['ONE_TIME', 'QUARTERLY', 'EVERY_4_MONTHS', 'EVERY_6_MONTHS', 'ANNUALLY'] as const
export type Frequency = (typeof FREQUENCIES)[number]

export const RECURRENCE_ANCHORS = ['FIXED_CALENDAR', 'RELATIVE_TO_CLOSE'] as const
export type RecurrenceAnchor = (typeof RECURRENCE_ANCHORS)[number]

export const QUESTION_TYPES = ['YES_NO', 'ACCOUNT_IDENTIFIER', 'SHORT_TEXT'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const FINAL_TASK_STATUSES: readonly TaskStatus[] = ['VERIFIED', 'EXPIRED', 'NOT_APPLICABLE', 'CANCELLED', 'EXEMPT']

export function isFinalTaskStatus(status: TaskStatus): boolean {
  return FINAL_TASK_STATUSES.includes(status)
}

/** Product limits from the requirements (§3, §8). */
export const LIMITS = {
  maxSubtasksPerTask: 20,
  defaultFileLimit: 3,
  maxFileLimit: 15,
  maxFileBytes: 10 * 1024 * 1024,
  maxExtensionDays: 30,
  defaultReminderOffsets: [14, 7, 1] as readonly number[],
} as const

export const DECLARATION_SUBTASK_NAME =
  'Declaration complete: I have listed every in-scope tool I use (or have none to declare)'

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  PENDING_REVIEW: 'Pending review',
  REQUIRES_INFO: 'Requires additional information',
  REJECTED: 'Rejected',
  VERIFIED: 'Verified',
  EXPIRED: 'Expired',
  NOT_APPLICABLE: 'Not applicable',
  CANCELLED: 'Cancelled',
  EXEMPT: 'Exempt',
}
