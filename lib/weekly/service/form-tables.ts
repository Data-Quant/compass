// HR's end-of-quarter evaluations as tables: a row per person, a 1 to 4 column per rating question (quarter steps
// allowed), and a total.
// "HR" is HR's own HR form; "PARTNER" is every evaluation mapped to a partner HR fills in on their behalf.
import type { Prisma, RelationshipType } from '@prisma/client'
import { getDeptEvaluationPoolContext, groupDeptAssignmentsByDepartment, pickRepresentativeDeptAssignment } from '@/lib/dept-evaluation-pool'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignmentForPair, getResolvedEvaluationAssignments, type ResolvedEvaluationAssignment } from '@/lib/evaluation-assignments'
import { getResolvedEvaluationQuestions } from '@/lib/pre-evaluation'
import { evaluateeExclusion, isOutsideRedesign } from '../eligibility'
import { formatKarachiDate } from '../format'
import { hrFilledPartnerNames, isHrFilledPartner } from '../partners'
import { isFormRelationshipType } from '../perspectives'
import type { FormInput } from '../schemas'
import { isTableScore } from '../table-scores'
import type { FormStatusValue, FormTableKind, FormTableQuestion, FormTableRow, FormTablesResponse, FormTableView, PersonRef } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { cycleSummary, findRunningCycle, loadCycle, roundOpensAt, type CycleWithPeriod } from './cycles'
import { WeeklyError } from './errors'
import { assertFourRatingQuota, HR_SLOT_CLOSED, writeFormRows } from './form-submit'
import { formsOpenDate, formsOpenFor, formStatuses, formUnits } from './forms'

const TABLE_ORDER: RelationshipType[] = ['C_LEVEL', 'DEPT', 'HR', 'TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'CROSS_DEPARTMENT']
const NOT_FOUND = 'Evaluation not found'

interface TableUnit { evaluateeId: string; evaluateeIds: string[]; name: string; position: string | null; department: string | null }

function unitOf(assignment: ResolvedEvaluationAssignment, evaluateeIds: string[]): TableUnit {
  const person = assignment.evaluatee
  return { evaluateeId: assignment.evaluateeId, evaluateeIds, name: person?.name ?? 'Unknown person', position: person?.position ?? null, department: person?.department ?? null }
}

/**
 * The quarter the tables work on: the running round's, a chosen round's, or an earlier quarter (one run on the earlier
 * evaluations, with no weekly round) that HR is finishing here. An earlier quarter is open until HR closes (locks) it.
 */
interface TableScope { periodId: string; name: string; cycle: CycleWithPeriod | null; open: boolean; opensAt: string | null; endDate: Date }

function cycleScope(cycle: CycleWithPeriod, now: Date): TableScope {
  return { periodId: cycle.periodId, name: cycle.period.name, cycle, open: formsOpenFor(cycle, now), opensAt: formsOpenDate(cycle).toISOString(), endDate: cycle.period.endDate }
}

async function scopeFor(periodId: string | undefined, now: Date): Promise<TableScope | null> {
  if (!periodId) {
    const running = await findRunningCycle()
    return running ? cycleScope(running, now) : null
  }
  const row = await prisma.weeklyCycle.findUnique({ where: { periodId }, select: { id: true } })
  if (row) return cycleScope(await loadCycle(row.id), now)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { name: true, endDate: true } })
  if (!period) throw new WeeklyError('Quarter not found', 404)
  return { periodId, name: period.name, cycle: null, open: true, opensAt: null, endDate: period.endDate }
}

/**
 * People this quarter evaluates: not leavers, late joiners (unless HR opted them in), 3E or named leaders. An earlier
 * quarter keeps its own rules, as of its last day: nobody who had left by then or joined after it.
 */
