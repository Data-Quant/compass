// Request validation (zod) and pure campaign-definition checks.
import { z } from 'zod'
import { parseCalendarDate } from './calendar'
import { audienceSchema, isAudienceEmpty, type AudienceRules } from './audience'
import { cycleLengthError } from './recurrence'
import {
  FREQUENCIES,
  LIMITS,
  QUESTION_TYPES,
  RECURRENCE_ANCHORS,
  SUBTASK_MODES,
  type Frequency,
  type QuestionType,
  type RecurrenceAnchor,
  type SubtaskMode,
} from './types'

const reasonSchema = z.string().trim().min(3, 'Give a reason (at least 3 characters)').max(1000)
const justificationSchema = z.string().trim().min(10, 'Explain why a self-review is necessary').max(1000)
export const dateKeySchema = z.string().refine((value) => parseCalendarDate(value) !== null, 'Use a YYYY-MM-DD date')
const idSchema = z.string().min(1).max(64)

export const CAMPAIGN_IMAGE_PREFIX = 'security-campaign-images/'

// ─── Campaign definition ────────────────────────────────────────────────────

export const questionInputSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(3, 'Each question needs a prompt').max(500),
    compliantAnswer: z.boolean().nullable().optional(),
  })
  .strict()

export const instructionImageSchema = z
  .object({
    path: z.string().startsWith(CAMPAIGN_IMAGE_PREFIX).max(300).refine((value) => !value.includes('..'), 'Invalid image path'),
    name: z.string().trim().min(1).max(120),
  })
  .strict()

export const campaignFieldsSchema = z
  .object({
    name: z.string().trim().min(3, 'Name the campaign').max(200),
    control: z.string().trim().min(2, 'Name the control').max(200),
    instructions: z.string().max(20000).default(''),
    instructionImages: z.array(instructionImageSchema).max(10).default([]),
    videoUrl: z.string().trim().max(500).nullable().default(null),
    questions: z.array(questionInputSchema).max(30).default([]),
    subtaskMode: z.enum(SUBTASK_MODES).default('NONE'),
    subtasks: z.array(z.string().trim().min(1).max(200)).max(LIMITS.maxSubtasksPerTask).default([]),
    evidenceRequired: z.boolean().default(true),
    fileLimit: z.number().int().min(1).max(LIMITS.maxFileLimit).default(LIMITS.defaultFileLimit),
    deadlineDays: z.number().int().min(1, 'The deadline must be at least 1 day').max(180),
    reminderOffsets: z.array(z.number().int().min(1).max(90)).max(6).default([...LIMITS.defaultReminderOffsets]),
    frequency: z.enum(FREQUENCIES),
    recurrenceAnchor: z.enum(RECURRENCE_ANCHORS).default('FIXED_CALENDAR'),
    audience: audienceSchema,
    firstOpenDate: dateKeySchema.nullable().default(null),
  })
  .strict()

export type CampaignFields = z.infer<typeof campaignFieldsSchema>
export const campaignUpdateSchema = campaignFieldsSchema.partial().strict()
export type CampaignUpdate = z.infer<typeof campaignUpdateSchema>

/** Fields that stay editable on an active campaign; anything structural needs a clone. */
export const LIVE_EDITABLE_FIELDS = ['instructions', 'instructionImages', 'videoUrl', 'reminderOffsets', 'audience'] as const

export interface CampaignDefinition {
  name: string
  control: string
  videoUrl: string | null
  questions: ReadonlyArray<{ type: QuestionType; prompt: string; compliantAnswer?: boolean | null }>
  subtaskMode: SubtaskMode
  subtasks: readonly string[]
  fileLimit: number
  deadlineDays: number
  reminderOffsets: readonly number[]
  frequency: Frequency
  recurrenceAnchor: RecurrenceAnchor
  audience: AudienceRules
  firstOpenDate: string | null
}

export function videoUrlError(url: string | null, folderId: string | undefined = process.env.SECURITY_CHECKS_DRIVE_FOLDER_ID): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'The video link is not a valid URL'
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'drive.google.com') {
    return 'The video link must point to the Security team’s Google Drive folder (https://drive.google.com/…)'
  }
  if (folderId && !parsed.pathname.includes(`/folders/${folderId}`)) {
    return 'The video link must point to the designated Security team Google Drive folder'
  }
  return null
}

export const usesAdminSubtasks = (mode: SubtaskMode): boolean => mode === 'ADMIN_DEFINED' || mode === 'ADMIN_WITH_EMPLOYEE_ADDITIONS'
export const allowsEmployeeSubtasks = (mode: SubtaskMode): boolean => mode === 'EMPLOYEE_DEFINED' || mode === 'ADMIN_WITH_EMPLOYEE_ADDITIONS'

