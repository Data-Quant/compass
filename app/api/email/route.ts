import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { queueEmails, sendEmail, sendBatchEmails, sendMail } from '@/lib/email'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'
import { shouldReceiveConstantEvaluations } from '@/lib/evaluation-profile-rules'
import { escapeHtml } from '@/lib/sanitize'

async function resolvePeriodId(periodId: string) {
  if (periodId !== 'active') return periodId

  const activePeriod = await prisma.evaluationPeriod.findFirst({
    where: { isActive: true },
    select: { id: true },
  })

  return activePeriod?.id || null
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action, periodId, emailQueueId, queueId, employeeIds, subject, message, extraEmails } =
      await request.json()

    if (action === 'queue') {
      if (!periodId) {
        return NextResponse.json(
          { error: 'periodId is required' },
          { status: 400 }
        )
      }
      const queueEntries = await queueEmails(
        periodId,
        Array.isArray(employeeIds) ? employeeIds.filter((id) => typeof id === 'string') : undefined
      )
      return NextResponse.json({ success: true, count: queueEntries.length, queueEntries })
    }

    if (action === 'send-custom') {
      const recipientIds = Array.isArray(employeeIds)
        ? employeeIds.filter((id) => typeof id === 'string')
        : []
      const manualEmails = Array.isArray(extraEmails)
        ? extraEmails.filter((email) => typeof email === 'string')
        : typeof extraEmails === 'string'
          ? extraEmails.split(',')
          : []
      const cleanSubject = typeof subject === 'string' ? subject.trim() : ''
      const cleanMessage = typeof message === 'string' ? message.trim() : ''

      if (!cleanSubject || !cleanMessage) {
        return NextResponse.json(
          { error: 'Subject and message are required' },
          { status: 400 }
        )
      }

      const selectedUsers =
        recipientIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: recipientIds } },
              select: { email: true, name: true, department: true },
            })
          : []
      const selectedUserEmails = selectedUsers
        .filter((user) => shouldReceiveConstantEvaluations(user))
        .map((user) => user.email?.trim())
        .filter(Boolean) as string[]
      const recipients = [
        ...new Set(
          [...selectedUserEmails, ...manualEmails.map((email) => email.trim())].filter(
            (email) => email && email.includes('@')
          )
        ),
      ]

      if (recipients.length === 0) {
        return NextResponse.json(
          { error: 'At least one valid recipient is required' },
          { status: 400 }
        )
      }

      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          ${escapeHtml(cleanMessage).replace(/\n/g, '<br />')}
        </div>
      `
      const results = []

      for (const recipient of recipients) {
        try {
          const result = await sendMail(recipient, cleanSubject, html)
          results.push({ recipient, success: true, messageId: result.messageId })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to send'
          results.push({ recipient, success: false, error: errorMessage })
        }
      }

      const sent = results.filter((result) => result.success).length
      const failed = results.length - sent
      return NextResponse.json({ success: failed === 0, sent, failed, results })
    }

    if (action === 'send' || action === 'send-single') {
      const targetQueueId = emailQueueId || queueId

      if (!targetQueueId) {
        return NextResponse.json(
          { error: 'emailQueueId is required' },
          { status: 400 }
        )
      }
      const result = await sendEmail(targetQueueId)
      return NextResponse.json({ success: true, result })
    }

    if (action === 'send-batch' || action === 'send-all') {
      if (!periodId) {
        return NextResponse.json(
          { error: 'periodId is required' },
          { status: 400 }
        )
      }
      const results = await sendBatchEmails(periodId)
      const sent = results.filter((result) => result.success).length
      const failed = results.length - sent
      return NextResponse.json({ success: true, sent, failed, results })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to process email action:', error)
    return NextResponse.json(
      { error: 'Failed to process email action' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId')

    if (!periodId) {
      return NextResponse.json(
        { error: 'periodId is required' },
        { status: 400 }
      )
    }

    const resolvedPeriodId = await resolvePeriodId(periodId)

    if (!resolvedPeriodId) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 })
    }

    const [queueEntries, users] = await Promise.all([
      prisma.emailQueue.findMany({
        where: {
          report: {
            periodId: resolvedPeriodId,
          },
        },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              email: true,
              department: true,
            },
          },
          report: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          position: true,
        },
        orderBy: {
          name: 'asc',
        },
      }),
    ])

    const queueByEmployeeId = new Map(queueEntries.map((entry) => [entry.employeeId, entry]))
    const recipients = users
      .filter((candidate) => shouldReceiveConstantEvaluations(candidate))
      .map((candidate) => {
        const queueEntry = queueByEmployeeId.get(candidate.id)
        return {
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          department: candidate.department,
          position: candidate.position,
          queued: Boolean(queueEntry),
          emailStatus: queueEntry?.emailStatus || null,
        }
      })

    return NextResponse.json({ queueEntries, recipients })
  } catch (error) {
    console.error('Failed to fetch email queue:', error)
    return NextResponse.json(
      { error: 'Failed to fetch email queue' },
      { status: 500 }
    )
  }
}
