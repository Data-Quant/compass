// An earlier quarter (one run on the earlier evaluations, with no weekly round) finished late: once HR reopens it to
// employees, each person sees what they have left of it on their Evaluations page and fills it in on the same form
// as the quarter-end forms, until HR closes the quarter. HR's own HR forms and the partners' evaluations stay in HR's
// tables, and the 10% cap on 4s works as it did for the quarter.
import type { Prisma, RelationshipType } from '@prisma/client'
import { getDeptEvaluationPoolContext, groupDeptAssignmentsByDepartment, pickRepresentativeDeptAssignment } from '@/lib/dept-evaluation-pool'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignmentForPair, getResolvedEvaluationAssignments, type ResolvedEvaluationAssignment } from '@/lib/evaluation-assignments'
import {
  buildDepartmentEvaluationResponseKey, buildEvaluationResponseKey, countFourRatingsForResponses, getEvaluatorFourRatingQuota, validateFourRatingQuota,
} from '@/lib/evaluation-rating-quota'
import { isEvaluationResponseComplete, ratingRequiresExplanation } from '@/lib/evaluation-response'
import type { PersonFacts } from '../eligibility'
import { isHrFilledPartner } from '../partners'
import type { FormInput } from '../schemas'
import type { FormQuestionView, FormStatusValue, LateFormDetailResponse, LateFormsProgress, LateFormsResponse, LateFormSummaryView, LateFormTypeValue } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { WeeklyError } from './errors'
import { writeFormRows } from './form-submit'
import { evaluatedAtQuarterEnd, quarterEndQuestions, type QuarterEndQuestion } from './quarter-end'

