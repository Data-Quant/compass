import { z } from 'zod'
import { MAX_FIELD_CHARS } from './answer-rules'
import { parseWeekOneMonday } from './calendar'

const field = z.string().max(MAX_FIELD_CHARS, `Keep each box under ${MAX_FIELD_CHARS} characters`)
/** A multiple-choice answer (the chosen statement and an optional or required note), or a comment. */
export const answerSchema = z
  .object({
    optionId: z.string().min(1).max(20).nullable().optional(),
    note: field.nullable().optional(),
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

/** A question's 8 statements; optionsProblem checks the levels, this only the shape. */
export const statementsSchema = z.array(z.object({ text: z.string().trim().min(1, 'A statement is empty').max(300), score: z.number() }).strict()).max(12)
export const promptUpdateSchema = z
  .object({ text: z.string().trim().min(10, 'Write the question').max(600).optional(), options: statementsSchema.optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((value) => value.text !== undefined || value.options !== undefined || value.isActive !== undefined, 'Nothing to change')
export const questionCreateSchema = z.object({ text: z.string().trim().min(10, 'Write the question').max(600), options: statementsSchema }).strict()
export const topicCreateSchema = z.object({
  perspective: z.enum(['LEAD', 'UPWARD', 'PEER']), name: z.string().trim().min(2, 'Name the topic').max(120), departments: z.array(z.string().trim().max(80)).max(20).default([]),
  text: z.string().trim().min(10, 'Write the question').max(600), options: statementsSchema,
}).strict()
export const topicUpdateSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), departments: z.array(z.string().trim().max(80)).max(20).optional() }).strict()

export const reasonSchema = z.string().trim().min(3, 'Give a reason').max(500)
export const optInSchema = z.object({ cycleId: z.string().min(1), userId: z.string().min(1), reason: reasonSchema }).strict()
export const removeOptInSchema = z.object({ cycleId: z.string().min(1), userId: z.string().min(1) }).strict()

export const testToolSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('release-next-week'), cycleId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('fill-synthetic'), cycleId: z.string().min(1), evaluatorId: z.string().min(1).optional() }).strict(),
  z.object({ action: z.literal('reset'), cycleId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('pairs'), cycleId: z.string().min(1), evaluatorId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('release-for'), cycleId: z.string().min(1), evaluatorId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('ask-pair'), cycleId: z.string().min(1), evaluatorId: z.string().min(1), evaluateeId: z.string().min(1) }).strict(),
])
export type TestToolInput = z.infer<typeof testToolSchema>

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
export const peerRequestSchema = z.object({ peerId: z.string().min(1), action: z.enum(['ADD', 'REMOVE']), relation: z.enum(['PEER', 'LEAD', 'REPORT']).default('PEER'), reasonCode: z.enum(['NO_LONGER_WORK_TOGETHER', 'WRONG_PERSON', 'OTHER']).optional(), reason: z.string().trim().max(500).optional() }).strict()
export const cancelPeerRequestSchema = z.object({ requestId: z.string().min(1) }).strict()
/** The employee's own actions on their lists: say they look right, or answer HR's question on a request. */
export const mappingActionSchema = z.union([
  z.object({ action: z.literal('confirm') }).strict(),
  z.object({ action: z.literal('answer'), requestId: z.string().min(1), reason: z.string().trim().min(1).max(500) }).strict(),
])
const decisionNote = z.string().trim().max(500).nullable().optional()
/** From an emailed link: the lead decides, the peer replies. */
export const peerVoteSchema = z.union([
  z.object({ decision: z.enum(['APPROVE', 'REJECT']), note: decisionNote }).strict(),
  z.object({ reply: z.enum(['WORK_TOGETHER', 'NOT_WORK_TOGETHER']) }).strict(),
])
export const peerDecisionSchema = z.union([
  z.object({ requestId: z.string().min(1), decision: z.enum(['APPROVE', 'REJECT', 'NEEDS_INFO']), note: decisionNote }).strict(),
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
export const reviewStageSchema = z.object({ periodId: z.string().min(1) }).strict()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date (YYYY-MM-DD)')
export const setupRoundSchema = z.object({
  name: z.string().trim().min(2, 'Name the quarter').max(80), startDate: dateSchema, endDate: dateSchema, weekOneStartsOn: dateSchema,
  questionWeeks: z.number().int().min(1).max(26).optional(), reviewDeadline: dateSchema.optional(),
}).strict()
export const roundActionSchema = z.object({ action: z.enum(['open-review', 'open-round']) }).strict()
export const roundPeopleActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept-warning'), cycleId: z.string().min(1), userId: z.string().min(1), warning: z.enum(['NO_LEAD', 'FEW_PEERS']), reason: reasonSchema }).strict(),
  z.object({
    action: z.literal('change'), cycleId: z.string().min(1), userId: z.string().min(1), otherId: z.string().min(1),
    relation: z.enum(['PEER', 'LEAD', 'REPORT']), change: z.enum(['ADD', 'REMOVE']), reason: reasonSchema,
  }).strict(),
])
export const roundResultsActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('release-report'), employeeId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('mark-released') }).strict(),
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

