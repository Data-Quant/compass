import type { ProjectNotificationDigestFrequency } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sendMail } from '@/lib/email'
import { escapeHtml } from '@/lib/sanitize'

export const PROJECT_NOTIFICATION_FREQUENCIES: ProjectNotificationDigestFrequency[] = ['HOURLY', 'DAILY', 'WEEKLY']
export const DEFAULT_PROJECT_NOTIFICATION_TIME = '09:00'
export const DEFAULT_PROJECT_NOTIFICATION_WEEKDAY = 1
export const PROJECT_NOTIFICATION_TIMEZONE = 'Asia/Karachi'

const KARACHI_OFFSET_MINUTES = 5 * 60
const MAX_DIGEST_ITEMS_PER_EMAIL = 100

type DigestPreferenceInput = {
  digestFrequency: ProjectNotificationDigestFrequency
  digestTime: string
  digestWeekday?: number
  from?: Date
}

function normalizeBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function getAppBaseUrl(origin?: string | null) {
  return (
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeBaseUrl(process.env.APP_URL) ||
    normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalizeBaseUrl(process.env.VERCEL_URL) ||
    normalizeBaseUrl(origin) ||
    'http://localhost:3000'
  )
}

export function isValidProjectNotificationTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)
}

function parseDigestTime(value: string) {
  const safe = isValidProjectNotificationTime(value) ? value : DEFAULT_PROJECT_NOTIFICATION_TIME
  const [hour, minute] = safe.split(':').map((part) => Number(part))
  return { hour, minute }
}

function toKarachiLocalDate(date: Date) {
  return new Date(date.getTime() + KARACHI_OFFSET_MINUTES * 60_000)
}

function fromKarachiLocalParts(year: number, monthIndex: number, date: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, monthIndex, date, hour, minute, 0, 0) - KARACHI_OFFSET_MINUTES * 60_000)
}

export function calculateNextProjectNotificationDigestAt(input: DigestPreferenceInput) {
  const from = input.from ?? new Date()
  const local = toKarachiLocalDate(from)
  const { hour, minute } = parseDigestTime(input.digestTime)

  if (input.digestFrequency === 'HOURLY') {
    let candidate = fromKarachiLocalParts(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      local.getUTCHours(),
      minute
    )
    if (candidate <= from) {
      const nextLocal = new Date(local)
      nextLocal.setUTCHours(nextLocal.getUTCHours() + 1)
      candidate = fromKarachiLocalParts(
        nextLocal.getUTCFullYear(),
        nextLocal.getUTCMonth(),
        nextLocal.getUTCDate(),
        nextLocal.getUTCHours(),
        minute
      )
    }
    return candidate
  }

  if (input.digestFrequency === 'WEEKLY') {
    const targetWeekday = Math.max(0, Math.min(6, input.digestWeekday ?? DEFAULT_PROJECT_NOTIFICATION_WEEKDAY))
    let daysUntil = (targetWeekday - local.getUTCDay() + 7) % 7
    let candidate = fromKarachiLocalParts(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + daysUntil,
      hour,
      minute
    )
    if (candidate <= from) {
      daysUntil += 7
      candidate = fromKarachiLocalParts(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() + daysUntil,
        hour,
        minute
      )
    }
    return candidate
  }

  let candidate = fromKarachiLocalParts(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    hour,
    minute
  )
  if (candidate <= from) {
    candidate = fromKarachiLocalParts(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + 1,
      hour,
      minute
    )
  }
  return candidate
}

export function getDefaultProjectNotificationPreference() {
  return {
    digestEnabled: false,
    digestFrequency: 'DAILY' as ProjectNotificationDigestFrequency,
    digestTime: DEFAULT_PROJECT_NOTIFICATION_TIME,
    digestWeekday: DEFAULT_PROJECT_NOTIFICATION_WEEKDAY,
    digestTimezone: PROJECT_NOTIFICATION_TIMEZONE,
    lastDigestSentAt: null as Date | null,
    nextDigestAt: null as Date | null,
  }
}

export async function queueOrSendProjectNotification(input: {
  recipient: { id: string; name?: string | null; email?: string | null }
  type: string
  subject: string
  heading: string
  bodyHtml: string
  actionUrl?: string | null
  actionLabel?: string | null
  projectId?: string | null
  taskId?: string | null
  dedupeKey?: string | null
  sendNow: () => Promise<{ messageId?: string | null }>
}) {
  const email = input.recipient.email?.trim()
  if (!email) return { success: false, skipped: true, reason: 'No recipient email found' }

  const preference = await prisma.projectNotificationPreference.findUnique({
    where: { userId: input.recipient.id },
  })

  if (!preference?.digestEnabled) {
    const info = await input.sendNow()
    return { success: true, queued: false, messageId: info.messageId }
  }

  if (!preference.nextDigestAt) {
    await prisma.projectNotificationPreference.update({
      where: { userId: input.recipient.id },
      data: {
        nextDigestAt: calculateNextProjectNotificationDigestAt({
          digestFrequency: preference.digestFrequency,
          digestTime: preference.digestTime,
          digestWeekday: preference.digestWeekday,
        }),
      },
    })
  }

  const data = {
    recipientId: input.recipient.id,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    type: input.type,
    subject: input.subject,
    heading: input.heading,
    bodyHtml: input.bodyHtml,
    actionUrl: input.actionUrl ?? null,
    actionLabel: input.actionLabel ?? null,
    dedupeKey: input.dedupeKey ?? null,
  }

  if (input.dedupeKey) {
    await prisma.projectNotificationDigestItem.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {
        subject: input.subject,
        heading: input.heading,
        bodyHtml: input.bodyHtml,
        actionUrl: input.actionUrl ?? null,
        actionLabel: input.actionLabel ?? null,
        skippedAt: null,
      },
      create: data,
    })
  } else {
    await prisma.projectNotificationDigestItem.create({ data })
  }

  return { success: true, queued: true }
}

