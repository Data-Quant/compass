// UX spec, section 12: the monthly self-evaluation. In the last week of each month of the quarter everyone answers that
// month's question (three short parts, 30 words across them). On submit it goes at once to the person's leads and HR (HR
// only when they have no lead) and cannot be changed. Leads mark it read and may reply; a lead who has not read it after
// 5 working days is reminded once and HR sees it flagged. It is never scored and never shown to peers or team members.
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { karachiCalendarDate } from '../../kpi/calendar'
import { cycleWeeks, effectiveWeek, weekStartsAt } from '../calendar'
import { isOutsideRedesign } from '../eligibility'
import { renderSelfReviewReplyEmail, renderSelfReviewSubmittedEmail } from '../emails'
import { isHrFilledPartner } from '../partners'
import type { PersonRef } from '../view-types'
import { addWorkingDays } from '../working-days'
import { recordAudit } from './audit'
import { assertHr, byName, loadPeople, personRef, type WeeklyActor } from './context'
import { findRunningCycle, loadCycle, type CycleWithPeriod } from './cycles'
import { WeeklyError } from './errors'
import { deliverOnce, hrUserIds, type WeeklySendMail, type WeeklySendResult } from './notifications'
import { mappingOf } from './peer-requests'

export const SELF_REVIEW_MIN_WORDS = 30
export const UNREAD_WORKING_DAYS = 5
const MAX_PART_CHARS = 3000

interface DefaultQuestion { title: string; parts: [string, string, string]; discussOption: boolean }

/** The spec's three questions: what got done, what is in the way, where the person is heading. */
export const DEFAULT_SELF_REVIEW: readonly DefaultQuestion[] = [
  {
    title: 'What you delivered',
    parts: [
      'List the two or three most important things you delivered this month.',
      'What was the result of each?',
      'Was there anything you committed to that did not get done? If so, why?',
    ],
    discussOption: true,
  },
  {
    title: 'What is in your way',
    parts: [
      'What is slowing you down or making your work harder right now?',
      'What would help most?',
      'Who could provide it: you, your lead, your team or the company?',
    ],
    discussOption: false,
  },
  {
    title: 'Where you are heading',
    parts: [
      'What is one thing you want to get better at next quarter?',
      'What have you already done toward it?',
      'What support would make the biggest difference?',
    ],
    discussOption: false,
  },
]

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0)

/** The quarter's three calendar months, as (year, month 1–12). */
function quarterMonths(periodStart: Date): Array<{ year: number; month: number }> {
  const start = karachiCalendarDate(periodStart)
  return [0, 1, 2].map((i) => {
    const index = start.month - 1 + i
    return { year: start.year + Math.floor(index / 12), month: (index % 12) + 1 }
  })
}

/** For each month of the quarter, the last week of the round that starts in it (null if none does). */
export function selfReviewReleaseWeeks(weekOneStartsOn: Date, totalWeeks: number, periodStart: Date): Array<number | null> {
  return quarterMonths(periodStart).map(({ year, month }) => {
    let last: number | null = null
    for (let week = 1; week <= totalWeeks; week += 1) {
      const day = karachiCalendarDate(weekStartsAt(weekOneStartsOn, week))
      if (day.year === year && day.month === month) last = week
    }
    return last
  })
}

const monthName = (cycle: CycleWithPeriod, month: number) => {
  const m = quarterMonths(cycle.period.startDate)[month - 1]
  return m ? MONTH_NAMES[m.month - 1] : `month ${month}`
}

async function questions(periodId: string) {
  const existing = await prisma.selfReviewQuestion.findMany({ where: { periodId }, orderBy: { month: 'asc' } })
  if (existing.length === DEFAULT_SELF_REVIEW.length) return existing
  await prisma.selfReviewQuestion.createMany({
    data: DEFAULT_SELF_REVIEW.map((q, i) => ({ periodId, month: i + 1, title: q.title, parts: q.parts, discussOption: q.discussOption })),
    skipDuplicates: true,
  })
  return prisma.selfReviewQuestion.findMany({ where: { periodId }, orderBy: { month: 'asc' } })
}

