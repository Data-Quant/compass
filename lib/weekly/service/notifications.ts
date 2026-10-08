import { prisma } from '@/lib/db'
import { formatCalendarDate, karachiCalendarDate } from '../../kpi/calendar'
import { renderFormsOpenEmail, renderLowEvidenceEmail, renderQuestionsEmail } from '../emails'
import { areWeeklyEmailsEnabled } from '../flag'
import { PERSPECTIVE_LABELS } from '../perspectives'
import type { CycleWithPeriod } from './cycles'
import { lowEvidenceRows } from './dashboard'
import { isUniqueViolation } from './db'
import { formsProgress } from './form-tables'

export type WeeklySendMail = (to: string, subject: string, html: string) => Promise<unknown>
export type WeeklyEmailKind =
  | 'weekly-questions' | 'weekly-reminder' | 'weekly-low-evidence' | 'weekly-forms-open'
  | 'peer-request' | 'peer-request-outcome' | 'peer-request-question' | 'weekly-mapping'
export interface QuestionRecipient { userId: string; newCount: number; openCount: number }
export interface WeeklySendResult { sent: number; recorded: number; skipped: number; failed: number }

/** Per Karachi day by default; `scope` (for example a cycle week) replaces the day so the key spans that scope. */
export function weeklyDedupeKey(kind: WeeklyEmailKind, userId: string, now: Date, scope?: string): string {
  return `${kind}:${userId}:${scope ?? formatCalendarDate(karachiCalendarDate(now))}`
}

/**
 * One email per person per kind per Karachi day (or per `scope`). The row is claimed before sending and released if the
 * send fails, so the next run retries. With emails off (preview) the row is recorded and nothing is sent.
 */
export async function sendQuestionEmails(
  kind: WeeklyEmailKind,
  recipients: readonly QuestionRecipient[],
  now: Date,
  send: WeeklySendMail,
  appUrl: string,
  emailsEnabled: boolean = areWeeklyEmailsEnabled(),
  scope?: string,
): Promise<WeeklySendResult> {
  const users = await prisma.user.findMany({
    where: { id: { in: recipients.map((r) => r.userId) } },
    select: { id: true, name: true, email: true, payrollProfile: { select: { isPayrollActive: true } } },
  })
  const byId = new Map(users.map((user) => [user.id, user]))
  const result: WeeklySendResult = { sent: 0, recorded: 0, skipped: 0, failed: 0 }
  for (const recipient of recipients) {
    const user = byId.get(recipient.userId)
    if (!user?.email || user.payrollProfile?.isPayrollActive === false || recipient.openCount === 0) {
      result.skipped += 1
      continue
    }
    const dedupeKey = weeklyDedupeKey(kind, recipient.userId, now, scope)
    try {
      await prisma.weeklyNotification.create({ data: { userId: recipient.userId, kind, dedupeKey, delivered: emailsEnabled } })
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
      const email = renderQuestionsEmail({ name: user.name, newCount: recipient.newCount, openCount: recipient.openCount, appUrl, reminder: kind === 'weekly-reminder' })
      await send(user.email, email.subject, email.html)
      result.sent += 1
    } catch (error) {
      console.error('[weekly] email failed', { userId: recipient.userId, error })
      await prisma.weeklyNotification.delete({ where: { dedupeKey } })
      result.failed += 1
    }
  }
  return result
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
      result.failed += 1
    }
  }
  return result
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

