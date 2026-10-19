// Spec 9: the C-Level, Department and HR forms, kept end-of-quarter inside the weekly module.
import { getDeptEvaluationPoolContext, groupDeptAssignmentsByDepartment, pickRepresentativeDeptAssignment } from '@/lib/dept-evaluation-pool'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignmentForPair, getResolvedEvaluationAssignments, type ResolvedEvaluationAssignment } from '@/lib/evaluation-assignments'
import { buildDepartmentEvaluationResponseKey, buildEvaluationResponseKey, getEvaluatorFourRatingQuota } from '@/lib/evaluation-rating-quota'
import { getResolvedEvaluationQuestions } from '@/lib/pre-evaluation'
import { cycleWeeks, effectiveWeek, questionWeekCount, weekStartsAt } from '../calendar'
import { formsAreOpen } from '../close-rules'
import { isHrFilledPartner } from '../partners'
import { isFormRelationshipType, type FormRelationshipType } from '../perspectives'
import type { FormDetailResponse, FormQuestionView, FormStatusValue, FormsResponse, FormSummaryView } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { cycleSummary, findRunningCycle, loadCycle, type CycleWithPeriod } from './cycles'
import { WeeklyError } from './errors'

export interface FormUnit {
  relationshipType: FormRelationshipType
  /** The person the form is opened for; for a department form, the pool's representative. */
  evaluateeId: string
  /** Everyone the answers are written for (the whole department pool for DEPT). */
  evaluateeIds: string[]
  name: string
  position: string | null
  department: string | null
}

const FORM_ORDER: Record<FormRelationshipType, number> = { C_LEVEL: 0, DEPT: 1, HR: 2 }
export const formKey = (type: FormRelationshipType, evaluateeId: string): string => `${type}:${evaluateeId}`

export function formsOpenFor(cycle: CycleWithPeriod, now: Date): boolean {
  const total = cycleWeeks(cycle)
  return formsAreOpen({ status: cycle.status, formsOpenAt: cycle.formsOpenAt, week: effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now), totalWeeks: total, now })
}

export function formsOpenDate(cycle: CycleWithPeriod): Date {
  const catchUp = weekStartsAt(cycle.weekOneStartsOn, questionWeekCount(cycleWeeks(cycle)) + 1)
  return cycle.formsOpenAt && cycle.formsOpenAt < catchUp ? cycle.formsOpenAt : catchUp
}

function unitOf(type: FormRelationshipType, assignment: ResolvedEvaluationAssignment, evaluateeIds: string[]): FormUnit {
  return {
    relationshipType: type, evaluateeId: assignment.evaluateeId, evaluateeIds,
    name: assignment.evaluatee?.name ?? 'Unknown person', position: assignment.evaluatee?.position ?? null, department: assignment.evaluatee?.department ?? null,
  }
}

/** One form per C-Level or HR assignment; one per department (all members) for DEPT. Assignments need `includeUsers`. */
export function formUnits(assignments: readonly ResolvedEvaluationAssignment[]): FormUnit[] {
  const forms = assignments.filter((a) => isFormRelationshipType(a.relationshipType))
  const single = forms.filter((a) => a.relationshipType !== 'DEPT').map((a) => unitOf(a.relationshipType as FormRelationshipType, a, [a.evaluateeId]))
  const departments = [...groupDeptAssignmentsByDepartment([...forms]).values()].map((group) =>
    unitOf('DEPT', pickRepresentativeDeptAssignment(group), group.map((g) => g.evaluateeId)),
  )
  return [...single, ...departments].sort((a, b) => FORM_ORDER[a.relationshipType] - FORM_ORDER[b.relationshipType] || a.name.localeCompare(b.name))
}