async function evaluatedIds(scope: TableScope, ids: Iterable<string>, now: Date): Promise<Set<string>> {
  const people = await loadPeople(ids)
  const cycle = scope.cycle
  if (!cycle) {
    const asOf = { now: scope.endDate, opensAt: scope.endDate, optedIn: false }
    return new Set([...people.values()].filter((p) => !evaluateeExclusion(p, asOf)).map((p) => p.id))
  }
  const optIns = new Set((await prisma.weeklyParticipantOverride.findMany({ where: { cycleId: cycle.id, optIn: true }, select: { userId: true } })).map((o) => o.userId))
  return new Set([...people.values()]
    .filter((p) => !isOutsideRedesign(p) && !evaluateeExclusion(p, { now, opensAt: roundOpensAt(cycle), optedIn: optIns.has(p.id) }))
    .map((p) => p.id))
}

/** One row per assignment, except a department, which is one row for all its members. Needs `includeUsers`. */
function tableUnits(type: RelationshipType, assignments: readonly ResolvedEvaluationAssignment[], evaluated: ReadonlySet<string>): TableUnit[] {
  const mine = assignments.filter((a) => a.relationshipType === type && evaluated.has(a.evaluateeId))
  const units = type === 'DEPT'
    ? [...groupDeptAssignmentsByDepartment([...mine]).values()].map((group) => unitOf(pickRepresentativeDeptAssignment(group), group.map((g) => g.evaluateeId)))
    : mine.map((a) => unitOf(a, [a.evaluateeId]))
  return units.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The rating questions this evaluator answers for this relationship: the bank's, plus a lead's own pre-evaluation
 * questions for TEAM_LEAD, as on every other form. Written comments are not part of the table.
 */
async function tableQuestions(periodId: string, evaluatorId: string, type: RelationshipType, evaluateeId: string): Promise<FormTableQuestion[]> {
  const resolved = await getResolvedEvaluationQuestions({ relationshipType: type, periodId, evaluatorId, evaluateeId })
  if (resolved.error) throw new WeeklyError(resolved.error, 409)
  // A department's own weekly topics apply only to that department, so they are not columns everyone must fill.
  const topics = await prisma.weeklyCompetency.findMany({ where: { sourceQuestionId: { not: null } }, select: { sourceQuestionId: true, departments: true } })
  const common = new Set(topics.filter((t) => t.departments.length === 0).map((t) => t.sourceQuestionId))
  const departmentOnly = new Set(topics.filter((t) => t.departments.length > 0 && !common.has(t.sourceQuestionId)).map((t) => t.sourceQuestionId))
  return resolved.questions.filter((q) => q.questionType === 'RATING' && !(q.sourceType === 'GLOBAL' && departmentOnly.has(q.id))).map((q) => {
    const d = q.ratingDescriptions
    return { id: q.id, source: q.sourceType, text: q.questionText, ratingDescriptions: { '1': d?.[1] ?? null, '2': d?.[2] ?? null, '3': d?.[3] ?? null, '4': d?.[4] ?? null } }
  })
}

async function partnerEvaluators(): Promise<PersonRef[]> {
  const names = hrFilledPartnerNames()
  if (names.length === 0) return []
  const users = await prisma.user.findMany({ where: { OR: names.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })) }, select: { id: true, name: true, position: true } })
  return users.filter((u) => isHrFilledPartner(u.name)).sort((a, b) => a.name.localeCompare(b.name))
}

type SavedRow = { evaluatorId: string; evaluateeId: string; questionId: string | null; leadQuestionId: string | null; ratingValue: number | null; submittedAt: Date | null }

function savedRows(db: Prisma.TransactionClient | typeof prisma, periodId: string, evaluatorId: string | null, evaluateeIds: readonly string[], questions: readonly FormTableQuestion[]): Promise<SavedRow[]> {
  const globals = questions.filter((q) => q.source === 'GLOBAL').map((q) => q.id)
  const leads = questions.filter((q) => q.source === 'LEAD').map((q) => q.id)
  if (evaluateeIds.length === 0 || questions.length === 0) return Promise.resolve([])
  return db.evaluation.findMany({
    where: { periodId, evaluateeId: { in: [...evaluateeIds] }, ...(evaluatorId ? { evaluatorId } : {}), OR: [{ questionId: { in: globals } }, { leadQuestionId: { in: leads } }] },
    select: { evaluatorId: true, evaluateeId: true, questionId: true, leadQuestionId: true, ratingValue: true, submittedAt: true },
  })
}

