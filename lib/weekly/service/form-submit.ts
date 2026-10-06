import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  buildDepartmentEvaluationResponseKey, buildEvaluationResponseKey, countFourRatingsForResponses, validateFourRatingQuota,
} from '@/lib/evaluation-rating-quota'
import { isEvaluationResponseComplete, normalizeEvaluationTextResponse, ratingRequiresExplanation } from '@/lib/evaluation-response'
import { getResolvedEvaluationQuestions } from '@/lib/pre-evaluation'
import { formatKarachiDate } from '../format'
import type { FormInput } from '../schemas'
import type { WeeklyActor } from './context'
import type { CycleWithPeriod } from './cycles'
import { WeeklyError } from './errors'
import { formFourRatingQuota, formKey, formsOpenDate, formsOpenFor, formStatuses, loadForm, type FormUnit } from './forms'

export const HR_SLOT_CLOSED = 'An HR evaluation has already been submitted for this employee. This HR slot is closed.'
type Responses = FormInput['responses']

async function prepare(actor: WeeklyActor, input: FormInput, now: Date) {
  const { cycle, unit } = await loadForm(actor, input.relationshipType, input.evaluateeId)
  if (!formsOpenFor(cycle, now)) throw new WeeklyError(`End-of-quarter forms open on ${formatKarachiDate(formsOpenDate(cycle).toISOString())}`, 409)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: cycle.periodId }, select: { isLocked: true } })
  if (period?.isLocked) throw new WeeklyError('This quarter is locked, so its forms can no longer change', 409)
  const resolved = await getResolvedEvaluationQuestions({ relationshipType: input.relationshipType, periodId: cycle.periodId, evaluatorId: actor.id, evaluateeId: input.evaluateeId })
  if (resolved.error) throw new WeeklyError(resolved.error, 409)
  const questions = new Map<string, (typeof resolved.questions)[number]>(resolved.questions.map((q) => [`${q.sourceType}:${q.id}`, q]))
  const seen = new Set<string>()
  for (const response of input.responses) {
    const key = `${response.questionSource}:${response.questionId}`
    if (!questions.has(key)) throw new WeeklyError('One or more questions are not valid for this form')
    if (seen.has(key)) throw new WeeklyError('Duplicate question responses are not allowed')
    seen.add(key)
  }
  return { cycle, unit, questions }
}

/** Same row shape as the classic form; a department form is written for every member of the pool. */
export async function writeFormRows(tx: Prisma.TransactionClient, evaluatorId: string, cycle: CycleWithPeriod, unit: Pick<FormUnit, 'evaluateeIds'>, responses: Responses, submittedAt: Date | null): Promise<void> {
  for (const evaluateeId of unit.evaluateeIds) {
    for (const response of responses) {
      const where = {
        evaluatorId, evaluateeId, periodId: cycle.periodId,
        questionId: response.questionSource === 'GLOBAL' ? response.questionId : null,
        leadQuestionId: response.questionSource === 'LEAD' ? response.questionId : null,
      }
      const data = { ratingValue: response.ratingValue ?? null, textResponse: normalizeEvaluationTextResponse(response.textResponse), submittedAt }
      const existing = await tx.evaluation.findFirst({ where, select: { id: true } })
      if (existing) await tx.evaluation.update({ where: { id: existing.id }, data })
      else await tx.evaluation.create({ data: { ...where, ...data } })
    }
  }
}

export async function saveFormDraft(actor: WeeklyActor, input: FormInput, now: Date): Promise<{ savedAt: string }> {
  const { cycle, unit } = await prepare(actor, input, now)
  const status = (await formStatuses(cycle.periodId, actor.id, [unit])).get(formKey(unit.relationshipType, unit.evaluateeId))
  if (status === 'SUBMITTED') throw new WeeklyError('This form was submitted. Submit it again to change it.', 409)
  if (status === 'CLOSED_BY_OTHER') throw new WeeklyError(HR_SLOT_CLOSED, 409)
  await prisma.$transaction((tx) => writeFormRows(tx, actor.id, cycle, unit, input.responses, null))
  return { savedAt: now.toISOString() }
}

export async function assertFourRatingQuota(evaluatorId: string, periodId: string, unit: FormUnit & { relationshipType: 'C_LEVEL' | 'DEPT' }, responses: Responses): Promise<void> {
  const keys = new Set(
    responses.map((r) =>
      unit.relationshipType === 'DEPT'
        ? buildDepartmentEvaluationResponseKey(unit.department, r.questionSource, r.questionId)
        : buildEvaluationResponseKey(unit.evaluateeId, r.questionSource, r.questionId),
    ),
  )
  // Read outside the transaction: the advisory lock already serialises this evaluator's submissions.
  const quota = await formFourRatingQuota(periodId, evaluatorId, unit.relationshipType, keys)
  if (quota.isExempt) return
  const check = validateFourRatingQuota({ totalQuestions: quota.totalQuestions, usedFourRatings: quota.used, pendingFourRatings: countFourRatingsForResponses(responses) })
  if (check.wouldExceed) {
    throw new WeeklyError(`Ratings of 4 are capped at ${check.maxAllowedFourRatings} across your ${quota.totalQuestions} questions of this kind this quarter. You have already used ${quota.used}.`)
  }
}

export async function submitForm(actor: WeeklyActor, input: FormInput, now: Date): Promise<{ submitted: number }> {
  const { cycle, unit, questions } = await prepare(actor, input, now)
  const answered = new Map<string, Responses[number]>(input.responses.map((r) => [`${r.questionSource}:${r.questionId}`, r]))
  for (const [key, question] of questions) {
    if (question.questionType !== 'RATING') continue
    const response = answered.get(key)
    if (!isEvaluationResponseComplete({ questionType: 'RATING', ratingValue: response?.ratingValue, textResponse: response?.textResponse })) {
      throw new WeeklyError(
        ratingRequiresExplanation(response?.ratingValue)
          ? `Explanation is required for ratings of 1 or 4 on "${question.questionText}".`
          : `A rating is required for "${question.questionText}".`,
      )
    }
  }
  return prisma.$transaction(
    async (tx) => {
      // One evaluator's submissions run one at a time (the 4s cap); one person's HR slot too.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-form:${cycle.periodId}:${actor.id}`}))::text`
      if (unit.relationshipType === 'HR') {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-hr-form:${cycle.periodId}:${unit.evaluateeId}`}))::text`
        const others = await tx.evaluation.count({
          where: { periodId: cycle.periodId, evaluateeId: unit.evaluateeId, evaluatorId: { not: actor.id }, submittedAt: { not: null }, question: { relationshipType: 'HR' } },
        })
        if (others > 0) throw new WeeklyError(HR_SLOT_CLOSED, 409)
      } else {
        await assertFourRatingQuota(actor.id, cycle.periodId, { ...unit, relationshipType: unit.relationshipType }, input.responses)
      }
      await writeFormRows(tx, actor.id, cycle, unit, input.responses, now)
      return { submitted: input.responses.length }
    },
    { timeout: 30_000 },
  )
}
