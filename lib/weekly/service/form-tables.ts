// HR's end-of-quarter evaluations as tables: a row per person, a 1 to 4 column per rating question, and a total.
// "HR" is HR's own HR form; "PARTNER" is every evaluation mapped to a partner HR fills in on their behalf.
import type { Prisma, RelationshipType } from '@prisma/client'
import { getDeptEvaluationPoolContext, groupDeptAssignmentsByDepartment, pickRepresentativeDeptAssignment } from '@/lib/dept-evaluation-pool'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignmentForPair, getResolvedEvaluationAssignments, type ResolvedEvaluationAssignment } from '@/lib/evaluation-assignments'
import { getDefaultQuestionBankRelationshipType } from '@/lib/pre-evaluation'
import { formatKarachiDate } from '../format'
import { hrFilledPartnerNames, isHrFilledPartner } from '../partners'
import { isFormRelationshipType } from '../perspectives'
import type { FormInput } from '../schemas'
import type { FormStatusValue, FormTableKind, FormTableRow, FormTablesResponse, FormTableView, PersonRef } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, type WeeklyActor } from './context'
import { cycleSummary, findRunningCycle, type CycleWithPeriod } from './cycles'
import { WeeklyError } from './errors'
import { assertFourRatingQuota, HR_SLOT_CLOSED, writeFormRows } from './form-submit'
import { formsOpenDate, formsOpenFor, formStatuses, formUnits } from './forms'

const TABLE_ORDER: RelationshipType[] = ['C_LEVEL', 'DEPT', 'HR', 'TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'CROSS_DEPARTMENT']

interface TableUnit { evaluateeId: string; evaluateeIds: string[]; name: string; position: string | null; department: string | null }

function unitOf(assignment: ResolvedEvaluationAssignment, evaluateeIds: string[]): TableUnit {
  const person = assignment.evaluatee
  return { evaluateeId: assignment.evaluateeId, evaluateeIds, name: person?.name ?? 'Unknown person', position: person?.position ?? null, department: person?.department ?? null }
}

/** One row per assignment, except a department, which is one row for all its members. Needs `includeUsers`. */
function tableUnits(type: RelationshipType, assignments: readonly ResolvedEvaluationAssignment[]): TableUnit[] {
  const mine = assignments.filter((a) => a.relationshipType === type)
  const units = type === 'DEPT'
    ? [...groupDeptAssignmentsByDepartment([...mine]).values()].map((group) => unitOf(pickRepresentativeDeptAssignment(group), group.map((g) => g.evaluateeId)))
    : mine.map((a) => unitOf(a, [a.evaluateeId]))
  return units.sort((a, b) => a.name.localeCompare(b.name))
}

/** The rating questions of the bank a relationship is asked from; written comments are not part of the table. */
async function ratingQuestions(type: RelationshipType) {
  return prisma.evaluationQuestion.findMany({
    where: { relationshipType: getDefaultQuestionBankRelationshipType(type), questionType: 'RATING' },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, questionText: true, rating1Description: true, rating2Description: true, rating3Description: true, rating4Description: true },
  })
}

async function partnerEvaluators(): Promise<PersonRef[]> {
  const names = hrFilledPartnerNames()
  if (names.length === 0) return []
  const users = await prisma.user.findMany({ where: { OR: names.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })) }, select: { id: true, name: true, position: true } })
  return users.filter((u) => isHrFilledPartner(u.name)).sort((a, b) => a.name.localeCompare(b.name))
}

async function rowsFor(periodId: string, evaluatorId: string, type: RelationshipType, units: readonly TableUnit[], questionIds: readonly string[]): Promise<FormTableRow[]> {
  const evaluateeIds = units.map((u) => u.evaluateeId)
  const saved = evaluateeIds.length === 0 || questionIds.length === 0 ? [] : await prisma.evaluation.findMany({
    where: { periodId, evaluateeId: { in: evaluateeIds }, questionId: { in: [...questionIds] }, ...(type === 'HR' ? {} : { evaluatorId }) },
    select: { evaluatorId: true, evaluateeId: true, questionId: true, ratingValue: true, submittedAt: true },
  })
  return units.map((unit) => {
    const forPerson = saved.filter((s) => s.evaluateeId === unit.evaluateeId)
    const mine = forPerson.filter((s) => s.evaluatorId === evaluatorId)
    const status: FormStatusValue = mine.some((s) => s.submittedAt)
      ? 'SUBMITTED'
      : type === 'HR' && forPerson.some((s) => s.evaluatorId !== evaluatorId && s.submittedAt)
        ? 'CLOSED_BY_OTHER'
        : mine.length > 0 ? 'DRAFT' : 'NOT_STARTED'
    const ratings = Object.fromEntries(questionIds.map((id) => [id, mine.find((s) => s.questionId === id)?.ratingValue ?? null]))
    const scored = Object.values(ratings).filter((v): v is number => v !== null)
    return {
      evaluateeId: unit.evaluateeId, name: unit.name, designation: unit.position, department: unit.department,
      memberCount: unit.evaluateeIds.length, status, ratings, total: scored.length ? scored.reduce((a, b) => a + b, 0) : null,
    }
  })
}

