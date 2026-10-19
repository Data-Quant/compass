// UX spec, section 11: the weekly company sentiment question. HR keeps a bank per quarter; each week of the round
// everyone gets the next question, and the last week repeats the eNPS question for a start-and-end comparison. It never
// counts toward a score. Each answer can be anonymous: stored with no user, and with the department only when at least
// five from that department answered that question anonymously that week.
import type { SurveyQuestionKind } from '@prisma/client'
import { prisma } from '@/lib/db'
import { cycleWeeks, effectiveWeek, questionWeekCount } from '../calendar'
import type { MySurveyResponse, SurveyQuestionView, SurveyResultsResponse } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { findRunningCycle, loadCycle } from './cycles'
import { isUniqueViolation } from './db'
import { WeeklyError } from './errors'

export const CONFIDENTIALITY_NOTICE = 'Your answer is confidential to HR. It is never shared with your lead, your colleagues or anyone outside HR, and it does not affect your performance evaluation. Tick “Submit this answer anonymously” if you would rather HR did not see your name on it.'
/** An anonymous answer's department is shown, and kept, only when at least this many from it answered that week. */
export const MIN_DEPARTMENT_GROUP = 5

interface DefaultQuestion { text: string; kind: SurveyQuestionKind; options?: string[]; required?: boolean; explainChoice?: boolean }

/** The current quarter's bank from HR's document: questions 1 to 11 required, 12 optional. */
export const DEFAULT_SURVEY: DefaultQuestion[] = [
  { text: 'How likely are you to recommend Plutus 21 as a place to work to a friend?', kind: 'NPS' },
  { text: 'Overall, I am happy working at Plutus 21.', kind: 'AGREE' },
  { text: 'I believe in the direction Plutus 21 is heading.', kind: 'AGREE' },
  { text: 'Leadership listens to employees and acts on their feedback.', kind: 'AGREE' },
  { text: 'My work is recognised and valued.', kind: 'AGREE' },
  { text: 'I feel fairly rewarded for the work I do.', kind: 'AGREE' },
  { text: 'I feel part of Plutus 21, not only my team or client account.', kind: 'AGREE' },
  {
    text: 'Where do you usually first hear about important changes at Plutus 21?', kind: 'CHOICE',
    options: ['From leadership directly', 'From my manager', 'From colleagues informally', 'From the client', 'I often only find out when it affects my work'],
  },
  {
    text: 'Which best describes your career outlook at Plutus 21?', kind: 'CHOICE',
    options: ['I can see a clear next step for me here', 'I can grow here but the path is unclear', 'I am learning but not progressing', 'I do not see a future for my career here'],
  },
  {
    text: 'How would you describe your workload in a typical week?', kind: 'CHOICE',
    options: ['Too light, I have spare capacity', 'About right', 'Busy but manageable', 'Too heavy, I often work extra hours', 'Unsustainable, I am close to burning out'],
  },
  {
    text: 'Which one of these would most improve your experience at Plutus 21?', kind: 'CHOICE', explainChoice: true,
    options: ['Pay and benefits', 'Career growth', 'Recognition', 'Manager support', 'Leadership communication', 'Workload and flexibility', 'Tools and processes', 'Team connection', 'Other'],
  },
  { text: 'If you could change one thing about Plutus 21, what would it be and why?', kind: 'TEXT', required: false },
]

function viewOf(q: { id: string; orderIndex: number; text: string; kind: SurveyQuestionKind; options: string[]; required: boolean; explainChoice: boolean }): SurveyQuestionView {
  return { id: q.id, orderIndex: q.orderIndex, text: q.text, kind: q.kind, options: q.options, required: q.required, explainChoice: q.explainChoice }
}

async function activeBank(periodId: string) {
  return prisma.surveyQuestion.findMany({ where: { periodId, removedAt: null }, orderBy: { orderIndex: 'asc' } })
}

/**
 * One question a week across the round's weeks; the eNPS repeat goes in the last week when there is a week to spare. A
 * shorter round drops the repeat first, then asks more than one a week.
 */
export function surveyDueWeeks(bankSize: number, totalWeeks: number): { weeks: number[]; repeatWeek: number | null } {
  const weeks = Math.max(1, totalWeeks)
  const perWeek = Math.max(1, Math.ceil(bankSize / weeks))
  return { weeks: Array.from({ length: bankSize }, (_, i) => Math.floor(i / perWeek) + 1), repeatWeek: bankSize < weeks ? weeks : null }
}