async function rowsFor(periodId: string, evaluatorId: string, type: RelationshipType, units: readonly TableUnit[], questions: readonly FormTableQuestion[]): Promise<FormTableRow[]> {
  // For HR every evaluator's rows are read: one HR evaluator per person counts.
  const saved = await savedRows(prisma, periodId, type === 'HR' ? null : evaluatorId, units.map((u) => u.evaluateeId), questions)
  return units.map((unit) => {
    const forPerson = saved.filter((s) => s.evaluateeId === unit.evaluateeId)
    const mine = forPerson.filter((s) => s.evaluatorId === evaluatorId)
    const otherHr = type === 'HR' ? forPerson.find((s) => s.evaluatorId !== evaluatorId && s.submittedAt)?.evaluatorId : undefined
    const status: FormStatusValue = mine.some((s) => s.submittedAt)
      ? 'SUBMITTED'
      : otherHr ? 'CLOSED_BY_OTHER' : mine.length > 0 ? 'DRAFT' : 'NOT_STARTED'
    // A row another HR evaluator submitted shows their scores (read-only), not blanks that look lost.
    const shown = status === 'CLOSED_BY_OTHER' ? forPerson.filter((s) => s.evaluatorId === otherHr) : mine
    const ratings = Object.fromEntries(questions.map((q) => [q.id, shown.find((s) => (q.source === 'LEAD' ? s.leadQuestionId : s.questionId) === q.id)?.ratingValue ?? null]))
    const scored = Object.values(ratings).filter((v): v is number => v !== null)
    return {
      evaluateeId: unit.evaluateeId, name: unit.name, designation: unit.position, department: unit.department,
      memberCount: unit.evaluateeIds.length, status, ratings, total: scored.length ? scored.reduce((a, b) => a + b, 0) : null,
    }
  })
}

async function tablesFor(scope: TableScope, evaluator: PersonRef, types: readonly RelationshipType[], now: Date): Promise<FormTableView[]> {
  const assignments = await getResolvedEvaluationAssignments(scope.periodId, { evaluatorId: evaluator.id, includeUsers: true })
  const evaluated = await evaluatedIds(scope, assignments.map((a) => a.evaluateeId), now)
  const tables = await Promise.all(TABLE_ORDER.filter((type) => types.includes(type)).map(async (type) => {
    const units = tableUnits(type, assignments, evaluated)
    if (units.length === 0) return null
    const questions = await tableQuestions(scope.periodId, evaluator.id, type, units[0].evaluateeId)
    return { evaluator, relationshipType: type, questions, rows: await rowsFor(scope.periodId, evaluator.id, type, units, questions) }
  }))
  return tables.filter((t): t is FormTableView => t !== null)
}

async function isLocked(periodId: string): Promise<boolean> {
  return (await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { isLocked: true } }))?.isLocked ?? false
}

/** The tables for the running round, or for `periodId` (a chosen round, or an earlier quarter HR is finishing). */
export async function formTables(actor: WeeklyActor, kind: FormTableKind, now: Date, periodId?: string): Promise<FormTablesResponse> {
  assertHr(actor)
  const scope = await scopeFor(periodId, now)
  if (!scope) return { cycle: null, quarter: null, open: false, locked: false, opensAt: null, tables: [] }
  const tables = kind === 'HR'
    ? await tablesFor(scope, { id: actor.id, name: actor.name, position: actor.position }, ['HR'], now)
    : (await Promise.all((await partnerEvaluators()).map((partner) => tablesFor(scope, partner, TABLE_ORDER.filter((t) => t !== 'HR'), now)))).flat()
  return {
    cycle: scope.cycle ? cycleSummary(scope.cycle, now) : null, quarter: { periodId: scope.periodId, name: scope.name, earlier: scope.cycle === null },
    open: scope.open, locked: await isLocked(scope.periodId), opensAt: scope.opensAt, tables,
  }
}