async function tablesFor(cycle: CycleWithPeriod, evaluator: PersonRef, types: readonly RelationshipType[]): Promise<FormTableView[]> {
  const assignments = await getResolvedEvaluationAssignments(cycle.periodId, { evaluatorId: evaluator.id, includeUsers: true })
  const present = TABLE_ORDER.filter((type) => types.includes(type) && assignments.some((a) => a.relationshipType === type))
  return Promise.all(present.map(async (type) => {
    const questions = await ratingQuestions(type)
    const units = tableUnits(type, assignments)
    return {
      evaluator, relationshipType: type,
      questions: questions.map((q) => ({ id: q.id, text: q.questionText, ratingDescriptions: { '1': q.rating1Description, '2': q.rating2Description, '3': q.rating3Description, '4': q.rating4Description } })),
      rows: await rowsFor(cycle.periodId, evaluator.id, type, units, questions.map((q) => q.id)),
    }
  }))
}

export async function formTables(actor: WeeklyActor, kind: FormTableKind, now: Date): Promise<FormTablesResponse> {
  assertHr(actor)
  const cycle = await findRunningCycle()
  if (!cycle) return { cycle: null, open: false, opensAt: null, tables: [] }
  const tables = kind === 'HR'
    ? await tablesFor(cycle, { id: actor.id, name: actor.name, position: actor.position }, ['HR'])
    : (await Promise.all((await partnerEvaluators()).map((partner) => tablesFor(cycle, partner, TABLE_ORDER.filter((t) => t !== 'HR'))))).flat()
  return { cycle: cycleSummary(cycle, now), open: formsOpenFor(cycle, now), opensAt: formsOpenDate(cycle).toISOString(), tables }
}

export interface TableRowInput {
  kind: FormTableKind
  evaluatorId: string
  relationshipType: RelationshipType
  evaluateeId: string
  ratings: Array<{ questionId: string; ratingValue: number | null }>
  submit: boolean
}

async function checkEvaluator(actor: WeeklyActor, input: TableRowInput): Promise<void> {
  if (input.kind === 'HR') {
    if (input.evaluatorId !== actor.id || input.relationshipType !== 'HR') throw new WeeklyError('Evaluation not found', 404)
    return
  }
  const evaluator = await prisma.user.findUnique({ where: { id: input.evaluatorId }, select: { name: true } })
  if (!evaluator || !isHrFilledPartner(evaluator.name) || input.relationshipType === 'HR') throw new WeeklyError('Evaluation not found', 404)
}