export const LATE_FORM_TYPES: readonly LateFormTypeValue[] = ['C_LEVEL', 'DEPT', 'TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'CROSS_DEPARTMENT']
const isLateFormType = (type: RelationshipType): type is LateFormTypeValue => (LATE_FORM_TYPES as readonly string[]).includes(type)
const NOT_FOUND = 'Form not found'
const CLOSED = 'This quarter’s evaluations are closed'

interface LateQuarter { id: string; name: string; endDate: Date }
interface LateUnit { relationshipType: LateFormTypeValue; evaluateeId: string; evaluateeIds: string[]; name: string; position: string | null; department: string | null }
interface QuestionKeys { global: Set<string>; lead: Set<string> }
type SavedRow = { evaluatorId: string; evaluateeId: string; questionId: string | null; leadQuestionId: string | null; submittedAt: Date | null }
type Db = Prisma.TransactionClient | typeof prisma
type Responses = FormInput['responses']
export interface LateFormRef { periodId: string; relationshipType: LateFormTypeValue; evaluateeId: string }
export interface LateFormInput extends LateFormRef { responses: Responses }

/** The earlier quarter employees can finish: HR reopened it to them and has not closed it. */
export async function lateQuarter(): Promise<LateQuarter | null> {
  const withRounds = (await prisma.weeklyCycle.findMany({ select: { periodId: true } })).map((c) => c.periodId)
  return prisma.evaluationPeriod.findFirst({
    where: { id: { notIn: withRounds }, lateFormsOpenedAt: { not: null }, isLocked: false },
    orderBy: { endDate: 'desc' },
    select: { id: true, name: true, endDate: true },
  })
}

/** Still here, joined by the quarter's end, and not a partner (HR fills the partners' evaluations in). */
function owesEvaluations(person: PersonFacts | undefined, quarter: LateQuarter, now: Date): boolean {
  if (!person || isHrFilledPartner(person.name) || !person.payrollActive) return false
  if (person.exitDate && person.exitDate <= now) return false
  return !(person.joiningDate && person.joiningDate > quarter.endDate)
}

function unitOf(type: LateFormTypeValue, assignment: ResolvedEvaluationAssignment, evaluateeIds: string[]): LateUnit {
  const person = assignment.evaluatee
  return { relationshipType: type, evaluateeId: assignment.evaluateeId, evaluateeIds, name: person?.name ?? 'Unknown person', position: person?.position ?? null, department: person?.department ?? null }
}

/** One form per assignment, except a department, which is one form for all its members. Needs `includeUsers`. */
function lateUnits(assignments: readonly ResolvedEvaluationAssignment[], evaluated: ReadonlySet<string>): LateUnit[] {
  const mine = assignments.filter((a) => isLateFormType(a.relationshipType) && evaluated.has(a.evaluateeId))
  const single = mine.filter((a) => a.relationshipType !== 'DEPT').map((a) => unitOf(a.relationshipType as LateFormTypeValue, a, [a.evaluateeId]))
  const departments = [...groupDeptAssignmentsByDepartment(mine.filter((a) => a.relationshipType === 'DEPT')).values()]
    .map((group) => unitOf('DEPT', pickRepresentativeDeptAssignment(group), group.map((g) => g.evaluateeId)))
  return [...single, ...departments].sort((a, b) => LATE_FORM_TYPES.indexOf(a.relationshipType) - LATE_FORM_TYPES.indexOf(b.relationshipType) || a.name.localeCompare(b.name))
}

const keysOf = (questions: readonly QuarterEndQuestion[]): QuestionKeys => ({
  global: new Set(questions.filter((q) => q.sourceType === 'GLOBAL').map((q) => q.id)),
  lead: new Set(questions.filter((q) => q.sourceType === 'LEAD').map((q) => q.id)),
})

/** Question ids per kind of form: the bank is per kind and a lead's own questions per lead, never per person evaluated. */
function questionKeysLoader(periodId: string): (evaluatorId: string, unit: LateUnit) => Promise<QuestionKeys> {
  const cache = new Map<string, Promise<QuestionKeys>>()
  return (evaluatorId, unit) => {
    const key = unit.relationshipType === 'TEAM_LEAD' ? `TEAM_LEAD:${evaluatorId}` : unit.relationshipType
    if (!cache.has(key)) {
      // A kind with no questions configured has no form to fill in.
      cache.set(key, quarterEndQuestions(periodId, evaluatorId, unit.relationshipType, unit.evaluateeId).then(keysOf, () => keysOf([])))
    }
    return cache.get(key)!
  }
}

function statusOf(rows: readonly Pick<SavedRow, 'submittedAt'>[]): FormStatusValue {
  return rows.some((r) => r.submittedAt) ? 'SUBMITTED' : rows.length > 0 ? 'DRAFT' : 'NOT_STARTED'
}

/**
 * Submitted once anything for this person was submitted in the quarter, on whatever questions it had then (the bank
 * may have changed since), so nobody is asked to redo a finished evaluation; a draft only on today's questions.
 */
function formStatus(rows: readonly SavedRow[], evaluatorId: string, evaluateeId: string, keys: QuestionKeys): FormStatusValue {
  const theirs = rows.filter((r) => r.evaluatorId === evaluatorId && r.evaluateeId === evaluateeId)
  if (theirs.some((r) => r.submittedAt)) return 'SUBMITTED'
  return statusOf(theirs.filter((r) => (r.questionId ? keys.global.has(r.questionId) : r.leadQuestionId !== null && keys.lead.has(r.leadQuestionId))))
}

/** Every form each evaluator owes the quarter (or just `evaluatorId`'s), with where it stands. */
async function owedForms(quarter: LateQuarter, now: Date, evaluatorId?: string): Promise<Map<string, Array<{ unit: LateUnit; status: FormStatusValue }>>> {
  const assignments = (await getResolvedEvaluationAssignments(quarter.id, { evaluatorId, includeUsers: true })).filter((a) => isLateFormType(a.relationshipType))
  const people = await loadPeople(assignments.map((a) => a.evaluatorId))
  const evaluators = [...new Set(assignments.map((a) => a.evaluatorId))].filter((id) => owesEvaluations(people.get(id), quarter, now))
  const evaluated = await evaluatedAtQuarterEnd(quarter.endDate, assignments.map((a) => a.evaluateeId))
  const rows = evaluators.length === 0 ? [] : await prisma.evaluation.findMany({
    where: { periodId: quarter.id, evaluatorId: { in: evaluators } },
    select: { evaluatorId: true, evaluateeId: true, questionId: true, leadQuestionId: true, submittedAt: true },
  })
  const keysFor = questionKeysLoader(quarter.id)
  const owed = new Map<string, Array<{ unit: LateUnit; status: FormStatusValue }>>()
  for (const id of evaluators) {
    const forms: Array<{ unit: LateUnit; status: FormStatusValue }> = []
    for (const unit of lateUnits(assignments.filter((a) => a.evaluatorId === id), evaluated)) {
      const keys = await keysFor(id, unit)
      if (keys.global.size + keys.lead.size === 0) continue
      forms.push({ unit, status: formStatus(rows, id, unit.evaluateeId, keys) })
    }
    owed.set(id, forms)
  }
  return owed
}

function summaryOf(unit: LateUnit, status: FormStatusValue): LateFormSummaryView {
  return {
    relationshipType: unit.relationshipType, evaluatee: { id: unit.evaluateeId, name: unit.name, position: unit.position },
    department: unit.department, memberCount: unit.evaluateeIds.length, status,
  }
}

/** What this person has left of the quarter employees are finishing; nothing when no quarter is reopened. */
export async function lateFormsView(actor: WeeklyActor, now: Date = new Date()): Promise<LateFormsResponse> {
  const quarter = await lateQuarter()
  if (!quarter) return { quarter: null, total: 0, forms: [] }
  const forms = (await owedForms(quarter, now, actor.id)).get(actor.id) ?? []
  return {
    quarter: { periodId: quarter.id, name: quarter.name }, total: forms.length,
    forms: forms.filter((f) => f.status !== 'SUBMITTED').map((f) => summaryOf(f.unit, f.status)),
  }
}

/** For HR: whether employees can finish this earlier quarter, and who still has evaluations left in it. */
export async function lateFormsProgress(periodId: string, now: Date = new Date()): Promise<LateFormsProgress> {
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { id: true, name: true, endDate: true, lateFormsOpenedAt: true } })
  if (!period) throw new WeeklyError('Quarter not found', 404)
  const owed = await owedForms(period, now)
  const people = await loadPeople(owed.keys())
  const behind = [...owed]
    .map(([id, forms]) => ({ id, name: people.get(id)?.name ?? 'Unknown person', position: people.get(id)?.position ?? null, left: forms.filter((f) => f.status !== 'SUBMITTED').length }))
    .filter((p) => p.left > 0)
    .sort((a, b) => b.left - a.left || a.name.localeCompare(b.name))
  return { openedAt: period.lateFormsOpenedAt?.toISOString() ?? null, left: behind.reduce((sum, p) => sum + p.left, 0), people: behind }
}