function takesPart(person: { name: string; department: string | null } | undefined): boolean {
  return Boolean(person) && !isOutsideRedesign(person as { department: string | null }) && !isHrFilledPartner(person?.name)
}

/** The month whose question is open in this week: the newest one released, which replaces any earlier unanswered one. */
function openMonth(cycle: CycleWithPeriod, now: Date): { month: number; week: number } | null {
  const total = cycleWeeks(cycle)
  const week = Math.min(total, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now)))
  const releases = selfReviewReleaseWeeks(cycle.weekOneStartsOn, total, cycle.period.startDate)
  const released = releases.map((w, i) => ({ month: i + 1, week: w })).filter((r): r is { month: number; week: number } => r.week !== null && r.week <= week)
  return released.at(-1) ?? null
}

async function leadsOf(periodId: string, userId: string): Promise<string[]> {
  return mappingOf(userId, await getResolvedEvaluationAssignments(periodId)).leads
}

export interface MySelfReview {
  periodName: string | null
  current: { month: number; title: string; parts: string[]; discussOption: boolean; recipients: PersonRef[]; monthName: string } | null
  history: Array<{
    id: string; month: number; monthName: string; title: string; parts: string[]; answers: string[]; wantsDiscussion: boolean; submittedAt: string
    reads: Array<{ lead: PersonRef; readAt: string | null; reply: string | null; repliedAt: string | null }>
  }>
}

export async function mySelfReview(actor: WeeklyActor, now: Date): Promise<MySelfReview> {
  const cycle = await findRunningCycle()
  if (!cycle) return { periodName: null, current: null, history: [] }
  const qs = await questions(cycle.periodId)
  const mine = await prisma.selfReview.findMany({ where: { periodId: cycle.periodId, userId: actor.id }, include: { reads: true }, orderBy: { month: 'desc' } })
  const people = await loadPeople([actor.id, ...mine.flatMap((r) => r.reads.map((x) => x.leadId))])
  const open = takesPart(people.get(actor.id)) ? openMonth(cycle, now) : null
  const question = open && !mine.some((r) => r.month === open.month) ? qs.find((q) => q.month === open.month) : undefined
  const recipients = question ? await leadsOf(cycle.periodId, actor.id) : []
  const leadPeople = await loadPeople(recipients)
  return {
    periodName: cycle.period.name,
    current: question ? {
      month: question.month, title: question.title, parts: question.parts, discussOption: question.discussOption,
      recipients: recipients.map((id) => personRef(leadPeople, id)).sort(byName), monthName: monthName(cycle, question.month),
    } : null,
    history: mine.map((r) => {
      const q = qs.find((x) => x.id === r.questionId)
      return {
        id: r.id, month: r.month, monthName: monthName(cycle, r.month), title: q?.title ?? '', parts: q?.parts ?? [], answers: r.answers, wantsDiscussion: r.wantsDiscussion,
        submittedAt: r.submittedAt.toISOString(),
        reads: r.reads.map((x) => ({ lead: personRef(people, x.leadId), readAt: x.readAt?.toISOString() ?? null, reply: x.reply, repliedAt: x.repliedAt?.toISOString() ?? null })),
      }
    }),
  }
}

