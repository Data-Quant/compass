import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendMail } from '@/lib/email'
import { isAdminRole } from '@/lib/permissions'
import { queueOrSendProjectNotification } from '@/lib/project-notification-digests'
import { escapeHtml } from '@/lib/sanitize'

export const runtime = 'nodejs'

const reminderBodySchema = z.object({
  daysBeforeDue: z.coerce.number().int().min(0).max(14).optional(),
  includeOverdue: z.boolean().optional(),
  dryRun: z.boolean().optional(),
})

const reminderQuerySchema = z.object({
  daysBeforeDue: z.coerce.number().int().min(0).max(14).optional(),
  includeOverdue: z.coerce.boolean().optional(),
  dryRun: z.coerce.boolean().optional(),
})

type PendingTask = {
  id: string
  title: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  dueDate: Date | null
  section: { name: string } | null
  project: { id: string; name: string }
  assignee: { id: string; name: string; email: string | null } | null
}

function normalizeBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function getAppBaseUrl(origin: string) {
  return (
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeBaseUrl(process.env.APP_URL) ||
    normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalizeBaseUrl(process.env.VERCEL_URL) ||
    normalizeBaseUrl(origin) ||
    'http://localhost:3000'
  )
}

function isReminderJobAuthorized(request: NextRequest) {
  const secret = process.env.PROJECT_TASK_REMINDER_CRON_SECRET || process.env.CRON_SECRET
  if (!secret) return false

  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return false

  const token = authHeader.slice(7).trim()
  return token.length > 0 && token === secret
}

async function validateReminderAuth(request: NextRequest) {
  const user = await getSession()
  const allowCron = isReminderJobAuthorized(request)
  const isAdmin = Boolean(user && isAdminRole(user.role))
  return isAdmin || allowCron
}