export interface TableRowInput {
  kind: FormTableKind
  evaluatorId: string
  relationshipType: RelationshipType
  evaluateeId: string
  ratings: Array<{ questionId: string; questionSource?: 'GLOBAL' | 'LEAD'; ratingValue: number | null }>
  submit: boolean
  /** The quarter, when it is not the running round's (an earlier quarter HR is finishing). */
  periodId?: string
}

async function checkEvaluator(actor: WeeklyActor, input: TableRowInput): Promise<void> {
  if (input.kind === 'HR') {
    if (input.evaluatorId !== actor.id || input.relationshipType !== 'HR') throw new WeeklyError(NOT_FOUND, 404)
    return
  }
  const evaluator = await prisma.user.findUnique({ where: { id: input.evaluatorId }, select: { name: true } })
  if (!evaluator || !isHrFilledPartner(evaluator.name) || input.relationshipType === 'HR') throw new WeeklyError(NOT_FOUND, 404)
}

/** Saves one row as a draft, or submits it once every question is scored. A submitted row changes only by submitting again. */
export async function saveTableRow(actor: WeeklyActor, input: TableRowInput, now: Date): Promise<{ status: FormStatusValue }> {
  assertHr(actor)
  await checkEvaluator(actor, input)
  const scope = await scopeFor(input.periodId, now)
  if (!scope) throw new WeeklyError('There is no weekly quarter running', 409)
  // Locked first: a closed earlier quarter says so, rather than that its forms are not open.
  if (await isLocked(scope.periodId)) throw new WeeklyError('This quarter is locked, so its evaluations can no longer change', 409)
  if (!scope.open) throw new WeeklyError(scope.opensAt ? `End-of-quarter evaluations open on ${formatKarachiDate(scope.opensAt)}` : 'This quarter’s evaluations are closed', 409)
  const assignment = await getResolvedEvaluationAssignmentForPair(scope.periodId, input.evaluatorId, input.evaluateeId, input.relationshipType)
  if (!assignment || !(await evaluatedIds(scope, [input.evaluateeId], now)).has(input.evaluateeId)) throw new WeeklyError(NOT_FOUND, 404)
  const periodId = scope.periodId

  const questions = await tableQuestions(periodId, input.evaluatorId, input.relationshipType, input.evaluateeId)
  const known = new Map(questions.map((q) => [q.id, q]))
  const ratings = new Map<string, number | null>()
  for (const r of input.ratings) {
    const question = known.get(r.questionId)
    if (!question || (r.questionSource ?? 'GLOBAL') !== question.source) throw new WeeklyError('One or more questions are not part of this evaluation')
    if (ratings.has(r.questionId)) throw new WeeklyError('Duplicate question responses are not allowed')
    if (r.ratingValue !== null && !isTableScore(r.ratingValue)) throw new WeeklyError('Scores go from 1 to 4 in steps of 0.25')
    ratings.set(r.questionId, r.ratingValue)
  }
  if (input.submit && questions.some((q) => !ratings.get(q.id))) throw new WeeklyError('Score every question before submitting this row')

  const pool = input.relationshipType === 'DEPT' ? await getDeptEvaluationPoolContext({ periodId, evaluatorId: input.evaluatorId, evaluateeId: input.evaluateeId }) : null
  const unit = {
    relationshipType: input.relationshipType, evaluateeId: input.evaluateeId, evaluateeIds: pool?.evaluateeIds ?? [input.evaluateeId],
    name: assignment.evaluatee?.name ?? '', position: assignment.evaluatee?.position ?? null, department: assignment.evaluatee?.department ?? null,
  }
  const responses: FormInput['responses'] = [...ratings].map(([questionId, ratingValue]) => ({ questionId, questionSource: known.get(questionId)!.source, ratingValue, textResponse: null }))

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-form:${periodId}:${input.evaluatorId}`}))::text`
    if (input.relationshipType === 'HR') await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-hr-form:${periodId}:${input.evaluateeId}`}))::text`
    // Checked under the locks, so a draft save racing a submit can never un-submit the row.
    const saved = await savedRows(tx, periodId, input.relationshipType === 'HR' ? null : input.evaluatorId, [input.evaluateeId], questions)
    if (input.relationshipType === 'HR' && saved.some((s) => s.evaluatorId !== input.evaluatorId && s.submittedAt)) throw new WeeklyError(HR_SLOT_CLOSED, 409)
    if (!input.submit && saved.some((s) => s.evaluatorId === input.evaluatorId && s.submittedAt)) throw new WeeklyError('This row was submitted. Submit it again to change it.', 409)
    if (input.submit && (input.relationshipType === 'C_LEVEL' || input.relationshipType === 'DEPT')) {
      await assertFourRatingQuota(input.evaluatorId, periodId, { ...unit, relationshipType: input.relationshipType }, responses)
    }
    await writeFormRows(tx, input.evaluatorId, scope, unit, responses, input.submit ? now : null)
    await recordAudit(tx, {
      cycleId: scope.cycle?.id, actorId: actor.id, actorRole: 'HR', action: input.submit ? 'TABLE_SUBMIT' : 'TABLE_SAVE', objectType: 'User', objectId: input.evaluateeId,
      after: { kind: input.kind, evaluatorId: input.evaluatorId, relationshipType: input.relationshipType },
    })
  }, { timeout: 30_000 })
  return { status: input.submit ? 'SUBMITTED' : 'DRAFT' }
}

