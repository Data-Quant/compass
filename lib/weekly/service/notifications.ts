import { prisma } from '@/lib/db'
import { formatCalendarDate, karachiCalendarDate } from '../../kpi/calendar'
import { renderQuestionsEmail } from '../emails'
import { areWeeklyEmailsEnabled } from '../flag'
import { isUniqueViolation } from './db'

export type WeeklySendMail = (to: string, subject: string, html: string) => Promise<unknown>
export type WeeklyEmailKind = 'weekly-questions' | 'weekly-reminder'
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
