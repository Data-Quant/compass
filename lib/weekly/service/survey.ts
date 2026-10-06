// Section 5 of HR's feedback: the weekly company sentiment survey. HR keeps a question bank per quarter; each week
// everyone gets the next one or two questions (bank size over the question weeks), alongside their evaluation questions.
// A person can answer a week anonymously: those answers are stored with no user at all.
import type { SurveyQuestionKind } from '@prisma/client'
import { prisma } from '@/lib/db'
import { cycleWeeks, effectiveWeek, questionWeekCount } from '../calendar'
import type { MySurveyResponse, SurveyQuestionView, SurveyResultsResponse } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { findRunningCycle, loadCycle } from './cycles'
import { isUniqueViolation } from './db'
import { WeeklyError } from './errors'

export const AGREE_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'] as const
export const CONFIDENTIALITY_NOTICE = 'All responses are confidential to HR. Tick “answer anonymously” and this week’s answers are saved without your name.'

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

/** One or two a week: the whole bank spread over the question weeks. */
export function surveyQuestionsPerWeek(bankSize: number, questionWeeks: number): number {
  return bankSize === 0 ? 0 : Math.max(1, Math.ceil(bankSize / Math.max(1, questionWeeks)))
}

async function surveyWeek(now: Date) {
  const cycle = await findRunningCycle()
  if (!cycle) return null
  const total = cycleWeeks(cycle)
  const week = Math.min(total, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now)))
  return { cycle, week, questionWeeks: questionWeekCount(total) }
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

export interface SurveyAnswerInput { questionId: string; value?: number | null; choice?: string | null; text?: string | null }

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

/** Saves this week's answers; with `anonymous` they carry no user. A question is answered once. */
export async function submitSurvey(actor: WeeklyActor, input: { anonymous: boolean; answers: SurveyAnswerInput[] }, now: Date): Promise<{ saved: number }> {
  const at = await surveyWeek(now)
  if (!at) throw new WeeklyError('There is no survey running', 409)
  const mine = await mySurvey(actor, now)
  const due = new Map(mine.questions.map((q) => [q.id, q]))
  const bank = new Map((await activeBank(at.cycle.periodId)).map((q) => [q.id, q]))
  // A question HR removed while the form was open is skipped rather than failing the rest.
  const rows = input.answers.filter((a) => bank.has(a.questionId)).map((a) => {
    if (!due.has(a.questionId)) throw new WeeklyError('You already answered this question', 409)
    return { questionId: a.questionId, ...checkAnswer(bank.get(a.questionId)!, a) }
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
        await tx.surveyResponse.createMany({ data: answers.map((r) => ({ periodId: at.cycle.periodId, weekIndex: at.week, userId: input.anonymous ? null : actor.id, ...r })) })
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

/** The quarter's question weeks (12 when the quarter has no weekly cycle yet) and its current week. */
async function periodWeeks(periodId: string, now: Date): Promise<{ questionWeeks: number; week: number }> {
  const row = await prisma.weeklyCycle.findUnique({ where: { periodId }, select: { id: true } })
  if (!row) return { questionWeeks: 12, week: 1 }
  const cycle = await loadCycle(row.id)
  const questionWeeks = questionWeekCount(cycleWeeks(cycle))
  return { questionWeeks, week: Math.min(questionWeeks, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now))) }
}

/** Loads the standard bank, spread over the quarter's question weeks: one or two a week. */
export async function loadDefaultSurvey(actor: WeeklyActor, periodId: string, now: Date = new Date()): Promise<void> {
  assertHr(actor)
  const { questionWeeks } = await periodWeeks(periodId, now)
  const perWeek = surveyQuestionsPerWeek(DEFAULT_SURVEY.length, questionWeeks)
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`survey-bank:${periodId}`}))::text`
    if ((await tx.surveyQuestion.count({ where: { periodId, removedAt: null } })) > 0) throw new WeeklyError('This quarter already has questions', 409)
    await tx.surveyQuestion.createMany({
      data: DEFAULT_SURVEY.map((q, i) => ({
        periodId, orderIndex: i, dueWeek: Math.floor(i / perWeek) + 1, text: q.text, kind: q.kind,
        options: q.options ?? [], required: q.required ?? true, explainChoice: q.explainChoice ?? false,
      })),
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
      comments: mine.flatMap((r) => (r.text ? [{ text: r.text, choice: r.choice, name: r.userId ? people.get(r.userId)?.name ?? 'Unknown' : null }] : [])),
    }
  })
  return { questions }
}