/**
 * Every unfinished end-of-quarter evaluation, for the close screen and the daily reminder. A partner's unfinished
 * evaluations make HR the ones to remind, since HR fills them in.
 */
export async function formsProgress(periodId: string, now: Date = new Date()): Promise<{ total: number; done: number; pendingEvaluatorIds: string[] }> {
  const assignments = await getResolvedEvaluationAssignments(periodId, { includeUsers: true })
  const partners = await partnerEvaluators()
  const partnerIds = new Set(partners.map((p) => p.id))
  let total = 0
  let done = 0
  const pending = new Set<string>()
  for (const evaluatorId of new Set(assignments.filter((a) => isFormRelationshipType(a.relationshipType)).map((a) => a.evaluatorId))) {
    if (partnerIds.has(evaluatorId)) continue
    const units = formUnits(assignments.filter((a) => a.evaluatorId === evaluatorId))
    const statuses = [...(await formStatuses(periodId, evaluatorId, units)).values()]
    const finished = statuses.filter((s) => s === 'SUBMITTED' || s === 'CLOSED_BY_OTHER').length
    total += units.length
    done += finished
    if (finished < units.length) pending.add(evaluatorId)
  }
  const scope = partners.length ? await scopeFor(periodId, now) : null
  let partnersPending = false
  if (scope) {
    for (const partner of partners) {
      const mine = assignments.filter((a) => a.evaluatorId === partner.id)
      const evaluated = await evaluatedIds(scope, mine.map((a) => a.evaluateeId), now)
      for (const type of TABLE_ORDER.filter((t) => t !== 'HR')) {
        const units = tableUnits(type, mine, evaluated)
        if (units.length === 0) continue
        const rows = await rowsFor(periodId, partner.id, type, units, await tableQuestions(periodId, partner.id, type, units[0].evaluateeId))
        const finished = rows.filter((r) => r.status === 'SUBMITTED').length
        total += rows.length
        done += finished
        if (finished < rows.length) partnersPending = true
      }
    }
  }
  if (partnersPending) for (const hr of await prisma.user.findMany({ where: { role: 'HR' }, select: { id: true } })) pending.add(hr.id)
  return { total, done, pendingEvaluatorIds: [...pending] }
}