/** Submitted by this evaluator; closed because another HR evaluator submitted first; a draft; or not started. */
export async function formStatuses(periodId: string, evaluatorId: string, units: readonly FormUnit[]): Promise<Map<string, FormStatusValue>> {
  const evaluateeIds = [...new Set(units.map((u) => u.evaluateeId))]
  const rows = evaluateeIds.length === 0 ? [] : await prisma.evaluation.findMany({
    where: { periodId, evaluateeId: { in: evaluateeIds }, question: { relationshipType: { in: ['C_LEVEL', 'DEPT', 'HR'] } } },
    select: { evaluatorId: true, evaluateeId: true, submittedAt: true, question: { select: { relationshipType: true } } },
  })
  return new Map(units.map((unit) => {
    const inBank = rows.filter((r) => r.evaluateeId === unit.evaluateeId && r.question?.relationshipType === unit.relationshipType)
    const mine = inBank.filter((r) => r.evaluatorId === evaluatorId)
    const status: FormStatusValue = mine.some((r) => r.submittedAt)
      ? 'SUBMITTED'
      : unit.relationshipType === 'HR' && inBank.some((r) => r.evaluatorId !== evaluatorId && r.submittedAt)
        ? 'CLOSED_BY_OTHER'
        : mine.length > 0 ? 'DRAFT' : 'NOT_STARTED'
    return [formKey(unit.relationshipType, unit.evaluateeId), status]
  }))
}

function summaryOf(unit: FormUnit, status: FormStatusValue): FormSummaryView {
  return {
    relationshipType: unit.relationshipType, evaluatee: { id: unit.evaluateeId, name: unit.name, position: unit.position },
    department: unit.department, memberCount: unit.evaluateeIds.length, status,
  }
}

/** HR fills in its own HR forms, and every partner's evaluations, in the quarter-end tables instead. */
const OWN_FORM_TYPES = (a: { relationshipType: string }) => a.relationshipType !== 'HR'

export async function formsView(actor: WeeklyActor, now: Date): Promise<FormsResponse> {
  const cycle = await findRunningCycle()
  if (!cycle || isHrFilledPartner(actor.name)) return { cycle: cycle ? cycleSummary(cycle, now) : null, open: false, opensAt: null, forms: [] }
  const units = formUnits((await getResolvedEvaluationAssignments(cycle.periodId, { evaluatorId: actor.id, includeUsers: true })).filter(OWN_FORM_TYPES))
  const statuses = await formStatuses(cycle.periodId, actor.id, units)
  return {
    cycle: cycleSummary(cycle, now), open: formsOpenFor(cycle, now), opensAt: formsOpenDate(cycle).toISOString(),
    forms: units.map((unit) => summaryOf(unit, statuses.get(formKey(unit.relationshipType, unit.evaluateeId)) ?? 'NOT_STARTED')),
  }
}

/** The running cycle and the form unit, after checking this evaluator really has that assignment. */
export async function loadForm(actor: WeeklyActor, relationshipType: FormRelationshipType, evaluateeId: string): Promise<{ cycle: CycleWithPeriod; unit: FormUnit }> {
  const cycle = await findRunningCycle()
  if (!cycle) throw new WeeklyError('There is no weekly quarter running', 409)
  if (relationshipType === 'HR' || isHrFilledPartner(actor.name)) throw new WeeklyError('Form not found', 404)
  const assignment = await getResolvedEvaluationAssignmentForPair(cycle.periodId, actor.id, evaluateeId, relationshipType)
  if (!assignment) throw new WeeklyError('Form not found', 404)
  const pool = relationshipType === 'DEPT' ? await getDeptEvaluationPoolContext({ periodId: cycle.periodId, evaluatorId: actor.id, evaluateeId }) : null
  const person = (await loadPeople([evaluateeId])).get(evaluateeId)
  return {
    cycle,
    unit: {
      relationshipType, evaluateeId, evaluateeIds: pool?.evaluateeIds ?? [evaluateeId],
      name: person?.name ?? 'Unknown person', position: person?.position ?? null, department: person?.department ?? null,
    },
  }
}

