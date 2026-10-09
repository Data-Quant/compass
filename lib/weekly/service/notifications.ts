import { prisma } from '@/lib/db'
import { formatCalendarDate, karachiCalendarDate } from '../../kpi/calendar'
import { renderFormsOpenEmail, renderLowEvidenceEmail, renderQuestionsEmail } from '../emails'
import { renderDueTodayEmail, renderFinalWeekEmail } from '../emails-round'
import { areWeeklyEmailsEnabled } from '../flag'
import { PERSPECTIVE_LABELS } from '../perspectives'
import type { CycleWithPeriod } from './cycles'
import { lowEvidenceRows } from './dashboard'
import { isUniqueViolation } from './db'
import { formsProgress } from './form-tables'

export type WeeklySendMail = (to: string, subject: string, html: string) => Promise<unknown>
export type WeeklyEmailKind =
  | QuestionEmailKind | 'weekly-low-evidence' | 'weekly-forms-open'
  | 'peer-request' | 'peer-request-outcome' | 'peer-request-question' | 'peer-request-reply' | 'peer-request-received' | 'peer-request-for-hr' | 'weekly-mapping'
  | 'self-review-submitted' | 'self-review-reply' | 'self-review-reminder'
  | 'weekly-review-reminder' | 'weekly-hr-reminder' | 'weekly-round-opened' | 'weekly-behind' | 'weekly-team-behind' | 'weekly-hr-digest' | 'weekly-joiner' | 'weekly-round-closed'
/** Monday's questions, the due-day reminder (Sunday) and the final week's count (UX spec, section 13). */
export type QuestionEmailKind = 'weekly-questions' | 'weekly-due-today' | 'weekly-final-week'
export interface QuestionRecipient { userId: string; newCount: number; openCount: number }
export interface WeeklySendResult { sent: number; recorded: number; skipped: number; failed: number }

/** Per Karachi day by default; `scope` (for example a cycle week) replaces the day so the key spans that scope. */
export function weeklyDedupeKey(kind: WeeklyEmailKind, userId: string, now: Date, scope?: string): string {
  return `${kind}:${userId}:${scope ?? formatCalendarDate(karachiCalendarDate(now))}`
}

/**
 * One email per person per kind per Karachi day (or per `scope`), to everyone with an open question. Same guarantees as
 * deliverOnce: the row is claimed before sending and released if the send fails; with emails off it is only recorded.
 */
export async function sendQuestionEmails(
  kind: QuestionEmailKind,
  recipients: readonly QuestionRecipient[],
  now: Date,
  send: WeeklySendMail,
  appUrl: string,
  options: { scope?: string; closesOn?: string; emailsEnabled?: boolean } = {},
): Promise<WeeklySendResult> {
  const render = (name: string, r: QuestionRecipient) => {
    if (kind === 'weekly-due-today') return renderDueTodayEmail({ name, openCount: r.openCount, appUrl })
    if (kind === 'weekly-final-week') return renderFinalWeekEmail({ name, openCount: r.openCount, closesOn: options.closesOn ?? '', appUrl })
    return renderQuestionsEmail({ name, newCount: r.newCount, openCount: r.openCount, appUrl })
  }
  const messages = recipients.filter((r) => r.openCount > 0).map((r) => ({
    userId: r.userId, kind, dedupeKey: weeklyDedupeKey(kind, r.userId, now, options.scope), render: (name: string) => render(name, r),
  }))
  const result = await deliverOnce(messages, send, options.emailsEnabled ?? areWeeklyEmailsEnabled())
  return { ...result, skipped: result.skipped + recipients.length - messages.length }
}

export async function questionRecipients(cycleId: string, week: number): Promise<QuestionRecipient[]> {
  const [open, fresh] = await Promise.all([
    prisma.weeklyPrompt.groupBy({ by: ['evaluatorId'], where: { cycleId, status: { in: ['OPEN', 'DRAFT'] } }, _count: { _all: true } }),
    prisma.weeklyPrompt.groupBy({ by: ['evaluatorId'], where: { cycleId, weekIndex: week, status: { in: ['OPEN', 'DRAFT'] } }, _count: { _all: true } }),
  ])
  const freshBy = new Map(fresh.map((row) => [row.evaluatorId, row._count._all]))
  return open.map((row) => ({ userId: row.evaluatorId, openCount: row._count._all, newCount: freshBy.get(row.evaluatorId) ?? 0 }))
}