async function surveyWeek(now: Date) {
  const cycle = await findRunningCycle()
  if (!cycle) return null
  const total = cycleWeeks(cycle)
  const week = Math.min(total, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now)))
  return { cycle, week }
}

/** This week's questions and any earlier ones not yet answered. Each question keeps the week it was scheduled for. */
export async function mySurvey(actor: WeeklyActor, now: Date): Promise<MySurveyResponse> {
  const at = await surveyWeek(now)
  if (!at) return { periodName: null, week: null, questions: [], notice: CONFIDENTIALITY_NOTICE }
  const bank = await activeBank(at.cycle.periodId)
  const answered = new Set((await prisma.surveyCompletion.findMany({ where: { periodId: at.cycle.periodId, userId: actor.id }, select: { questionId: true } })).map((c) => c.questionId))
  const due = bank.filter((q) => q.dueWeek <= at.week && !answered.has(q.id)).sort((a, b) => a.dueWeek - b.dueWeek || a.orderIndex - b.orderIndex)
  return { periodName: at.cycle.period.name, week: at.week, questions: due.map(viewOf), notice: CONFIDENTIALITY_NOTICE }
}

export interface SurveyAnswerInput { questionId: string; value?: number | null; choice?: string | null; text?: string | null; anonymous?: boolean }

function checkAnswer(q: { kind: SurveyQuestionKind; options: string[]; explainChoice: boolean; required: boolean; text: string }, a: SurveyAnswerInput): { value: number | null; choice: string | null; text: string | null } {
  const text = a.text?.trim() || null
  switch (q.kind) {
    case 'NPS':
      if (a.value == null || !Number.isInteger(a.value) || a.value < 0 || a.value > 10) throw new WeeklyError(`Choose 0 to 10 for “${q.text}”`)
      return { value: a.value, choice: null, text }
    case 'AGREE':
      if (a.value == null || !Number.isInteger(a.value) || a.value < 1 || a.value > 5) throw new WeeklyError(`Choose an answer for “${q.text}”`)
      if (a.value <= 2 && !text) throw new WeeklyError(`Tell us why you disagree with “${q.text}”`)
      return { value: a.value, choice: null, text }
    case 'CHOICE':
      if (!a.choice || !q.options.includes(a.choice)) throw new WeeklyError(`Choose one of the options for “${q.text}”`)
      if (q.explainChoice && !text) throw new WeeklyError(`Explain your choice for “${q.text}” and how it could be improved`)
      return { value: null, choice: a.choice, text }
    case 'TEXT':
      if (q.required && !text) throw new WeeklyError(`Answer “${q.text}”`)
      return { value: null, choice: null, text }
  }
}