function buildDigestEmailHtml(input: {
  recipientName: string
  items: Array<{
    heading: string
    subject: string
    bodyHtml: string
    actionUrl: string | null
    actionLabel: string | null
  }>
  appBaseUrl: string
}) {
  const rows = input.items
    .map((item) => `
      <li style="margin-bottom: 18px;">
        <div style="font-weight: 700; color: #111827;">${escapeHtml(item.heading)}</div>
        <div style="font-size: 13px; color: #4b5563; margin-bottom: 4px;">${escapeHtml(item.subject)}</div>
        <div>${item.bodyHtml}</div>
        ${item.actionUrl ? `<a href="${item.actionUrl}" style="font-size: 13px; color: #2563eb;">${escapeHtml(item.actionLabel || 'Open in Compass')}</a>` : ''}
      </li>
    `)
    .join('')

  return `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #111827; line-height: 1.5;">
      <h2 style="color: #2563eb; margin-bottom: 8px;">Compass Project Digest</h2>
      <p>Hi ${escapeHtml(input.recipientName || 'there')},</p>
      <p>You have <strong>${input.items.length}</strong> project notification${input.items.length === 1 ? '' : 's'} waiting for you.</p>
      <ul style="padding-left: 20px; margin: 16px 0;">
        ${rows}
      </ul>
      <p>
        <a href="${input.appBaseUrl}/projects" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none;">
          Open projects in Compass
        </a>
      </p>
    </div>
  `
}

export async function sendDueProjectNotificationDigests(input: {
  origin?: string | null
  dryRun?: boolean
  now?: Date
}) {
  const now = input.now ?? new Date()
  const dryRun = input.dryRun ?? false
  const appBaseUrl = getAppBaseUrl(input.origin)

  const preferences = await prisma.projectNotificationPreference.findMany({
    where: {
      digestEnabled: true,
      nextDigestAt: { lte: now },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { nextDigestAt: 'asc' },
  })

  const results: Array<{
    userId: string
    email: string | null
    itemCount: number
    success: boolean
    skipped?: boolean
    error?: string
  }> = []

  for (const preference of preferences) {
    const items = await prisma.projectNotificationDigestItem.findMany({
      where: {
        recipientId: preference.userId,
        sentAt: null,
        skippedAt: null,
        createdAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_DIGEST_ITEMS_PER_EMAIL,
    })

    const nextDigestAt = calculateNextProjectNotificationDigestAt({
      digestFrequency: preference.digestFrequency,
      digestTime: preference.digestTime,
      digestWeekday: preference.digestWeekday,
      from: now,
    })

    const email = preference.user.email?.trim() || null
    if (items.length === 0 || !email) {
      if (!dryRun) {
        await prisma.projectNotificationPreference.update({
          where: { userId: preference.userId },
          data: { nextDigestAt },
        })
      }
      results.push({
        userId: preference.userId,
        email,
        itemCount: items.length,
        success: true,
        skipped: true,
      })
      continue
    }

    if (dryRun) {
      results.push({
        userId: preference.userId,
        email,
        itemCount: items.length,
        success: true,
      })
      continue
    }

    try {
      await sendMail(
        email,
        `Compass project digest: ${items.length} update${items.length === 1 ? '' : 's'}`,
        buildDigestEmailHtml({
          recipientName: preference.user.name,
          appBaseUrl,
          items: items.map((item) => ({
            heading: item.heading,
            subject: item.subject,
            bodyHtml: item.bodyHtml,
            actionUrl: item.actionUrl,
            actionLabel: item.actionLabel,
          })),
        })
      )

      await prisma.$transaction([
        prisma.projectNotificationDigestItem.updateMany({
          where: { id: { in: items.map((item) => item.id) } },
          data: { sentAt: now },
        }),
        prisma.projectNotificationPreference.update({
          where: { userId: preference.userId },
          data: {
            lastDigestSentAt: now,
            nextDigestAt,
          },
        }),
      ])

      results.push({
        userId: preference.userId,
        email,
        itemCount: items.length,
        success: true,
      })
    } catch (error) {
      results.push({
        userId: preference.userId,
        email,
        itemCount: items.length,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send digest',
      })
    }
  }

  const failed = results.filter((result) => !result.success).length
  return {
    success: failed === 0,
    dryRun,
    eligibleUsers: preferences.length,
    sent: results.filter((result) => result.success && !result.skipped).length,
    skipped: results.filter((result) => result.skipped).length,
    failed,
    results,
  }
}