/** HR lets employees finish an earlier quarter late, or stops it. One quarter at a time; closing the quarter stops it too. */
export async function setLateForms(actor: WeeklyActor, periodId: string, open: boolean, now: Date): Promise<void> {
  assertHr(actor)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { name: true, isLocked: true, lateFormsOpenedAt: true } })
  if (!period) throw new WeeklyError('Quarter not found', 404)
  if ((await prisma.weeklyCycle.count({ where: { periodId } })) > 0) throw new WeeklyError('Only a quarter run on the earlier evaluations can be reopened to employees', 409)
  if (open === Boolean(period.lateFormsOpenedAt)) throw new WeeklyError(open ? 'Employees can already finish this quarter' : 'Employees are not finishing this quarter', 409)
  if (open) {
    if (period.isLocked) throw new WeeklyError('This quarter is closed. Reopen it first.', 409)
    const other = await lateQuarter()
    if (other && other.id !== periodId) throw new WeeklyError(`Employees are finishing ${other.name}. Stop that first.`, 409)
  }
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { lateFormsOpenedAt: open ? now : null } })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: open ? 'LATE_FORMS_OPEN' : 'LATE_FORMS_STOP', objectType: 'EvaluationPeriod', objectId: periodId })
}

/** The form, after checking the quarter is still open to employees and this person really owes it. */
async function loadLateForm(actor: WeeklyActor, ref: LateFormRef, now: Date): Promise<{ quarter: LateQuarter; unit: LateUnit; questions: QuarterEndQuestion[] }> {
  const quarter = await lateQuarter()
  if (!quarter || quarter.id !== ref.periodId) throw new WeeklyError(CLOSED, 409)
  if (!owesEvaluations((await loadPeople([actor.id])).get(actor.id), quarter, now)) throw new WeeklyError(NOT_FOUND, 404)
  const assignment = await getResolvedEvaluationAssignmentForPair(quarter.id, actor.id, ref.evaluateeId, ref.relationshipType)
  if (!assignment || !(await evaluatedAtQuarterEnd(quarter.endDate, [ref.evaluateeId])).has(ref.evaluateeId)) throw new WeeklyError(NOT_FOUND, 404)
  const pool = ref.relationshipType === 'DEPT' ? await getDeptEvaluationPoolContext({ periodId: quarter.id, evaluatorId: actor.id, evaluateeId: ref.evaluateeId }) : null
  // A department form is written for the members the quarter evaluates, as listed; nobody who had left or joined later.
  const members = pool ? await evaluatedAtQuarterEnd(quarter.endDate, pool.evaluateeIds) : null
  const person = (await loadPeople([ref.evaluateeId])).get(ref.evaluateeId)
  const unit: LateUnit = {
    relationshipType: ref.relationshipType, evaluateeId: ref.evaluateeId,
    evaluateeIds: members ? [ref.evaluateeId, ...[...members].filter((id) => id !== ref.evaluateeId)] : [ref.evaluateeId],
    name: person?.name ?? 'Unknown person', position: person?.position ?? null, department: person?.department ?? null,
  }
  return { quarter, unit, questions: await quarterEndQuestions(quarter.id, actor.id, ref.relationshipType, ref.evaluateeId) }
}

