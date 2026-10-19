// §3 Notifications reuse Compass in-app + email. Emails only say there is
// something in Compass — never links or codes (anti-phishing). In-app rows
// carry the detail and are shown on the Security Checks page.
import { prisma } from '@/lib/db'
import type { Db } from './db'

export interface NotificationInput {
  userId: string
  kind: string
  title: string
  body: string
  taskId?: string | null
  dedupeKey: string
}

export type Mailer = (to: string, subject: string, html: string) => Promise<unknown>

export const EMPLOYEE_EMAIL_SUBJECT = 'You have a task in Compass'
export const SECURITY_TEAM_EMAIL_SUBJECT = 'You have Security Checks items in Compass'

const EMAIL_HTML = (headline: string) => `
  <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111;">
    <p>${headline}</p>
    <p>Sign in to Compass the way you normally do to see it.</p>
    <p style="color:#666; font-size:12px;">This message never contains links, codes or attachments. If an email
    claiming to be from Compass asks you to click a link or share a code, report it to the Security team.</p>
  </div>`

const SECURITY_TEAM_KINDS: ReadonlySet<string> = new Set(['OVERDUE_DIGEST', 'UNREVIEWED_EXPIRED', 'SELF_REVIEW_REPORT'])

/** Creates in-app notifications; duplicates (same dedupeKey) are ignored. */
export async function queueNotifications(db: Db, items: readonly NotificationInput[]): Promise<number> {
  if (items.length === 0) return 0
  const result = await db.securityNotification.createMany({
    data: items.map((item) => ({
      userId: item.userId,
      kind: item.kind,
      title: item.title,
      body: item.body,
      taskId: item.taskId ?? null,
      dedupeKey: item.dedupeKey,
    })),
    skipDuplicates: true,
  })
  return result.count
}

async function defaultMailer(): Promise<Mailer> {
  const { sendMail } = await import('@/lib/email')
  return sendMail
}

/**
 * Sends one generic email per recipient for notifications not yet emailed.
 * Rows are marked emailed before sending so a retry never double-sends;
 * a failed send is logged and not retried (the in-app row remains).
 */
export async function deliverPendingEmails(db: Db = prisma, mailer?: Mailer): Promise<{ recipients: number; failed: number }> {
  const pending = await db.securityNotification.findMany({
    where: { emailed: false },
    select: { id: true, userId: true, kind: true },
    take: 1000,
  })
  if (pending.length === 0) return { recipients: 0, failed: 0 }
  await db.securityNotification.updateMany({ where: { id: { in: pending.map((row) => row.id) } }, data: { emailed: true } })

  const byUser = new Map<string, Set<string>>()
  for (const row of pending) byUser.set(row.userId, (byUser.get(row.userId) ?? new Set()).add(row.kind))
  const users = await db.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, email: true } })
  const send = mailer ?? (await defaultMailer())

  let failed = 0
  for (const user of users) {
    if (!user.email) continue
    const kinds = byUser.get(user.id) ?? new Set<string>()
    const securityTeam = [...kinds].every((kind) => SECURITY_TEAM_KINDS.has(kind))
    const subject = securityTeam ? SECURITY_TEAM_EMAIL_SUBJECT : EMPLOYEE_EMAIL_SUBJECT
    const headline = securityTeam ? 'You have Security Checks items to look at in Compass.' : 'You have a task in Compass.'
    try {
      await send(user.email, subject, EMAIL_HTML(headline))
    } catch (error) {
      failed += 1
      console.error('[security-checks] notification email failed', { userId: user.id, error })
    }
  }
  return { recipients: users.length, failed }
}

export async function securityAdminIds(db: Db = prisma): Promise<string[]> {
  const admins = await db.user.findMany({ where: { role: 'SECURITY' }, select: { id: true } })
  return admins.map((admin) => admin.id)
}