/** Definition problems that block saving. */
export function definitionIssues(def: CampaignDefinition): string[] {
  const issues: string[] = []
  def.questions.forEach((question, index) => {
    const hasAnswer = typeof question.compliantAnswer === 'boolean'
    if (question.type === 'YES_NO' && !hasAnswer) issues.push(`Question ${index + 1}: choose the compliant answer (Yes or No)`)
    if (question.type !== 'YES_NO' && hasAnswer) issues.push(`Question ${index + 1}: only Yes/No questions have a compliant answer`)
  })
  if (!usesAdminSubtasks(def.subtaskMode) && def.subtasks.length > 0) issues.push('Only admin-defined subtask modes take a subtask list')
  if (new Set(def.subtasks.map((name) => name.toLowerCase())).size !== def.subtasks.length) issues.push('Subtask names must be unique')
  const reserved = def.subtaskMode === 'EMPLOYEE_DEFINED' ? 1 : 0
  if (def.subtasks.length + reserved > LIMITS.maxSubtasksPerTask) issues.push(`A task can have at most ${LIMITS.maxSubtasksPerTask} subtasks`)
  if (new Set(def.reminderOffsets).size !== def.reminderOffsets.length) issues.push('Reminder days must be unique')
  const videoError = videoUrlError(def.videoUrl)
  if (videoError) issues.push(videoError)
  const lengthError = cycleLengthError(def.frequency, def.recurrenceAnchor, def.deadlineDays)
  if (lengthError) issues.push(lengthError)
  return issues
}

/** Additional problems that block activation (§3 minimum content). */
export function activationIssues(def: CampaignDefinition, todayKey: string): string[] {
  const issues = definitionIssues(def)
  const adminSubtasks = usesAdminSubtasks(def.subtaskMode) ? def.subtasks.length : 0
  if (def.questions.length === 0 && adminSubtasks === 0 && def.subtaskMode !== 'EMPLOYEE_DEFINED') {
    issues.push('Add at least one question or one admin-defined subtask before activating')
  }
  if (def.subtaskMode === 'ADMIN_DEFINED' && def.subtasks.length === 0) issues.push('Add at least one subtask for an admin-defined campaign')
  if (isAudienceEmpty(def.audience)) issues.push('Choose an audience')
  if (!def.firstOpenDate) issues.push('Choose the first open date')
  else if (def.firstOpenDate < todayKey) issues.push('The first open date cannot be in the past')
  return issues
}

// ─── Employee actions ───────────────────────────────────────────────────────

export const draftSchema = z
  .object({
    subtasks: z
      .array(
        z
          .object({
            id: idSchema,
            answers: z.record(z.string(), z.union([z.boolean(), z.string().max(1000)])).optional(),
            declarationConfirmed: z.boolean().optional(),
            naRequested: z.boolean().optional(),
            naJustification: z.string().trim().max(1000).nullable().optional(),
          })
          .strict(),
      )
      .max(LIMITS.maxSubtasksPerTask),
  })
  .strict()
export type DraftInput = z.infer<typeof draftSchema>

export const submitSchema = z
  .object({ confirmed: z.literal(true, { error: 'Confirm the attestation to submit' }) })
  .strict()

export const employeeSubtaskSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), name: z.string().trim().min(2, 'Name the tool').max(200) }).strict(),
  z.object({ action: z.literal('rename'), subtaskId: idSchema, name: z.string().trim().min(2, 'Name the tool').max(200) }).strict(),
  z.object({ action: z.literal('delete'), subtaskId: idSchema }).strict(),
])
export type EmployeeSubtaskInput = z.infer<typeof employeeSubtaskSchema>

export const evidenceTokenPayloadSchema = z
  .object({
    taskId: idSchema,
    subtaskId: idSchema,
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1).max(100),
    size: z.number().int().positive(),
    prohibitedAcknowledged: z.literal(true, {
      error: 'Confirm the file contains no codes, QR codes, secrets or passwords',
    }),
  })
  .strict()
export type EvidenceTokenPayload = z.infer<typeof evidenceTokenPayloadSchema>

export const evidenceCompleteSchema = z
  .object({ subtaskId: idSchema, pathname: z.string().min(1).max(400), fileName: z.string().min(1).max(255) })
  .strict()

// ─── Reviewer / admin actions ──────────────────────────────────────────────

export const verdictSchema = z
  .object({
    subtaskId: idSchema.optional(),
    action: z.enum(['VERIFY', 'REJECT', 'REQUEST_INFO', 'APPROVE_NA', 'DENY_NA']),
    reason: z.string().trim().max(1000).optional(),
    selfReviewJustification: justificationSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const needsReason = value.action === 'REJECT' || value.action === 'REQUEST_INFO' || value.action === 'DENY_NA'
    if (needsReason && (!value.reason || value.reason.length < 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Give a reason the employee can act on' })
    }
  })
export type VerdictInput = z.infer<typeof verdictSchema>

export const approveAllSchema = z.object({ selfReviewJustification: justificationSchema.optional() }).strict()
export const bulkVerifySchema = z.object({ taskIds: z.array(idSchema).min(1).max(500) }).strict()
export const reasonOnlySchema = z.object({ reason: reasonSchema }).strict()
export const reasonWithSelfReviewSchema = z
  .object({ reason: reasonSchema, selfReviewJustification: justificationSchema.optional() })
  .strict()
export const extensionSchema = z
  .object({ newDeadline: dateKeySchema, reason: reasonSchema, selfReviewJustification: justificationSchema.optional() })
  .strict()
export const prohibitedDeleteSchema = z.object({ reason: reasonSchema }).strict()
export const grantSchema = z.object({ userId: idSchema }).strict()
export const settingsSchema = z
  .object({
    retentionEnabled: z.boolean().optional(),
    evidenceRetentionMonths: z.number().int().min(1).max(120).optional(),
    attestationRetentionMonths: z.number().int().min(1).max(240).optional(),
    auditRetentionMonths: z.number().int().min(1).max(240).optional(),
  })
  .strict()