export interface WeeklyEmailMessage {
  userId: string
  kind: WeeklyEmailKind
  dedupeKey: string
  render: (name: string) => { subject: string; html: string }
}

/** Same guarantees as the question emails: claim the key, send, release the key if sending fails. */
export async function deliverOnce(messages: readonly WeeklyEmailMessage[], send: WeeklySendMail, emailsEnabled: boolean = areWeeklyEmailsEnabled()): Promise<WeeklySendResult> {
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(messages.map((m) => m.userId))] } },
    select: { id: true, name: true, email: true, payrollProfile: { select: { isPayrollActive: true } } },
  })
  const byId = new Map(users.map((user) => [user.id, user]))
  const result: WeeklySendResult = { sent: 0, recorded: 0, skipped: 0, failed: 0 }
  for (const message of messages) {
    const user = byId.get(message.userId)
    if (!user?.email || user.payrollProfile?.isPayrollActive === false) {
      result.skipped += 1
      continue
    }
    try {
      await prisma.weeklyNotification.create({ data: { userId: message.userId, kind: message.kind, dedupeKey: message.dedupeKey, delivered: emailsEnabled } })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      result.skipped += 1
      continue
    }
    if (!emailsEnabled) {
      result.recorded += 1
      continue
    }
    try {
      const email = message.render(user.name)
      await send(user.email, email.subject, email.html)
      result.sent += 1
    } catch (error) {
      console.error('[weekly] email failed', { userId: message.userId, kind: message.kind, error })
      await prisma.weeklyNotification.delete({ where: { dedupeKey: message.dedupeKey } })
        .catch((cleanup: unknown) => console.error('[weekly] could not release the email key', { dedupeKey: message.dedupeKey, cleanup }))
      result.failed += 1
    }
  }
  return result
}

const NOTHING_SENT: WeeklySendResult = { sent: 0, recorded: 0, skipped: 0, failed: 0 }

/**
 * For emails after a change has committed: building or sending them never fails the change. Anything that goes wrong
 * is logged and counted as failed.
 */
export async function deliverSafely(label: string, build: () => Promise<readonly WeeklyEmailMessage[]> | readonly WeeklyEmailMessage[], send: WeeklySendMail): Promise<WeeklySendResult> {
  try {
    const messages = await build()
    return messages.length ? await deliverOnce(messages, send) : NOTHING_SENT
  } catch (error) {
    console.error(`[weekly] ${label} emails failed`, { error })
    return { ...NOTHING_SENT, failed: 1 }
  }
}

export async function hrUserIds(): Promise<string[]> {
  return (await prisma.user.findMany({ where: { role: 'HR' }, select: { id: true } })).map((u) => u.id)
}

/** Spec 8.2: the low-evidence list, emailed to HR once per cycle. */
export async function lowEvidenceMessages(cycleId: string, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const rows = (await lowEvidenceRows(cycleId)).map((r) => ({ evaluatee: r.evaluatee.name, group: PERSPECTIVE_LABELS[r.perspective], satisfied: r.satisfied, total: r.total }))
  if (rows.length === 0) return []
  return (await hrUserIds()).map((userId) => ({
    userId, kind: 'weekly-low-evidence' as const, dedupeKey: `weekly-low-evidence:${userId}:${cycleId}`,
    render: (name: string) => renderLowEvidenceEmail({ name, rows, appUrl }),
  }))
}

/** Once the forms are open, everyone with an unfinished form hears about it once a day until they finish. */
export async function formsOpenMessages(cycle: CycleWithPeriod, now: Date, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const { pendingEvaluatorIds } = await formsProgress(cycle.periodId, now)
  const hr = new Set(await hrUserIds())
  return pendingEvaluatorIds.map((userId) => ({
    userId, kind: 'weekly-forms-open' as const, dedupeKey: weeklyDedupeKey('weekly-forms-open', userId, now),
    // HR's own HR evaluations and the partners' are on the quarter-end page.
    render: (name: string) => renderFormsOpenEmail({ name, appUrl, path: hr.has(userId) ? '/admin/evaluation-round?tab=forms' : '/evaluations/weekly' }),
  }))
}