/** Saves answers; each anonymous one carries no user, only the department. A question is answered once. */
export async function submitSurvey(actor: WeeklyActor, input: { answers: SurveyAnswerInput[] }, now: Date): Promise<{ saved: number }> {
  const at = await surveyWeek(now)
  if (!at) throw new WeeklyError('There is no survey running', 409)
  const mine = await mySurvey(actor, now)
  const due = new Map(mine.questions.map((q) => [q.id, q]))
  const bank = new Map((await activeBank(at.cycle.periodId)).map((q) => [q.id, q]))
  // A question HR removed while the form was open is skipped rather than failing the rest.
  const rows = input.answers.filter((a) => bank.has(a.questionId)).map((a) => {
    if (!due.has(a.questionId)) throw new WeeklyError('You already answered this question', 409)
    return { questionId: a.questionId, anonymous: a.anonymous === true, ...checkAnswer(bank.get(a.questionId)!, a) }
  })
  if (new Set(rows.map((r) => r.questionId)).size !== rows.length) throw new WeeklyError('Each question can be answered once')
  // Completions record the week only, and answers carry no time and a random id, so an anonymous answer cannot be
  // matched to its author by when it was saved. The answers are written in a shuffled order for the same reason.
  const answers = rows.filter((r) => r.value !== null || r.choice !== null || r.text !== null).sort(() => Math.random() - 0.5)
  try {
    await prisma.$transaction(async (tx) => {
      // The completion rows are claimed first, so a double submit fails as a whole.
      await tx.surveyCompletion.createMany({ data: rows.map((r) => ({ periodId: at.cycle.periodId, questionId: r.questionId, userId: actor.id, weekIndex: at.week })) })
      if (answers.length) {
        await tx.surveyResponse.createMany({
          data: answers.map(({ anonymous, ...r }) => ({ periodId: at.cycle.periodId, weekIndex: at.week, userId: anonymous ? null : actor.id, department: anonymous ? actor.department ?? null : null, ...r })),
        })
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new WeeklyError('You already answered this question', 409)
    throw error
  }
  return { saved: rows.length }
}

export async function surveyBank(actor: WeeklyActor, periodId: string): Promise<SurveyQuestionView[]> {
  assertHr(actor)
  return (await activeBank(periodId)).map(viewOf)
}

/** The round's weeks (13 when the quarter has no weekly cycle yet) and its current week. */
async function periodWeeks(periodId: string, now: Date): Promise<{ totalWeeks: number; week: number }> {
  const row = await prisma.weeklyCycle.findUnique({ where: { periodId }, select: { id: true } })
  if (!row) return { totalWeeks: 13, week: 1 }
  const cycle = await loadCycle(row.id)
  const totalWeeks = cycleWeeks(cycle)
  return { totalWeeks, week: Math.min(totalWeeks, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now))) }
}

/** Loads the standard bank: one question a week, and the eNPS repeat in the last week when the round has room. */
export async function loadDefaultSurvey(actor: WeeklyActor, periodId: string, now: Date = new Date()): Promise<void> {
  assertHr(actor)
  const { totalWeeks } = await periodWeeks(periodId, now)
  const schedule = surveyDueWeeks(DEFAULT_SURVEY.length, totalWeeks)
  const enps = DEFAULT_SURVEY[0]
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`survey-bank:${periodId}`}))::text`
    if ((await tx.surveyQuestion.count({ where: { periodId, removedAt: null } })) > 0) throw new WeeklyError('This quarter already has questions', 409)
    const toRow = (q: DefaultQuestion, orderIndex: number, dueWeek: number) => ({
      periodId, orderIndex, dueWeek, text: q.text, kind: q.kind, options: q.options ?? [], required: q.required ?? true, explainChoice: q.explainChoice ?? false,
    })
    await tx.surveyQuestion.createMany({
      data: [
        ...DEFAULT_SURVEY.map((q, i) => toRow(q, i, schedule.weeks[i])),
        ...(schedule.repeatWeek ? [toRow(enps, DEFAULT_SURVEY.length, schedule.repeatWeek)] : []),
      ],
    })
  })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'SURVEY_LOAD_DEFAULT', objectType: 'EvaluationPeriod', objectId: periodId })
}

/** A new question is asked from the current week; the others keep their weeks. Only written answers can be optional. */
export async function addSurveyQuestion(
  actor: WeeklyActor, periodId: string, input: { text: string; kind: SurveyQuestionKind; options?: string[]; required?: boolean; explainChoice?: boolean },
  now: Date = new Date(),
): Promise<void> {
  assertHr(actor)
  const { week } = await periodWeeks(periodId, now)
  if (input.kind === 'CHOICE' && (input.options ?? []).length < 2) throw new WeeklyError('A multiple-choice question needs at least two options')
  const last = await prisma.surveyQuestion.aggregate({ where: { periodId }, _max: { orderIndex: true } })
  const created = await prisma.surveyQuestion.create({
    data: {
      periodId, orderIndex: (last._max.orderIndex ?? -1) + 1, dueWeek: week, text: input.text.trim(), kind: input.kind,
      options: input.kind === 'CHOICE' ? input.options ?? [] : [], required: input.kind === 'TEXT' ? input.required ?? true : true, explainChoice: input.kind === 'CHOICE' && (input.explainChoice ?? false),
    },
  })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'SURVEY_ADD', objectType: 'SurveyQuestion', objectId: created.id })
}

export async function removeSurveyQuestion(actor: WeeklyActor, questionId: string): Promise<void> {
  assertHr(actor)
  const removed = await prisma.surveyQuestion.updateMany({ where: { id: questionId, removedAt: null }, data: { removedAt: new Date() } })
  if (removed.count === 0) throw new WeeklyError('Question not found', 404)
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'SURVEY_REMOVE', objectType: 'SurveyQuestion', objectId: questionId })
}

/** Counts per answer, eNPS for the 0 to 10 question, and written answers with a name only when not anonymous. */
export async function surveyResults(actor: WeeklyActor, periodId: string): Promise<SurveyResultsResponse> {
  assertHr(actor)
  const [bank, responses] = await Promise.all([
    prisma.surveyQuestion.findMany({ where: { periodId }, orderBy: { orderIndex: 'asc' } }),
    // Ordered by the random id, so the list says nothing about who answered when.
    prisma.surveyResponse.findMany({ where: { periodId }, orderBy: { id: 'asc' } }),
  ])
  const people = await loadPeople(responses.flatMap((r) => (r.userId ? [r.userId] : [])))
  const shownDepartment = await anonymousGroups(periodId)
  const questions = bank.filter((q) => q.removedAt === null || responses.some((r) => r.questionId === q.id)).map((q) => {
    const mine = responses.filter((r) => r.questionId === q.id)
    const keys = q.kind === 'NPS' ? Array.from({ length: 11 }, (_, i) => String(i)) : q.kind === 'AGREE' ? ['1', '2', '3', '4', '5'] : q.kind === 'CHOICE' ? q.options : []
    const counts = Object.fromEntries(keys.map((k) => [k, mine.filter((r) => (q.kind === 'CHOICE' ? r.choice : String(r.value)) === k).length]))
    const values = mine.flatMap((r) => (r.value === null ? [] : [r.value]))
    const enps = q.kind === 'NPS' && values.length
      ? Math.round(((values.filter((v) => v >= 9).length - values.filter((v) => v <= 6).length) / values.length) * 100)
      : null
    return {
      id: q.id, orderIndex: q.orderIndex, text: q.text, kind: q.kind, removed: q.removedAt !== null, responses: mine.length, counts, enps,
      average: q.kind === 'AGREE' && values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null,
      comments: mine.flatMap((r) => (r.text ? [{
        text: r.text, choice: r.choice, name: r.userId ? people.get(r.userId)?.name ?? 'Unknown' : null,
        department: !r.userId && r.department && shownDepartment(r.questionId, r.weekIndex, r.department) ? r.department : null,
      }] : [])),
    }
  })
  return { questions }
}

/**
 * How many anonymous answers each (question, week, department) has. The department of an anonymous answer is shown, and
 * kept, only when at least five from it answered that question anonymously that week, so named answers from the same
 * department can never be subtracted to find the anonymous one. Counted by the department stored with the answer.
 */
async function anonymousGroups(periodId: string): Promise<(questionId: string, week: number, department: string) => boolean> {
  const rows = await prisma.surveyResponse.groupBy({ by: ['questionId', 'weekIndex', 'department'], where: { periodId, userId: null, department: { not: null } }, _count: { _all: true } })
  const counts = new Map(rows.map((r) => [`${r.questionId}|${r.weekIndex}|${r.department}`, r._count._all]))
  return (questionId, week, department) => (counts.get(`${questionId}|${week}|${department}`) ?? 0) >= MIN_DEPARTMENT_GROUP
}

/**
 * Daily: once a week is over (or the round has finished), an anonymous answer whose department group is under five
 * loses its department.
 */
export async function scrubSmallDepartments(now: Date): Promise<number> {
  const cycles = await prisma.weeklyCycle.findMany({ where: { status: { not: 'SETUP' } }, select: { id: true } })
  let scrubbed = 0
  for (const { id } of cycles) {
    const cycle = await loadCycle(id)
    const current = effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now)
    const shown = await anonymousGroups(cycle.periodId)
    const rows = await prisma.surveyResponse.findMany({
      where: { periodId: cycle.periodId, userId: null, department: { not: null }, ...(cycle.status === 'RUNNING' ? { weekIndex: { lt: current } } : {}) },
      select: { id: true, questionId: true, weekIndex: true, department: true },
    })
    const small = rows.filter((r) => !shown(r.questionId, r.weekIndex, r.department as string)).map((r) => r.id)
    if (small.length) scrubbed += (await prisma.surveyResponse.updateMany({ where: { id: { in: small } }, data: { department: null } })).count
  }
  return scrubbed
}