function toDayStart(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function formatTaskStatus(status: PendingTask['status']) {
  if (status === 'TODO') return 'To Do'
  if (status === 'IN_PROGRESS') return 'In Progress'
  return 'Done'
}

function formatDueDate(dueDate: Date | null) {
  if (!dueDate) return 'No due date'
  return dueDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getDueLabel(dueDate: Date | null, today: Date) {
  if (!dueDate) return 'No due date'
  const dueDay = toDayStart(dueDate)
  const todayDay = toDayStart(today)
  const diffDays = Math.round((dueDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  return `Due in ${diffDays} days`
}

function buildTaskListHtml(tasks: PendingTask[], appBaseUrl: string, today: Date) {
  return tasks
    .map((task) => {
      const section = task.section?.name ? ` - ${escapeHtml(task.section.name)}` : ''
      const projectUrl = `${appBaseUrl}/projects/${encodeURIComponent(task.project.id)}`
      return `
        <li style="margin-bottom: 14px;">
          <strong>${escapeHtml(task.title)}</strong>
          <div style="font-size: 13px; color: #4b5563;">
            ${escapeHtml(task.project.name)}${section} - ${formatTaskStatus(task.status)} - ${task.priority} priority
          </div>
          <div style="font-size: 13px; color: #dc2626;">
            ${getDueLabel(task.dueDate, today)} - ${formatDueDate(task.dueDate)}
          </div>
          <a href="${projectUrl}" style="font-size: 13px; color: #2563eb;">Open project</a>
        </li>
      `
    })
    .join('')
}

function buildDeadlineReminderEmail(input: {
  assigneeName: string
  appBaseUrl: string
  today: Date
  tasks: PendingTask[]
}) {
  const bodyHtml = buildDeadlineReminderBodyHtml(input)
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; line-height: 1.5;">
      <h2 style="color: #2563eb; margin-bottom: 8px;">Task Deadline Reminder</h2>
      <p>Hi ${escapeHtml(input.assigneeName)},</p>
      ${bodyHtml}
    </div>
  `
}

function buildDeadlineReminderBodyHtml(input: {
  appBaseUrl: string
  today: Date
  tasks: PendingTask[]
}) {
  return `
      <p>You have <strong>${input.tasks.length}</strong> pending Compass task${input.tasks.length === 1 ? '' : 's'} with upcoming or overdue deadlines.</p>
      <ul style="padding-left: 20px; margin: 16px 0;">
        ${buildTaskListHtml(input.tasks, input.appBaseUrl, input.today)}
      </ul>
      <p style="font-size: 13px; color: #6b7280;">This automated reminder is based on task due dates in Compass.</p>
  `
}

async function runProjectTaskDeadlineReminders(input: {
  daysBeforeDue?: number
  includeOverdue?: boolean
  dryRun?: boolean
  origin: string
}) {
  const daysBeforeDue = input.daysBeforeDue ?? 1
  const includeOverdue = input.includeOverdue ?? true
  const dryRun = input.dryRun ?? false

  const today = toDayStart(new Date())
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + daysBeforeDue)

  const dueDateFilter = includeOverdue
    ? { lte: cutoff }
    : { gte: today, lte: cutoff }

  const tasks = await prisma.task.findMany({
    where: {
      status: { not: 'DONE' },
      assigneeId: { not: null },
      dueDate: dueDateFilter,
      project: { status: 'ACTIVE' },
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      section: { select: { name: true } },
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
  })

  const tasksByAssignee = new Map<string, { assignee: NonNullable<PendingTask['assignee']>; tasks: PendingTask[] }>()
  let skipped = 0

  for (const task of tasks as PendingTask[]) {
    if (!task.assignee?.email?.trim()) {
      skipped += 1
      continue
    }

    const existing = tasksByAssignee.get(task.assignee.id)
    if (existing) {
      existing.tasks.push(task)
    } else {
      tasksByAssignee.set(task.assignee.id, {
        assignee: task.assignee,
        tasks: [task],
      })
    }
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      daysBeforeDue,
      includeOverdue,
      eligibleTasks: tasks.length,
      eligibleRecipients: tasksByAssignee.size,
      skipped,
    }
  }

  const appBaseUrl = getAppBaseUrl(input.origin)
  const results: Array<{ userId: string; email: string; success: boolean; queued?: boolean; taskCount: number; error?: string }> = []

  for (const group of tasksByAssignee.values()) {
    const email = group.assignee.email?.trim()
    if (!email) continue

    try {
      const subject = `Compass task deadlines: ${group.tasks.length} pending`
      const bodyHtml = buildDeadlineReminderBodyHtml({
        appBaseUrl,
        today,
        tasks: group.tasks,
      })
      const info = await queueOrSendProjectNotification({
        recipient: group.assignee,
        type: 'TASK_DEADLINE_REMINDER',
        subject,
        heading: 'Task Deadline Reminder',
        bodyHtml,
        actionUrl: `${appBaseUrl}/projects`,
        actionLabel: 'Open projects in Compass',
        dedupeKey: `task-deadline:${group.assignee.id}:${today.toISOString().slice(0, 10)}:${daysBeforeDue}:${includeOverdue ? 'with-overdue' : 'upcoming-only'}`,
        sendNow: () => sendMail(
          email,
          subject,
          buildDeadlineReminderEmail({
            assigneeName: group.assignee.name,
            appBaseUrl,
            today,
            tasks: group.tasks,
          })
        ),
      })
      results.push({
        userId: group.assignee.id,
        email,
        success: true,
        queued: Boolean(info.queued),
        taskCount: group.tasks.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send reminder'
      results.push({
        userId: group.assignee.id,
        email,
        success: false,
        taskCount: group.tasks.length,
        error: message,
      })
    }
  }

  const sent = results.filter((result) => result.success).length
  const failed = results.length - sent

  return {
    success: failed === 0,
    dryRun: false,
    daysBeforeDue,
    includeOverdue,
    eligibleTasks: tasks.length,
    eligibleRecipients: tasksByAssignee.size,
    skipped,
    sent,
    failed,
    results,
  }
}

export async function GET(request: NextRequest) {
  try {
    const authorized = await validateReminderAuth(request)
    if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const parsed = reminderQuerySchema.safeParse({
      daysBeforeDue: searchParams.get('daysBeforeDue') ?? undefined,
      includeOverdue: searchParams.get('includeOverdue') ?? undefined,
      dryRun: searchParams.get('dryRun') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query params', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const result = await runProjectTaskDeadlineReminders({
      daysBeforeDue: parsed.data.daysBeforeDue,
      includeOverdue: parsed.data.includeOverdue,
      dryRun: parsed.data.dryRun,
      origin: request.nextUrl.origin,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to send project task deadline reminders:', error)
    return NextResponse.json(
      { error: 'Failed to send project task deadline reminders' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await validateReminderAuth(request)
    if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const parsed = reminderBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const result = await runProjectTaskDeadlineReminders({
      daysBeforeDue: parsed.data.daysBeforeDue,
      includeOverdue: parsed.data.includeOverdue,
      dryRun: parsed.data.dryRun,
      origin: request.nextUrl.origin,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to send project task deadline reminders:', error)
    return NextResponse.json(
      { error: 'Failed to send project task deadline reminders' },
      { status: 500 }
    )
  }
}
