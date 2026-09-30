import { z } from 'zod'
import { endOfKarachiDay, parseCalendarDate, parseMonthKey, type KpiMonthDeadlines } from './calendar'
import { isHttpUrl } from './evidence'

const monthKeySchema = z.string().refine((value) => parseMonthKey(value) !== null, 'Use a YYYY-MM month between 2000 and 2100')
const titleSchema = z.string().trim().min(3, 'Use at least 3 characters').max(200)
const targetSchema = z.string().trim().min(3, 'Describe a measurable target').max(500)
const ownerIdsSchema = z.array(z.string().min(1)).min(1, 'Choose at least one owner').max(50)
const reasonSchema = z.string().trim().min(3, 'Give a reason').max(500)
const dueDateSchema = z.string().regex(/^d{4}-d{2}-d{2}$/, 'Use a YYYY-MM-DD date')
export const evidenceTypeSchema = z.enum(['LINK', 'DOCUMENT', 'NUMBER', 'CLIENT_CONFIRMATION'])

export const createGoalSchema = z
  .object({
    monthKey: monthKeySchema,
    scope: z.enum(['TEAM', 'DEPARTMENT']),
    departmentKey: z.string().trim().min(1).max(200).optional(),
    setterId: z.string().min(1).optional(),
    title: titleSchema,
    description: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === 'DEPARTMENT' && !value.departmentKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['departmentKey'], message: 'Choose a department' })
    }
    if (value.scope === 'TEAM' && value.departmentKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['departmentKey'], message: 'Team goals do not belong to a department' })
    }
    if (value.scope === 'DEPARTMENT' && value.setterId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['setterId'], message: 'Department goals are set by the signed-in Partner or HR' })
    }
  })
export type CreateGoalInput = z.infer<typeof createGoalSchema>

export const updateGoalSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit'), title: titleSchema.optional(), description: z.string().trim().max(2000).nullable().optional() }).strict(),
  z.object({ action: z.literal('archive') }).strict(),
])
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>

export const createKpiSchema = z
  .object({ goalId: z.string().min(1), title: titleSchema, target: targetSchema, evidenceType: evidenceTypeSchema, ownerIds: ownerIdsSchema, dueDate: dueDateSchema.optional() })
  .strict()
export type CreateKpiInput = z.infer<typeof createKpiSchema>

export const updateKpiSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('edit'),
      version: z.number().int().min(0),
      title: titleSchema.optional(),
      target: targetSchema.optional(),
      evidenceType: evidenceTypeSchema.optional(),
      ownerIds: ownerIdsSchema.optional(),
      dueDate: dueDateSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal('discard'), version: z.number().int().min(0) }).strict(),
])
export type UpdateKpiInput = z.infer<typeof updateKpiSchema>

export const commentSchema = z.object({ body: z.string().trim().min(1, 'Write a comment').max(2000) }).strict()
export type CommentInput = z.infer<typeof commentSchema>

const dateOnlySchema = z.string().refine((value) => parseCalendarDate(value) !== null, 'Use a valid YYYY-MM-DD date')
export const deadlineDatesSchema = z
  .object({ goalsLockAt: dateOnlySchema, claimsDueAt: dateOnlySchema, verifyDueAt: dateOnlySchema, responseDueAt: dateOnlySchema, targetFinalAt: dateOnlySchema })
  .strict()
export type DeadlineDates = z.infer<typeof deadlineDatesSchema>

export function toDeadlines(dates: DeadlineDates): KpiMonthDeadlines {
  const at = (value: string) => {
    const date = parseCalendarDate(value)
    if (!date) throw new Error(`Invalid date ${value}`)
    return endOfKarachiDay(date)
  }
  return {
    goalsLockAt: at(dates.goalsLockAt),
    claimsDueAt: at(dates.claimsDueAt),
    verifyDueAt: at(dates.verifyDueAt),
    responseDueAt: at(dates.responseDueAt),
    targetFinalAt: at(dates.targetFinalAt),
  }
}

export const createMonthSchema = z.object({ monthKey: monthKeySchema, deadlines: deadlineDatesSchema.optional() }).strict()
export const setterAssignmentSchema = z.object({ employeeId: z.string().min(1), setterId: z.string().min(1), reason: reasonSchema }).strict()
export const removeSetterSchema = z.object({ id: z.string().min(1), reason: reasonSchema }).strict()
export const grantSchema = z.object({ userId: z.string().min(1), role: z.enum(['VERIFIER', 'DEPARTMENT_SETTER']) }).strict()
export const removeGrantSchema = z.object({ id: z.string().min(1) }).strict()

const versionSchema = z.number().int().min(0)
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => value === '' || isHttpUrl(value), 'Links must start with http:// or https://')
  .optional()
const optionalValue = z.string().trim().max(200).optional()

export const claimSchema = z
  .object({ version: versionSchema, outcome: z.enum(['DONE', 'NOT_DONE']), note: z.string().trim().max(4000).optional(), url: optionalUrl, reportedValue: optionalValue })
  .strict()
export type ClaimInput = z.infer<typeof claimSchema>

export const respondSchema = z
  .object({ version: versionSchema, kind: z.enum(['REPLY', 'APPEAL']), note: z.string().trim().min(3, 'Explain your reply').max(4000), url: optionalUrl, reportedValue: optionalValue })
  .strict()
export type RespondInput = z.infer<typeof respondSchema>

export const decideSchema = z
  .object({ version: versionSchema, decision: z.enum(['VERIFIED', 'NEEDS_INFO', 'REJECTED', 'NOT_VERIFIED']), note: z.string().trim().max(4000).optional() })
  .strict()
export type DecideInput = z.infer<typeof decideSchema>

export const overrideSchema = z
  .object({ version: versionSchema, to: z.enum(['VERIFIED', 'NOT_VERIFIED', 'NOT_DONE', 'CANCELLED']), reason: reasonSchema })
  .strict()
export type OverrideInput = z.infer<typeof overrideSchema>

export const monthStatusSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reopen'), reason: reasonSchema }).strict(),
  z.object({ action: z.literal('finalize') }).strict(),
])

export const changeProposalSchema = z.union([
  z.object({ cancel: z.literal(true) }).strict(),
  z
    .object({ title: titleSchema.optional(), target: targetSchema.optional(), evidenceType: evidenceTypeSchema.optional(), ownerIds: ownerIdsSchema.optional() })
    .strict()
    .refine((value) => Object.keys(value).length > 0, 'Change at least one field, or ask to cancel the KPI'),
])

export const changeRequestSchema = z.object({ version: versionSchema, proposed: changeProposalSchema, reason: reasonSchema }).strict()
export type ChangeRequestInput = z.infer<typeof changeRequestSchema>

export const decideChangeSchema = z.object({ approve: z.boolean(), note: z.string().trim().min(3, 'Explain the decision').max(1000) }).strict()
export type DecideChangeInput = z.infer<typeof decideChangeSchema>

export type MonthPatch =
  | { kind: 'status'; input: z.infer<typeof monthStatusSchema> }
  | { kind: 'deadlines'; deadlines: KpiMonthDeadlines }

/** PATCH /api/admin/kpi/months/[id] takes either a status action or new deadlines. */
export function parseMonthPatch(body: unknown): MonthPatch {
  if (body !== null && typeof body === 'object' && 'action' in body) return { kind: 'status', input: monthStatusSchema.parse(body) }
  return { kind: 'deadlines', deadlines: toDeadlines(deadlineDatesSchema.parse(body)) }
}
