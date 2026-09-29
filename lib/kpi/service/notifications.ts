import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { escapeHtml } from '@/lib/sanitize'
import { formatCalendarDate, karachiCalendarDate } from '../calendar'
import type { DigestItem } from '../digest'

export type SendMail = (to: string, subject: string, html: string) => Promise<unknown>
export interface SendResult { sent: number; skipped: number; failed: number }

export function digestKey(userId: string, now: Date): string {
  return `digest:${userId}:${formatCalendarDate(karachiCalendarDate(now))}`
}

/** Every interpolated value is escaped: titles and names come from users. */
export function renderDigest(name: string, items: readonly DigestItem[], appUrl: string): { subject: string; html: string } {
  const base = appUrl.replace(/\/$/, '')
  const list = items
    .map((item) => `<li style="margin:0 0 8px">${escapeHtml(item.text)} · <a href="${escapeHtml(`${base}${item.path}`)}">Open</a></li>`)
    .join('')
  return {
    subject: items.length === 1 ? 'KPIs: 1 thing needs your attention' : `KPIs: ${items.length} things need your attention`,
    html:
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">` +
      `<p>Hi ${escapeHtml(name)},</p><ul style="padding-left:18px">${list}</ul>` +
      `<p style="color:#666;font-size:12px">Compass sends at most one KPI email a day.</p></div>`,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/**
 * One email per person per Karachi day. The notification row is claimed before sending
 * (so two runs cannot both send) and released if the send fails (so the next run retries).
 */
export async function sendDigests(digests: ReadonlyMap<string, DigestItem[]>, now: Date, send: SendMail, appUrl: string): Promise<SendResult> {
  const users = await prisma.user.findMany({
    where: { id: { in: [...digests.keys()] } },
    select: { id: true, name: true, email: true, payrollProfile: { select: { isPayrollActive: true } } },
  })
  const byId = new Map(users.map((user) => [user.id, user]))
  const result: SendResult = { sent: 0, skipped: 0, failed: 0 }
  for (const [userId, items] of digests) {
    const user = byId.get(userId)
    if (!user?.email || user.payrollProfile?.isPayrollActive === false || items.length === 0) {
      result.skipped += 1
      continue
    }
    const dedupeKey = digestKey(userId, now)
    try {
      await prisma.kpiNotification.create({ data: { userId, kind: 'digest', dedupeKey } })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      result.skipped += 1
      continue
    }
    try {
      const { subject, html } = renderDigest(user.name, items, appUrl)
      await send(user.email, subject, html)
      result.sent += 1
    } catch (error) {
      console.error('[kpi] digest email failed', { userId, error })
      await prisma.kpiNotification.delete({ where: { dedupeKey } })
      result.failed += 1
    }
  }
  return result
}