export async function submitSelfReview(
  actor: WeeklyActor, input: { month: number; answers: string[]; wantsDiscussion: boolean }, now: Date, send: WeeklySendMail, appUrl: string,
): Promise<{ recipients: PersonRef[]; submittedAt: string }> {
  const cycle = await findRunningCycle()
  if (!cycle) throw new WeeklyError('There is no round running', 409)
  const view = await mySelfReview(actor, now)
  if (!view.current || view.current.month !== input.month) throw new WeeklyError('This self-evaluation is no longer open', 409)
  const answers = input.answers.map((a) => a.trim().slice(0, MAX_PART_CHARS))
  if (answers.length !== 3) throw new WeeklyError('Answer the three parts')
  if (countWords(answers.join(' ')) < SELF_REVIEW_MIN_WORDS) throw new WeeklyError(`Write at least ${SELF_REVIEW_MIN_WORDS} words across the three parts`)
  const question = (await questions(cycle.periodId)).find((q) => q.month === input.month)!
  const leads = view.current.recipients.map((p) => p.id)
  const created = await prisma.selfReview.create({
    data: {
      periodId: cycle.periodId, month: input.month, userId: actor.id, questionId: question.id, answers,
      wantsDiscussion: question.discussOption && input.wantsDiscussion, submittedAt: now,
      reads: { create: leads.map((leadId) => ({ leadId })) },
    },
  }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new WeeklyError('You already sent this month’s self-evaluation', 409)
    throw error
  })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'EMPLOYEE', action: 'SELF_REVIEW_SUBMIT', objectType: 'SelfReview', objectId: created.id, after: { month: input.month, leads } })
  const month = monthName(cycle, input.month)
  // Leads are emailed; with no lead, HR is (HR sees every submission in the Self-evaluations tab either way).
  const notify = leads.length ? leads : await hrUserIds()
  await deliverOnce(notify.map((leadId) => ({
    userId: leadId, kind: 'self-review-submitted' as const, dedupeKey: `self-review:${created.id}:${leadId}`,
    render: (name: string) => renderSelfReviewSubmittedEmail({ name, personName: actor.name, monthName: month, appUrl }),
  })), send)
  return { recipients: view.current.recipients, submittedAt: now.toISOString() }
}

export interface TeamSelfReviewItem {
  id: string; person: PersonRef; month: number; monthName: string; title: string; parts: string[]; answers: string[]; wantsDiscussion: boolean
  submittedAt: string; readAt: string | null; reply: string | null
}

/** The self-evaluations sent to this lead, unread first. */
export async function teamSelfReviews(actor: WeeklyActor): Promise<{ items: TeamSelfReviewItem[] }> {
  const reads = await prisma.selfReviewRead.findMany({ where: { leadId: actor.id }, include: { review: true } })
  if (reads.length === 0) return { items: [] }
  const periodIds = [...new Set(reads.map((r) => r.review.periodId))]
  const qs = await prisma.selfReviewQuestion.findMany({ where: { periodId: { in: periodIds } } })
  const cycles = new Map<string, CycleWithPeriod>()
  for (const row of await prisma.weeklyCycle.findMany({ where: { periodId: { in: periodIds } }, select: { id: true, periodId: true } })) cycles.set(row.periodId, await loadCycle(row.id))
  const people = await loadPeople(reads.map((r) => r.review.userId))
  const items = reads.map((r) => {
    const q = qs.find((x) => x.id === r.review.questionId)
    const cycle = cycles.get(r.review.periodId)
    return {
      id: r.review.id, person: personRef(people, r.review.userId), month: r.review.month, monthName: cycle ? monthName(cycle, r.review.month) : '',
      title: q?.title ?? '', parts: q?.parts ?? [], answers: r.review.answers, wantsDiscussion: r.review.wantsDiscussion,
      submittedAt: r.review.submittedAt.toISOString(), readAt: r.readAt?.toISOString() ?? null, reply: r.reply,
    }
  })
  return { items: items.sort((a, b) => Number(a.readAt !== null) - Number(b.readAt !== null) || b.submittedAt.localeCompare(a.submittedAt)) }
}

async function ownRead(actor: WeeklyActor, reviewId: string) {
  const read = await prisma.selfReviewRead.findUnique({ where: { reviewId_leadId: { reviewId, leadId: actor.id } }, include: { review: true } })
  if (!read) throw new WeeklyError('Self-evaluation not found', 404)
  return read
}

export async function markSelfReviewRead(actor: WeeklyActor, reviewId: string, now: Date): Promise<void> {
  const read = await ownRead(actor, reviewId)
  if (!read.readAt) await prisma.selfReviewRead.update({ where: { id: read.id }, data: { readAt: now } })
}