/** Saves one row as a draft, or submits it once every question is scored. A submitted row changes only by submitting again. */
export async function saveTableRow(actor: WeeklyActor, input: TableRowInput, now: Date): Promise<{ status: FormStatusValue }> {
  assertHr(actor)
  await checkEvaluator(actor, input)
  const cycle = await findRunningCycle()
  if (!cycle) throw new WeeklyError('There is no weekly quarter running', 409)
  if (!formsOpenFor(cycle, now)) throw new WeeklyError(`End-of-quarter evaluations open on ${formatKarachiDate(formsOpenDate(cycle).toISOString())}`, 409)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: cycle.periodId }, select: { isLocked: true } })
  if (period?.isLocked) throw new WeeklyError('This quarter is locked, so its evaluations can no longer change', 409)
  const assignment = await getResolvedEvaluationAssignmentForPair(cycle.periodId, input.evaluatorId, input.evaluateeId, input.relationshipType)
  if (!assignment) throw new WeeklyError('Evaluation not found', 404)

  const questions = await ratingQuestions(input.relationshipType)
  const known = new Set(questions.map((q) => q.id))
  const ratings = new Map<string, number | null>()
  for (const r of input.ratings) {
    if (!known.has(r.questionId)) throw new WeeklyError('One or more questions are not part of this evaluation')
    if (ratings.has(r.questionId)) throw new WeeklyError('Duplicate question responses are not allowed')
    ratings.set(r.questionId, r.ratingValue)
  }
  if (input.submit && questions.some((q) => !ratings.get(q.id))) throw new WeeklyError('Score every question before submitting this row')

  const pool = input.relationshipType === 'DEPT' ? await getDeptEvaluationPoolContext({ periodId: cycle.periodId, evaluatorId: input.evaluatorId, evaluateeId: input.evaluateeId }) : null
  const unit = {
    relationshipType: input.relationshipType, evaluateeId: input.evaluateeId, evaluateeIds: pool?.evaluateeIds ?? [input.evaluateeId],
    name: assignment.evaluatee?.name ?? '', position: assignment.evaluatee?.position ?? null, department: assignment.evaluatee?.department ?? null,
  }
  const responses: FormInput['responses'] = [...ratings].map(([questionId, ratingValue]) => ({ questionId, questionSource: 'GLOBAL' as const, ratingValue, textResponse: null }))
  const [row] = await rowsFor(cycle.periodId, input.evaluatorId, input.relationshipType, [unit], questions.map((q) => q.id))
  if (row.status === 'CLOSED_BY_OTHER') throw new WeeklyError(HR_SLOT_CLOSED, 409)
  if (row.status === 'SUBMITTED' && !input.submit) throw new WeeklyError('This row was submitted. Submit it again to change it.', 409)

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-form:${cycle.periodId}:${input.evaluatorId}`}))::text`
    if (input.submit && input.relationshipType === 'HR') {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-hr-form:${cycle.periodId}:${input.evaluateeId}`}))::text`
      const others = await tx.evaluation.count({
        where: { periodId: cycle.periodId, evaluateeId: input.evaluateeId, evaluatorId: { not: input.evaluatorId }, submittedAt: { not: null }, question: { relationshipType: 'HR' } },
      })
      if (others > 0) throw new WeeklyError(HR_SLOT_CLOSED, 409)
    }
    if (input.submit && (input.relationshipType === 'C_LEVEL' || input.relationshipType === 'DEPT')) {
      await assertFourRatingQuota(input.evaluatorId, cycle.periodId, { ...unit, relationshipType: input.relationshipType }, responses)
    }
    await writeFormRows(tx, input.evaluatorId, cycle, unit, responses, input.submit ? now : null)
    await recordAudit(tx, {
      cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: input.submit ? 'TABLE_SUBMIT' : 'TABLE_SAVE', objectType: 'User', objectId: input.evaluateeId,
      after: { kind: input.kind, evaluatorId: input.evaluatorId, relationshipType: input.relationshipType },
    })
  }, { timeout: 30_000 })
  return { status: input.submit ? 'SUBMITTED' : 'DRAFT' }
}

/**
 * Every unfinished end-of-quarter evaluation, for the close screen and the daily reminder. A partner's unfinished
 * evaluations make HR the ones to remind, since HR fills them in.
 */
export async function formsProgress(periodId: string): Promise<{ total: number; done: number; pendingEvaluatorIds: string[] }> {
  const assignments = await getResolvedEvaluationAssignments(periodId, { includeUsers: true })
  const partners = await partnerEvaluators()
  const partnerIds = new Set(partners.map((p) => p.id))
  let total = 0
  let done = 0
  const pending = new Set<string>()
  let partnersPending = false
  for (const evaluatorId of new Set(assignments.filter((a) => isFormRelationshipType(a.relationshipType)).map((a) => a.evaluatorId))) {
    if (partnerIds.has(evaluatorId)) continue
    const units = formUnits(assignments.filter((a) => a.evaluatorId === evaluatorId))
    const statuses = [...(await formStatuses(periodId, evaluatorId, units)).values()]
    const finished = statuses.filter((s) => s === 'SUBMITTED' || s === 'CLOSED_BY_OTHER').length
    total += units.length
    done += finished
    if (finished < units.length) pending.add(evaluatorId)
  }
  for (const partner of partners) {
    const mine = assignments.filter((a) => a.evaluatorId === partner.id)
    for (const type of TABLE_ORDER.filter((t) => t !== 'HR' && mine.some((a) => a.relationshipType === t))) {
      const questions = await ratingQuestions(type)
      const rows = await rowsFor(periodId, partner.id, type, tableUnits(type, mine), questions.map((q) => q.id))
      total += rows.length
      const finished = rows.filter((r) => r.status === 'SUBMITTED').length
      done += finished
      if (finished < rows.length) partnersPending = true
    }
  }
  if (partnersPending) for (const hr of await prisma.user.findMany({ where: { role: 'HR' }, select: { id: true } })) pending.add(hr.id)
  return { total, done, pendingEvaluatorIds: [...pending] }
}

