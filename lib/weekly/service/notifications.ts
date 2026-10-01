import { prisma } from '@/lib/db'
import { formatCalendarDate, formatMonthKey, karachiCalendarDate, monthKeyOf } from '../../kpi/calendar'
import { renderFormsOpenEmail, renderLengthBiasEmail, renderLowEvidenceEmail, renderQuestionsEmail, renderScoringFailedEmail } from '../emails'
import { LENGTH_ALERT_THRESHOLD } from '../quality'
import { areWeeklyEmailsEnabled } from '../flag'
import { PERSPECTIVE_LABELS } from '../perspectives'
import { loadAnswerRecords } from './answer-states'
import type { CycleWithPeriod } from './cycles'
import { lowEvidenceRows } from './dashboard'
import { isUniqueViolation } from './db'
import { formsProgress } from './forms'
import { lengthCorrelation } from './reporting'

export type WeeklySendMail = (to: string, subject: string, html: string) => Promise<unknown>
export type WeeklyEmailKind =
  | 'weekly-questions' | 'weekly-reminder' | 'weekly-scoring-failed' | 'weekly-low-evidence'
  | 'weekly-challenge-new' | 'weekly-challenge-resolved' | 'weekly-forms-open' | 'weekly-more-evidence' | 'weekly-length-bias'
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

const DAY_MS = 24 * 60 * 60 * 1000

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

/** HR hears about answers whose scoring failed in the last day. */
export async function scoringFailedMessages(cycleId: string, now: Date, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const failed = (await loadAnswerRecords({ cycleId })).filter((r) => r.state === 'FAILED' && r.job !== null && r.job.updatedAt.getTime() > now.getTime() - DAY_MS)
  if (failed.length === 0) return []
  return (await hrUserIds()).map((userId) => ({
    userId, kind: 'weekly-scoring-failed' as const, dedupeKey: weeklyDedupeKey('weekly-scoring-failed', userId, now),
    render: (name: string) => renderScoringFailedEmail({ name, count: failed.length, appUrl }),
  }))
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

/** Spec 12: Hamiz and HR hear once per quarter that their forms are open. */
export async function formsOpenMessages(cycle: CycleWithPeriod, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const { pendingEvaluatorIds } = await formsProgress(cycle.periodId)
  return pendingEvaluatorIds.map((userId) => ({
    userId, kind: 'weekly-forms-open' as const, dedupeKey: `weekly-forms-open:${userId}:${cycle.id}`,
    render: (name: string) => renderFormsOpenEmail({ name, appUrl }),
  }))
}

/**
 * Spec 8.7: HR hears the running quarter's length–score correlation once per Karachi month. Until it can be computed
 * (two scored answers that differ) there is nothing to report, and the month's email goes out on a later run.
 */
export async function lengthBiasMessages(cycle: CycleWithPeriod, now: Date, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const { correlation, scored } = await lengthCorrelation(cycle.id)
  if (correlation === null) return []
  const month = formatMonthKey(monthKeyOf(now))
  return (await hrUserIds()).map((userId) => ({
    userId, kind: 'weekly-length-bias' as const, dedupeKey: `weekly-length-bias:${userId}:${month}`,
    render: (name: string) => renderLengthBiasEmail({ name, periodName: cycle.period.name, correlation, alert: correlation > LENGTH_ALERT_THRESHOLD, scored, appUrl }),
  }))
}