export async function formDetail(actor: WeeklyActor, input: { relationshipType: FormRelationshipType; evaluateeId: string }, now: Date): Promise<FormDetailResponse> {
  const { cycle, unit } = await loadForm(actor, input.relationshipType, input.evaluateeId)
  const resolved = await getResolvedEvaluationQuestions({ relationshipType: input.relationshipType, periodId: cycle.periodId, evaluatorId: actor.id, evaluateeId: input.evaluateeId })
  if (resolved.error) throw new WeeklyError(resolved.error, 409)
  const ids = resolved.questions.map((q) => q.id)
  const saved = await prisma.evaluation.findMany({
    where: { periodId: cycle.periodId, evaluatorId: actor.id, evaluateeId: input.evaluateeId, OR: [{ questionId: { in: ids } }, { leadQuestionId: { in: ids } }] },
    select: { questionId: true, leadQuestionId: true, ratingValue: true, textResponse: true },
  })
  const byKey = new Map(saved.map((s) => [s.questionId ? `GLOBAL:${s.questionId}` : `LEAD:${s.leadQuestionId}`, s]))
  const status = (await formStatuses(cycle.periodId, actor.id, [unit])).get(formKey(unit.relationshipType, unit.evaluateeId)) ?? 'NOT_STARTED'
  const quota = input.relationshipType === 'HR' ? null : await formFourRatingQuota(cycle.periodId, actor.id, input.relationshipType)
  const questions: FormQuestionView[] = resolved.questions.map((q) => {
    const answer = byKey.get(`${q.sourceType}:${q.id}`)
    const d = q.ratingDescriptions
    return {
      id: q.id, source: q.sourceType, text: q.questionText, type: q.questionType,
      ratingDescriptions: d ? { '1': d[1], '2': d[2], '3': d[3], '4': d[4] } : null,
      ratingValue: answer?.ratingValue ?? null, textResponse: answer?.textResponse ?? null,
    }
  })
  return {
    ...summaryOf(unit, status), open: formsOpenFor(cycle, now), questions,
    fourRatings: quota && !quota.isExempt ? { max: quota.max, used: quota.used } : null,
  }
}

export interface FormFourRatingQuota { isExempt: boolean; totalQuestions: number; max: number; used: number }

/**
 * The classic quota (exemptions, question total, cap) with the used 4s counted from the form's own bank. The classic
 * count types each 4 by the evaluator's pair, so a C-Level 4 is missed when the same evaluator also holds that
 * person's Department form. Keys in `exclude` (the answers being resubmitted) are not counted.
 */
export async function formFourRatingQuota(periodId: string, evaluatorId: string, type: 'C_LEVEL' | 'DEPT', exclude: ReadonlySet<string> = new Set()): Promise<FormFourRatingQuota> {
  const quota = await getEvaluatorFourRatingQuota({ periodId, evaluatorId, relationshipType: type })
  if (quota.isExempt) return { isExempt: true, totalQuestions: quota.totalQuestions, max: quota.maxAllowedFourRatings, used: 0 }
  const fours = await prisma.evaluation.findMany({
    where: { periodId, evaluatorId, submittedAt: { not: null }, ratingValue: 4, questionId: { not: null }, question: { relationshipType: type } },
    select: { evaluateeId: true, questionId: true },
  })
  const departments = type === 'DEPT' ? await loadPeople(fours.map((f) => f.evaluateeId)) : new Map()
  const keys = new Set(fours.map((f) => type === 'DEPT'
    ? buildDepartmentEvaluationResponseKey(departments.get(f.evaluateeId)?.department, 'GLOBAL', f.questionId as string)
    : buildEvaluationResponseKey(f.evaluateeId, 'GLOBAL', f.questionId as string)))
  return { isExempt: false, totalQuestions: quota.totalQuestions, max: quota.maxAllowedFourRatings, used: [...keys].filter((k) => !exclude.has(k)).length }
}

export async function openForms(actor: WeeklyActor, cycleId: string, now: Date): Promise<void> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'RUNNING') throw new WeeklyError('Only a running quarter’s forms can be opened', 409)
  if (formsOpenFor(cycle, now)) return
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { formsOpenAt: now } })
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'FORMS_OPEN', objectType: 'WeeklyCycle', objectId: cycleId })
}
