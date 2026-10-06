import { z } from 'zod'
import { isValidModelId } from './calibration-rules'
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

const questionWeeksSchema = z.number().int().min(1, 'At least one question week').max(26)
export const createCycleSchema = z.object({ periodId: z.string().min(1), weekOneStartsOn: mondaySchema, questionWeeks: questionWeeksSchema.optional() }).strict()
export type CreateCycleInput = z.infer<typeof createCycleSchema>

export const updateCycleSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), weekOneStartsOn: mondaySchema, questionWeeks: questionWeeksSchema.optional() }).strict(),
  z.object({ action: z.literal('start') }).strict(),
])
export type UpdateCycleInput = z.infer<typeof updateCycleSchema>

export const promptUpdateSchema = z
  .object({ text: z.string().trim().min(20, 'Write at least 20 characters').max(600).optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((value) => value.text !== undefined || value.isActive !== undefined, 'Nothing to change')

export const profileDraftSchema = z.object({ levels: profileLevelsSchema, insufficientDefinition: z.string().trim().min(10).max(1000) }).strict()
export type ProfileDraftInput = z.infer<typeof profileDraftSchema>

export const reasonSchema = z.string().trim().min(3, 'Give a reason').max(500)
export const optInSchema = z.object({ cycleId: z.string().min(1), userId: z.string().min(1), reason: reasonSchema }).strict()
export const removeOptInSchema = z.object({ cycleId: z.string().min(1), userId: z.string().min(1) }).strict()

export const testToolSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('release-next-week'), cycleId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('fill-synthetic'), cycleId: z.string().min(1), evaluatorId: z.string().min(1).optional() }).strict(),
  z.object({ action: z.literal('approve-all-drafts') }).strict(),
  z.object({ action: z.literal('reset'), cycleId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('score-now'), cycleId: z.string().min(1), model: z.enum(['configured', 'stand-in']).default('configured') }).strict(),
  z.object({ action: z.literal('accept-due-now'), cycleId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('settle-for-close'), cycleId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('pairs'), cycleId: z.string().min(1), evaluatorId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('release-for'), cycleId: z.string().min(1), evaluatorId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('ask-pair'), cycleId: z.string().min(1), evaluatorId: z.string().min(1), evaluateeId: z.string().min(1) }).strict(),
])
export type TestToolInput = z.infer<typeof testToolSchema>

const basedOnSchema = z.object({ aiScoreId: z.string().min(1).nullable(), reviewId: z.string().min(1).nullable() }).strict()
const optionalReason = z.string().trim().max(500).optional()
/** `basedOn` is what HR was looking at; a decision on anything newer is refused as stale. */
export const decisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ACCEPT'), basedOn: basedOnSchema, reason: optionalReason }).strict(),
  z.object({ action: z.literal('SET_SCORE'), basedOn: basedOnSchema, score: z.number().int().min(1).max(4), reason: reasonSchema }).strict(),
  z.object({ action: z.literal('NOT_ENOUGH_EVIDENCE'), basedOn: basedOnSchema, reason: optionalReason }).strict(),
  z.object({ action: z.literal('EXCLUDE'), basedOn: basedOnSchema, reason: reasonSchema }).strict(),
])
export type DecisionInput = z.infer<typeof decisionSchema>

export const reviewFilterSchema = z.enum(['NEEDS_REVIEW', 'FAILED', 'AUTO_ACCEPT', 'SCORING', 'DECIDED'])
export const correctionSchema = z
  .object({ situation: field, action: field, result: field, shortfall: field.nullable().optional(), reason: reasonSchema })
  .strict()
export type CorrectionInput = z.infer<typeof correctionSchema>

const formRelationshipTypeSchema = z.enum(['C_LEVEL', 'DEPT', 'HR'])
export const formResponseSchema = z
  .object({
    questionId: z.string().min(1),
    questionSource: z.enum(['GLOBAL', 'LEAD']),
    ratingValue: z.number().int().min(1).max(4).nullable().optional(),
    textResponse: z.string().max(5000).nullable().optional(),
  })
  .strict()
export const formInputSchema = z.object({ relationshipType: formRelationshipTypeSchema, evaluateeId: z.string().min(1), responses: z.array(formResponseSchema).max(200) }).strict()
export type FormInput = z.infer<typeof formInputSchema>
export const formTableKindSchema = z.enum(['HR', 'PARTNER'])
export const formTableRowSchema = z.object({
  kind: formTableKindSchema,
  evaluatorId: z.string().min(1),
  relationshipType: z.enum(['C_LEVEL', 'DEPT', 'HR', 'TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'CROSS_DEPARTMENT']),
  evaluateeId: z.string().min(1),
  ratings: z.array(z.object({ questionId: z.string().min(1), questionSource: z.enum(['GLOBAL', 'LEAD']).default('GLOBAL'), ratingValue: z.number().int().min(1).max(4).nullable() }).strict()).max(50),
  submit: z.boolean(),
}).strict()
export const pairWindowSchema = z.object({
  cycleId: z.string().min(1), evaluatorId: z.string().min(1), evaluateeId: z.string().min(1),
  relationshipType: z.enum(['TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'CROSS_DEPARTMENT']),
  startWeek: z.number().int().min(1).max(26), weeks: z.number().int().min(1).max(26),
}).strict()
export const peerRequestSchema = z.object({ peerId: z.string().min(1), action: z.enum(['ADD', 'REMOVE']), reason: z.string().trim().max(500).optional() }).strict()
export const cancelPeerRequestSchema = z.object({ requestId: z.string().min(1) }).strict()
export const peerVoteSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT']) }).strict()
export const peerDecisionSchema = z.union([
  z.object({ requestId: z.string().min(1), decision: z.enum(['APPROVE', 'REJECT']) }).strict(),
  z.object({ requestId: z.string().min(1), action: z.literal('resend') }).strict(),
])
const surveyText = z.string().trim().max(2000).nullable().optional()
export const surveySubmitSchema = z.object({
  anonymous: z.boolean(),
  answers: z.array(z.object({ questionId: z.string().min(1), value: z.number().int().min(0).max(10).nullable().optional(), choice: z.string().max(200).nullable().optional(), text: surveyText }).strict()).min(1).max(30),
}).strict()
export const surveyAdminSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('load-default'), periodId: z.string().min(1) }).strict(),
  z.object({
    action: z.literal('add'), periodId: z.string().min(1),
    question: z.object({
      text: z.string().trim().min(5, 'Write the question').max(500), kind: z.enum(['NPS', 'AGREE', 'CHOICE', 'TEXT']),
      options: z.array(z.string().trim().min(1).max(200)).max(12).optional(), required: z.boolean().optional(), explainChoice: z.boolean().optional(),
    }).strict(),
  }).strict(),
  z.object({ action: z.literal('remove'), questionId: z.string().min(1) }).strict(),
])
export const formQuerySchema = z.object({ relationshipType: formRelationshipTypeSchema, evaluateeId: z.string().min(1) })