function savedAnswers(db: Db, periodId: string, evaluatorId: string, evaluateeId: string, questions: readonly QuarterEndQuestion[]) {
  const keys = keysOf(questions)
  return db.evaluation.findMany({
    where: { periodId, evaluatorId, evaluateeId, OR: [{ questionId: { in: [...keys.global] } }, { leadQuestionId: { in: [...keys.lead] } }] },
    select: { questionId: true, leadQuestionId: true, submittedAt: true, ratingValue: true, textResponse: true },
  })
}

export async function lateFormDetail(actor: WeeklyActor, ref: LateFormRef, now: Date = new Date()): Promise<LateFormDetailResponse> {
  const { quarter, unit, questions } = await loadLateForm(actor, ref, now)
  const saved = await savedAnswers(prisma, quarter.id, actor.id, unit.evaluateeId, questions)
  const status = (await submittedBefore(prisma, quarter.id, actor.id, unit.evaluateeIds)) ? 'SUBMITTED' : statusOf(saved)
  const byKey = new Map(saved.map((s) => [s.questionId ? `GLOBAL:${s.questionId}` : `LEAD:${s.leadQuestionId}`, s]))
  const quota = await getEvaluatorFourRatingQuota({ periodId: quarter.id, evaluatorId: actor.id, relationshipType: unit.relationshipType })
  const views: FormQuestionView[] = questions.map((q) => {
    const answer = byKey.get(`${q.sourceType}:${q.id}`)
    const d = q.ratingDescriptions
    return {
      id: q.id, source: q.sourceType, text: q.questionText, type: q.questionType,
      ratingDescriptions: d ? { '1': d[1], '2': d[2], '3': d[3], '4': d[4] } : null,
      ratingValue: answer?.ratingValue ?? null, textResponse: answer?.textResponse ?? null,
    }
  })
  return {
    ...summaryOf(unit, status), periodId: quarter.id, questions: views,
    fourRatings: quota.isExempt ? null : { max: quota.maxAllowedFourRatings, used: quota.usedFourRatings },
  }
}

function checkResponses(questions: readonly QuarterEndQuestion[], responses: Responses): void {
  const known = new Set(questions.map((q) => `${q.sourceType}:${q.id}`))
  const seen = new Set<string>()
  for (const response of responses) {
    const key = `${response.questionSource}:${response.questionId}`
    if (!known.has(key)) throw new WeeklyError('One or more questions are not valid for this form')
    if (seen.has(key)) throw new WeeklyError('Duplicate question responses are not allowed')
    seen.add(key)
  }
}

/**
 * One evaluator's saves run one at a time (the 4s cap), and only while the quarter is still open to employees. The
 * period row is held (FOR SHARE) until the save commits, so HR closing the quarter waits for it, and the other way round.
 */
async function lockOpenQuarter(tx: Prisma.TransactionClient, periodId: string, evaluatorId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-form:${periodId}:${evaluatorId}`}))::text`
  const [period] = await tx.$queryRaw<Array<{ isLocked: boolean; lateFormsOpenedAt: Date | null }>>`
    SELECT "isLocked", "lateFormsOpenedAt" FROM "EvaluationPeriod" WHERE id = ${periodId} FOR SHARE`
  if (!period || period.isLocked || !period.lateFormsOpenedAt) throw new WeeklyError(CLOSED, 409)
}