export async function replyToSelfReview(actor: WeeklyActor, reviewId: string, text: string, now: Date, send: WeeklySendMail, appUrl: string): Promise<void> {
  const reply = text.trim()
  if (!reply) throw new WeeklyError('Write a reply')
  if (reply.length > 1000) throw new WeeklyError('Keep the reply under 1000 characters')
  const read = await ownRead(actor, reviewId)
  await prisma.selfReviewRead.update({ where: { id: read.id }, data: { reply, repliedAt: now, readAt: read.readAt ?? now } })
  const cycleRow = await prisma.weeklyCycle.findUnique({ where: { periodId: read.review.periodId }, select: { id: true } })
  const month = cycleRow ? monthName(await loadCycle(cycleRow.id), read.review.month) : ''
  await deliverOnce([{
    userId: read.review.userId, kind: 'self-review-reply', dedupeKey: `self-review-reply:${read.id}:${now.getTime()}`,
    render: (name) => renderSelfReviewReplyEmail({ name, leadName: actor.name, monthName: month, appUrl }),
  }], send)
}

export interface AdminSelfReviewMonth { month: number; title: string; parts: string[]; discussOption: boolean; monthName: string; releaseWeek: number | null; answered: number }

export interface AdminSelfReviewRow {
  id: string; person: PersonRef; department: string | null; month: number; monthName: string; title: string; parts: string[]; answers: string[]
  wantsDiscussion: boolean; submittedAt: string
  reads: Array<{ lead: PersonRef; readAt: string | null; reply: string | null; overdue: boolean }>
}

/** Every submission for HR, by month and department, with each lead's read status; and who has not submitted yet. */
export async function adminSelfReviews(actor: WeeklyActor, periodId: string, filter: { month?: number; department?: string }, now: Date = new Date()): Promise<{
  months: AdminSelfReviewMonth[]; rows: AdminSelfReviewRow[]; missing: PersonRef[]
}> {
  assertHr(actor)
  const cycleRow = await prisma.weeklyCycle.findUnique({ where: { periodId }, select: { id: true } })
  if (!cycleRow) return { months: [], rows: [], missing: [] }
  const cycle = await loadCycle(cycleRow.id)
  const qs = await questions(periodId)
  const releases = selfReviewReleaseWeeks(cycle.weekOneStartsOn, cycleWeeks(cycle), cycle.period.startDate)
  const reviews = await prisma.selfReview.findMany({ where: { periodId, ...(filter.month ? { month: filter.month } : {}) }, include: { reads: true }, orderBy: [{ month: 'asc' }, { submittedAt: 'asc' }] })
  const assignments = await getResolvedEvaluationAssignments(periodId)
  const everyone = await loadPeople([...assignments.flatMap((a) => [a.evaluatorId, a.evaluateeId]), ...reviews.flatMap((r) => [r.userId, ...r.reads.map((x) => x.leadId)])])
  const inDepartment = (id: string) => !filter.department || (everyone.get(id)?.department ?? '').toLowerCase() === filter.department.toLowerCase()
  const rows = reviews.filter((r) => inDepartment(r.userId)).map((r) => {
    const q = qs.find((x) => x.id === r.questionId)
    return {
      id: r.id, person: personRef(everyone, r.userId), department: everyone.get(r.userId)?.department ?? null, month: r.month, monthName: monthName(cycle, r.month),
      title: q?.title ?? '', parts: q?.parts ?? [], answers: r.answers, wantsDiscussion: r.wantsDiscussion, submittedAt: r.submittedAt.toISOString(),
      reads: r.reads.map((x) => ({ lead: personRef(everyone, x.leadId), readAt: x.readAt?.toISOString() ?? null, reply: x.reply, overdue: !x.readAt && x.remindedAt !== null })),
    }
  })
  // Missing: participants without an answer for the chosen month, or for the month open now (it replaced earlier ones).
  const week = Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now))
  const released = releases.map((w, i) => ({ month: i + 1, week: w })).filter((r) => r.week !== null && r.week <= week).map((r) => r.month)
  const months = filter.month ? released.filter((m) => m === filter.month) : released.slice(-1)
  const submitted = new Set(reviews.map((r) => `${r.userId}|${r.month}`))
  const participants = [...everyone.values()].filter((p) => p.payrollActive && takesPart(p) && inDepartment(p.id))
  const missing = participants.filter((p) => months.some((m) => !submitted.has(`${p.id}|${m}`))).map((p) => personRef(everyone, p.id)).sort(byName)
  return {
    months: await Promise.all(qs.map(async (q) => ({
      month: q.month, title: q.title, parts: q.parts, discussOption: q.discussOption, monthName: monthName(cycle, q.month), releaseWeek: releases[q.month - 1] ?? null,
      answered: await prisma.selfReview.count({ where: { questionId: q.id } }),
    }))),
    rows, missing,
  }
}

