import { z } from 'zod'
import { MAX_FIELD_CHARS } from './answer-rules'
import { parseWeekOneMonday } from './calendar'
import { profileLevelsSchema } from './profile'

const field = z.string().max(MAX_FIELD_CHARS, `Keep each box under ${MAX_FIELD_CHARS} characters`)
export const answerSchema = z
  .object({
    situation: field.default(''),
    action: field.default(''),
    result: field.default(''),
    shortfall: field.nullable().optional(),
    commentText: field.nullable().optional(),
  })
  .strict()
export type AnswerInput = z.infer<typeof answerSchema>

const mondaySchema = z.string().refine((value) => parseWeekOneMonday(value) !== null, 'Choose a Monday (YYYY-MM-DD)')
const capSchema = z.number().int().min(1).max(10)

export const createCycleSchema = z.object({ periodId: z.string().min(1), weekOneStartsOn: mondaySchema, weeklyCap: capSchema.default(5) }).strict()
export type CreateCycleInput = z.infer<typeof createCycleSchema>

export const updateCycleSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), weekOneStartsOn: mondaySchema.optional(), weeklyCap: capSchema.optional() }).strict(),
  z.object({ action: z.literal('start') }).strict(),
])
export type UpdateCycleInput = z.infer<typeof updateCycleSchema>

export const promptUpdateSchema = z
  .object({ text: z.string().trim().min(20, 'Write at least 20 characters').max(600).optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((value) => value.text !== undefined || value.isActive !== undefined, 'Nothing to change')

export const profileDraftSchema = z.object({ levels: profileLevelsSchema, insufficientDefinition: z.string().trim().min(10).max(1000) }).strict()
export type ProfileDraftInput = z.infer<typeof profileDraftSchema>

const reasonSchema = z.string().trim().min(3, 'Give a reason').max(500)
export const optInSchema = z.object({ cycleId: z.string().min(1), userId: z.string().min(1), reason: reasonSchema }).strict()
export const removeOptInSchema = z.object({ cycleId: z.string().min(1), userId: z.string().min(1) }).strict()

export const testToolSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('release-next-week'), cycleId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('fill-synthetic'), cycleId: z.string().min(1), evaluatorId: z.string().min(1).optional() }).strict(),
  z.object({ action: z.literal('approve-all-drafts') }).strict(),
  z.object({ action: z.literal('reset'), cycleId: z.string().min(1) }).strict(),
])
export type TestToolInput = z.infer<typeof testToolSchema>
