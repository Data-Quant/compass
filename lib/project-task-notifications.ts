import { prisma } from '@/lib/db'
import { sendMail } from '@/lib/email'
import { escapeHtml } from '@/lib/sanitize'

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