/** Daily: a lead who has not read a self-evaluation within 5 working days is reminded once, and HR sees it flagged. */
export async function remindUnreadSelfReviews(now: Date, send: WeeklySendMail, appUrl: string): Promise<WeeklySendResult> {
  const waiting = await prisma.selfReviewRead.findMany({ where: { readAt: null, remindedAt: null }, include: { review: true } })
  const due = waiting.filter((r) => addWorkingDays(r.review.submittedAt, UNREAD_WORKING_DAYS, []).getTime() < now.getTime())
  let total: WeeklySendResult = { sent: 0, recorded: 0, skipped: 0, failed: 0 }
  for (const read of due) {
    const claimed = await prisma.selfReviewRead.updateMany({ where: { id: read.id, readAt: null, remindedAt: null }, data: { remindedAt: now } })
    if (claimed.count === 0) continue
    const person = (await loadPeople([read.review.userId])).get(read.review.userId)
    const cycleRow = await prisma.weeklyCycle.findUnique({ where: { periodId: read.review.periodId }, select: { id: true } })
    const month = cycleRow ? monthName(await loadCycle(cycleRow.id), read.review.month) : ''
    const result = await deliverOnce([{
      userId: read.leadId, kind: 'self-review-reminder', dedupeKey: `self-review-reminder:${read.id}`,
      render: (name) => renderSelfReviewSubmittedEmail({ name, personName: person?.name ?? 'Someone', monthName: month, reminder: true, appUrl }),
    }], send)
    // Not delivered (failed, or nobody to send to): unclaim, so HR is not told the lead was reminded.
    if (result.failed > 0 || result.sent + result.recorded === 0) await prisma.selfReviewRead.updateMany({ where: { id: read.id, remindedAt: now }, data: { remindedAt: null } })
    total = { sent: total.sent + result.sent, recorded: total.recorded + result.recorded, skipped: total.skipped + result.skipped, failed: total.failed + result.failed }
  }
  return total
}

/** HR edits a month's question, until someone has answered it (earlier answers keep the question they answered). */
export async function updateSelfReviewQuestion(
  actor: WeeklyActor, periodId: string, month: number, input: { title: string; parts: string[]; discussOption: boolean },
): Promise<void> {
  assertHr(actor)
  const title = input.title.trim()
  const parts = input.parts.map((p) => p.trim())
  if (!title) throw new WeeklyError('Give the question a title')
  if (parts.length !== 3 || parts.some((p) => !p)) throw new WeeklyError('A self-evaluation question has three parts')
  const question = (await questions(periodId)).find((q) => q.month === month)
  if (!question) throw new WeeklyError('Question not found', 404)
  const answered = await prisma.selfReview.count({ where: { questionId: question.id } })
  if (answered > 0) throw new WeeklyError(`This question was already answered by ${answered} ${answered === 1 ? 'person' : 'people'}, so it can no longer change`, 409)
  await prisma.selfReviewQuestion.update({ where: { id: question.id }, data: { title, parts, discussOption: input.discussOption } })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'SELF_REVIEW_QUESTION_EDIT', objectType: 'SelfReviewQuestion', objectId: question.id, before: { title: question.title, parts: question.parts }, after: { title, parts } })
}