export const closeActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('close'), cycleId: z.string().min(1),
    drops: z.array(z.object({ evaluateeId: z.string().min(1), perspective: z.enum(['LEAD', 'UPWARD', 'PEER']) }).strict()).max(5000),
    formsAcknowledged: z.boolean().optional(),
  }).strict(),
  z.object({ action: z.literal('reopen'), cycleId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('publish'), cycleId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('open-forms'), cycleId: z.string().min(1) }).strict(),
])
export type CloseActionInput = z.infer<typeof closeActionSchema>

export const challengeSchema = z.object({ reason: z.string().trim().min(20, 'Explain in at least 20 characters').max(3000) }).strict()
export const challengeActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('adjust'), responseId: z.string().min(1), score: z.number().int().min(1).max(4), reason: reasonSchema }).strict(),
  z.object({ action: z.literal('resolve'), outcome: z.enum(['UPHELD', 'NOT_UPHELD']), resolution: z.string().trim().min(10, 'Write at least 10 characters').max(3000) }).strict(),
])
export type ChallengeActionInput = z.infer<typeof challengeActionSchema>

const modelIdSchema = z.string().trim().refine(isValidModelId, 'Use a Fireworks model id such as accounts/fireworks/models/llama-v3p1-70b-instruct')
const priceValue = z.number().finite().min(0, 'Prices cannot be negative').max(1000)
export const aiSettingsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set-active'), model: modelIdSchema.nullable() }).strict(),
  z.object({ action: z.literal('set-price'), model: modelIdSchema, inputPerMillion: priceValue, outputPerMillion: priceValue }).strict(),
  z.object({ action: z.literal('remove-price'), model: z.string().trim().min(1).max(200) }).strict(),
])
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>

type JudgementLike = { hrSufficiency: 'SUFFICIENT' | 'INSUFFICIENT'; hrScore: number | null }
function judgementMatches(value: JudgementLike, ctx: z.RefinementCtx): void {
  if (value.hrSufficiency === 'SUFFICIENT' && value.hrScore === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hrScore'], message: 'Give your score (1–4)' })
  if (value.hrSufficiency === 'INSUFFICIENT' && value.hrScore !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hrScore'], message: 'An answer without enough evidence has no score' })
}
const itemBox = z.string().trim().min(1, 'Required').max(MAX_FIELD_CHARS)
const itemFields = {
  competencyId: z.string().min(1),
  question: z.string().trim().min(10, 'Write the question').max(600),
  situation: itemBox,
  action: itemBox,
  result: itemBox,
  shortfall: z.string().trim().max(MAX_FIELD_CHARS).nullable().optional(),
}
const judgementFields = {
  hrSufficiency: z.enum(['SUFFICIENT', 'INSUFFICIENT']),
  hrScore: z.number().int().min(1).max(4).nullable(),
  note: z.string().trim().max(1000).nullable().optional(),
}
export const calibrationItemSchema = z
  .discriminatedUnion('source', [
    z.object({ source: z.literal('answer'), responseId: z.string().min(1), ...judgementFields }).strict(),
    z.object({ source: z.literal('manual'), ...itemFields, ...judgementFields }).strict(),
  ])
  .superRefine(judgementMatches)
export type CalibrationItemInput = z.infer<typeof calibrationItemSchema>
export const calibrationItemUpdateSchema = z
  .discriminatedUnion('op', [
    z.object({ op: z.literal('edit'), ...itemFields, ...judgementFields }).strict(),
    z.object({ op: z.literal('archive') }).strict(),
    z.object({ op: z.literal('restore') }).strict(),
  ])
  .superRefine((value, ctx) => {
    if (value.op === 'edit') judgementMatches(value, ctx)
  })
export type CalibrationItemUpdate = z.infer<typeof calibrationItemUpdateSchema>

const runModel = z.string().trim().min(1, 'Enter a model id').max(200)
export const calibrationRunSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SET'), model: runModel }).strict(),
  z.object({ kind: z.literal('CYCLE'), cycleId: z.string().min(1), model: runModel }).strict(),
])
export type CalibrationRunInput = z.infer<typeof calibrationRunSchema>

export const moreEvidenceSchema = z.object({ cycleId: z.string().min(1), evaluateeId: z.string().min(1), perspective: z.enum(['LEAD', 'UPWARD', 'PEER']) }).strict()
