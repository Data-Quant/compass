import { prisma } from '@/lib/db'
import { sendMail } from '@/lib/email'
import { escapeHtml } from '@/lib/sanitize'

function normalizeBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function getAppBaseUrl(origin?: string | null) {
  return (
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeBaseUrl(process.env.APP_URL) ||
    normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalizeBaseUrl(process.env.VERCEL_URL) ||
    normalizeBaseUrl(origin) ||
    'http://localhost:3000'
  )
}

function uniqueEmails(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const out: string[] = []

  for (const value of values) {
    const email = value?.trim()
    if (!email) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(email)
  }

  return out
}

async function sendProjectMail(input: {
  to: string
  subject: string
  heading: string
  greetingName?: string | null
  bodyHtml: string
  actionUrl: string
  actionLabel: string
}) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; line-height: 1.5;">
      <h2 style="color: #2563eb; margin-bottom: 8px;">${escapeHtml(input.heading)}</h2>
      <p>Hi ${escapeHtml(input.greetingName || 'there')},</p>
      ${input.bodyHtml}
      <p>
        <a href="${input.actionUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none;">
          ${escapeHtml(input.actionLabel)}
        </a>
      </p>
    </div>
  `

  return sendMail(input.to, input.subject, html)
}

export async function sendProjectInvitationNotification(input: {
  projectId: string
  userId: string
  actorId: string
  origin?: string | null
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true },
  })
  const [recipient, actor] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId }, select: { name: true, email: true } }),
    prisma.user.findUnique({ where: { id: input.actorId }, select: { name: true } }),
  ])

  if (!project || !recipient?.email?.trim()) {
    return { success: false, skipped: true, reason: 'No project or recipient email found' }
  }

  const projectUrl = `${getAppBaseUrl(input.origin)}/projects/${encodeURIComponent(project.id)}`
  const info = await sendProjectMail({
    to: recipient.email,
    subject: `You were added to ${project.name}`,
    heading: 'Project invitation',
    greetingName: recipient.name,
    bodyHtml: `
      <p>${escapeHtml(actor?.name || 'A teammate')} added you to <strong>${escapeHtml(project.name)}</strong> in Compass.</p>
    `,
    actionUrl: projectUrl,
    actionLabel: 'Open project in Compass',
  })

  return { success: true, messageId: info.messageId }
}

export async function sendTaskAssignmentNotification(input: {
  taskId: string
  userIds: string[]
  actorId: string
  origin?: string | null
  context?: 'assignee' | 'assistant'
}) {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: {
      id: true,
      title: true,
      project: { select: { id: true, name: true } },
    },
  })

  if (!task || input.userIds.length === 0) {
    return { success: false, skipped: true, reason: 'No task or recipients found' }
  }

  const [actor, recipients] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.actorId }, select: { name: true, email: true } }),
    prisma.user.findMany({
      where: { id: { in: input.userIds } },
      select: { id: true, name: true, email: true },
    }),
  ])

  const actorEmail = actor?.email?.trim().toLowerCase()
  const projectUrl = `${getAppBaseUrl(input.origin)}/projects/${encodeURIComponent(task.project.id)}`
  const results: Array<{ userId: string; email: string; success: boolean; error?: string }> = []

  for (const recipient of recipients) {
    const email = recipient.email?.trim()
    if (!email || email.toLowerCase() === actorEmail) continue

    try {
      const label = input.context === 'assistant' ? 'added you as an assistant on' : 'assigned you to'
      await sendProjectMail({
        to: email,
        subject: `Compass task: ${task.title}`,
        heading: input.context === 'assistant' ? 'Task assistant added' : 'Task assigned',
        greetingName: recipient.name,
        bodyHtml: `
          <p>${escapeHtml(actor?.name || 'A teammate')} ${label} <strong>${escapeHtml(task.title)}</strong>.</p>
          <p><strong>Project:</strong> ${escapeHtml(task.project.name)}</p>
        `,
        actionUrl: projectUrl,
        actionLabel: 'Open task project',
      })
      results.push({ userId: recipient.id, email, success: true })
    } catch (error) {
      results.push({
        userId: recipient.id,
        email,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send task notification',
      })
    }
  }

  return { success: results.every((result) => result.success), results }
}

export async function sendTaskActivityNotification(input: {
  taskId: string
  actorId: string | null
  summary: string
  origin?: string | null
}) {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: {
      id: true,
      title: true,
      project: {
        select: {
          id: true,
          name: true,
          owner: { select: { email: true } },
        },
      },
      assignee: { select: { name: true, email: true } },
    },
  })

  if (!task) return { success: false, skipped: true, reason: 'Task not found' }

  const actor = input.actorId
    ? await prisma.user.findUnique({ where: { id: input.actorId }, select: { email: true } })
    : null
  const actorEmail = actor?.email?.trim().toLowerCase()
  const recipients = uniqueEmails([task.assignee?.email, task.project.owner.email])
    .filter((email) => email.toLowerCase() !== actorEmail)

  if (recipients.length === 0) {
    return { success: false, skipped: true, reason: 'No notification recipients found' }
  }

  const projectUrl = `${getAppBaseUrl(input.origin)}/projects/${encodeURIComponent(task.project.id)}`
  const results: Array<{ email: string; success: boolean; error?: string }> = []

  for (const email of recipients) {
    try {
      await sendProjectMail({
        to: email,
        subject: `Task updated: ${task.title}`,
        heading: 'Task updated',
        greetingName: email.toLowerCase() === task.assignee?.email?.trim().toLowerCase() ? task.assignee?.name : null,
        bodyHtml: `
          <p>${escapeHtml(input.summary)}</p>
          <p><strong>Project:</strong> ${escapeHtml(task.project.name)}</p>
          <p><strong>Task:</strong> ${escapeHtml(task.title)}</p>
        `,
        actionUrl: projectUrl,
        actionLabel: 'Open task project',
      })
      results.push({ email, success: true })
    } catch (error) {
      results.push({
        email,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send activity notification',
      })
    }
  }

  return { success: results.every((result) => result.success), results }
}

export async function sendChildTaskCompletedNotification(taskId: string, origin?: string | null) {
  const childTask = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      project: { select: { id: true, name: true } },
      parentTask: {
        select: {
          id: true,
          title: true,
          assignee: { select: { name: true, email: true } },
        },
      },
    },
  })

  const parentTask = childTask?.parentTask
  const recipientEmail = parentTask?.assignee?.email?.trim()
  if (!childTask || !parentTask || !recipientEmail) {
    return { success: false, skipped: true, reason: 'No parent assignee email found' }
  }

  const projectUrl = `${getAppBaseUrl(origin)}/projects/${encodeURIComponent(childTask.project.id)}`
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; line-height: 1.5;">
      <h2 style="color: #2563eb; margin-bottom: 8px;">Child Task Completed</h2>
      <p>Hi ${escapeHtml(parentTask.assignee?.name || 'there')},</p>
      <p>The child task <strong>${escapeHtml(childTask.title)}</strong> has been completed.</p>
      <p><strong>Parent task:</strong> ${escapeHtml(parentTask.title)}</p>
      <p><strong>Project:</strong> ${escapeHtml(childTask.project.name)}</p>
      <p>
        <a href="${projectUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none;">
          Open project in Compass
        </a>
      </p>
    </div>
  `

  const info = await sendMail(
    recipientEmail,
    `Child task completed: ${childTask.title}`,
    html
  )

  return { success: true, messageId: info.messageId }
}