/** A late form is filled in once: what was submitted (now or under the earlier evaluations) is never overwritten. */
async function submittedBefore(db: Db, periodId: string, evaluatorId: string, evaluateeIds: readonly string[]): Promise<boolean> {
  return (await db.evaluation.count({ where: { periodId, evaluatorId, evaluateeId: { in: [...evaluateeIds] }, submittedAt: { not: null } } })) > 0
}
const ALREADY_SUBMITTED = 'You already submitted this evaluation, so it can no longer change.'

export async function saveLateFormDraft(actor: WeeklyActor, input: LateFormInput, now: Date = new Date()): Promise<{ savedAt: string }> {
  const { quarter, unit, questions } = await loadLateForm(actor, input, now)
  checkResponses(questions, input.responses)
  await prisma.$transaction(async (tx) => {
    await lockOpenQuarter(tx, quarter.id, actor.id)
    if (await submittedBefore(tx, quarter.id, actor.id, unit.evaluateeIds)) throw new WeeklyError(ALREADY_SUBMITTED, 409)
    await writeFormRows(tx, actor.id, { periodId: quarter.id }, unit, input.responses, null)
  })
  return { savedAt: now.toISOString() }
}

/** The quarter's 10% cap on 4s, per kind of evaluation, as the earlier evaluations counted it. Partners and Hamiz are exempt. */
async function assertFourRatingCap(evaluatorId: string, periodId: string, unit: LateUnit, responses: Responses): Promise<void> {
  const keys = new Set(responses.map((r) => unit.relationshipType === 'DEPT'
    ? buildDepartmentEvaluationResponseKey(unit.department, r.questionSource, r.questionId)
    : buildEvaluationResponseKey(unit.evaluateeId, r.questionSource, r.questionId)))
  const quota = await getEvaluatorFourRatingQuota({ periodId, evaluatorId, relationshipType: unit.relationshipType, excludeResponseKeys: keys })
  if (quota.isExempt) return
  const check = validateFourRatingQuota({ totalQuestions: quota.totalQuestions, usedFourRatings: quota.usedFourRatings, pendingFourRatings: countFourRatingsForResponses(responses) })
  if (check.wouldExceed) {
    throw new WeeklyError(`Ratings of 4 are capped at ${check.maxAllowedFourRatings} across your ${quota.totalQuestions} questions of this kind this quarter. You have already used ${quota.usedFourRatings}.`)
  }
}

export async function submitLateForm(actor: WeeklyActor, input: LateFormInput, now: Date = new Date()): Promise<{ submitted: number }> {
  const { quarter, unit, questions } = await loadLateForm(actor, input, now)
  checkResponses(questions, input.responses)
  const answered = new Map(input.responses.map((r) => [`${r.questionSource}:${r.questionId}`, r]))
  for (const question of questions) {
    if (question.questionType !== 'RATING') continue
    const response = answered.get(`${question.sourceType}:${question.id}`)
    if (!isEvaluationResponseComplete({ questionType: 'RATING', ratingValue: response?.ratingValue, textResponse: response?.textResponse })) {
      throw new WeeklyError(
        ratingRequiresExplanation(response?.ratingValue)
          ? `Explanation is required for ratings of 1 or 4 on "${question.questionText}".`
          : `A rating is required for "${question.questionText}".`,
      )
    }
  }
  return prisma.$transaction(async (tx) => {
    await lockOpenQuarter(tx, quarter.id, actor.id)
    if (await submittedBefore(tx, quarter.id, actor.id, unit.evaluateeIds)) throw new WeeklyError(ALREADY_SUBMITTED, 409)
    // Read outside the transaction: the advisory lock already serialises this evaluator's submissions.
    await assertFourRatingCap(actor.id, quarter.id, unit, input.responses)
    await writeFormRows(tx, actor.id, { periodId: quarter.id }, unit, input.responses, now)
    await recordAudit(tx, {
      actorId: actor.id, actorRole: actor.role, action: 'LATE_FORM_SUBMIT', objectType: 'User', objectId: unit.evaluateeId,
      after: { periodId: quarter.id, relationshipType: unit.relationshipType },
    })
    return { submitted: input.responses.length }
  }, { timeout: 30_000 })
}
