import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'
import { formatReportAsHTML, generateDetailedReport } from './reports'
import { escapeHtml } from '@/lib/sanitize'
import { calculateLeaveDays } from '@/lib/leave-utils'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

// Validate Gmail credentials
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.warn('⚠️ GMAIL_USER or GMAIL_APP_PASSWORD missing or empty in .env. Emails will fail to send.')
}

const FROM_EMAIL = process.env.GMAIL_USER || 'plutuscompass@gmail.com'

function parseRecipientList(raw: string | undefined | null) {
  return (raw || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

async function getHrRecipientEmails() {
  const hrUsers = await prisma.user.findMany({
    where: {
      role: 'HR',
      email: { not: null },
    },
    select: { email: true },
  })
  return hrUsers.map((u) => u.email).filter(Boolean) as string[]
}

export async function sendMail(to: string, subject: string, html: string) {
  return transporter.sendMail({
    from: `P21 Compass <${FROM_EMAIL}>`,
    to,
    subject,
    html,
  })
}

export async function queueEmails(periodId: string) {
  const period = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  const employees = await prisma.user.findMany({
    where: { role: 'EMPLOYEE' },
  })

  const queueEntries = []

  for (const employee of employees) {
    // Check if report exists
    const report = await prisma.report.findUnique({
      where: {
        employeeId_periodId: {
          employeeId: employee.id,
          periodId,
        },
      },
    })

    if (!report) {
      continue // Skip if no report generated
    }

    // Check if email already queued
    const existingQueue = await prisma.emailQueue.findFirst({
      where: {
        employeeId: employee.id,
        reportId: report.id,
      },
    })

    if (!existingQueue) {
      const queueEntry = await prisma.emailQueue.create({
        data: {
          employeeId: employee.id,
          reportId: report.id,
          emailStatus: 'PENDING',
        },
      })
      queueEntries.push(queueEntry)
    }
  }

  return queueEntries
}

export async function sendEmail(emailQueueId: string) {
  const queueEntry = await prisma.emailQueue.findUnique({
    where: { id: emailQueueId },
    include: {
      employee: true,
      report: {
        include: {
          period: true,
        },
      },
    },
  })

  if (!queueEntry || !queueEntry.report) {
    throw new Error('Email queue entry or report not found')
  }

  if (queueEntry.emailStatus === 'SENT') {
    return { success: true, message: 'Email already sent' }
  }

  const employee = queueEntry.employee
  const period = queueEntry.report.period

  if (!employee.email) {
    await prisma.emailQueue.update({
      where: { id: emailQueueId },
      data: {
        emailStatus: 'FAILED',
        errorMessage: 'Employee email not found',
      },
    })
    throw new Error('Employee email not found')
  }

  try {
    // Generate detailed report for proper formatting
    const detailedReport = await generateDetailedReport(employee.id, period.id)
    const htmlContent = formatReportAsHTML(detailedReport, {
      startDate: period.startDate,
      endDate: period.endDate,
    })

    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: employee.email,
      subject: `Performance Evaluation Report - ${period.name}`,
      html: htmlContent,
    })

    await prisma.emailQueue.update({
      where: { id: emailQueueId },
      data: {
        emailStatus: 'SENT',
        sentAt: new Date(),
      },
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    await prisma.emailQueue.update({
      where: { id: emailQueueId },
      data: {
        emailStatus: 'FAILED',
        errorMessage: error.message || 'Unknown error',
      },
    })
    throw error
  }
}

export async function sendBatchEmails(periodId: string) {
  const queueEntries = await prisma.emailQueue.findMany({
    where: {
      report: {
        periodId,
      },
      emailStatus: 'PENDING',
    },
  })

  const results = []

  for (const queueEntry of queueEntries) {
    try {
      const result = await sendEmail(queueEntry.id)
      results.push({ queueId: queueEntry.id, success: true, result })
    } catch (error: any) {
      results.push({ queueId: queueEntry.id, success: false, error: error.message })
    }
  }

  return results
}

// Leave Management Email Functions

export async function sendLeaveRequestNotification(requestId: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
      coverPerson: true,
    },
  })

  if (!leaveRequest) {
    throw new Error('Leave request not found')
  }

  const employee = leaveRequest.employee
  const startDateValue = new Date(leaveRequest.startDate)
  const endDateValue = new Date(leaveRequest.endDate)
  const returnDateValue = new Date(endDateValue)
  returnDateValue.setDate(returnDateValue.getDate() + 1)

  const startDate = startDateValue.toLocaleDateString()
  const endDate = endDateValue.toLocaleDateString()
  const returnDate = returnDateValue.toLocaleDateString()
  const daysCount = calculateLeaveDays(startDateValue, endDateValue)

  const hrEmails = await getHrRecipientEmails()
  const fallbackRecipients = parseRecipientList(
    process.env.LEAVE_FALLBACK_RECIPIENTS || 'hr@plutus21.com,execution@plutus21.com'
  )

  // Get employee's lead(s)
  const leadMappings = await prisma.evaluatorMapping.findMany({
    where: {
      evaluateeId: employee.id,
      relationshipType: 'TEAM_LEAD',
    },
    include: {
      evaluator: true,
    },
  })

  const leadEmails = leadMappings
    .filter(m => m.evaluator.email)
    .map(m => m.evaluator.email!)

  // Optional additional recipients (notification only, not approval)
  let additionalEmails: string[] = []
  const additionalIds = leaveRequest.additionalNotifyIds as string[] | null
  if (additionalIds && Array.isArray(additionalIds) && additionalIds.length > 0) {
    const additionalUsers = await prisma.user.findMany({
      where: { id: { in: additionalIds } },
      select: { email: true },
    })
    additionalEmails = additionalUsers
      .filter(u => u.email)
      .map(u => u.email!)
  }

  // Cover person should receive the same request notification when assigned.
  const coverPersonEmail = leaveRequest.coverPerson?.email || null

  // Build recipient list: HR + configured fallback + leads + optional additional + cover person (deduplicated)
  const recipients = [...new Set([
    ...hrEmails,
    ...fallbackRecipients,
    ...leadEmails,
    ...additionalEmails,
    ...(coverPersonEmail ? [coverPersonEmail] : []),
  ])]
  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for leave request notification' }
  }

  const transitionPlan = (leaveRequest.transitionPlan || '').trim()

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Leave Request Submitted</h2>

      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Employee:</strong> ${escapeHtml(employee.name)}</p>
        <p><strong>Department:</strong> ${escapeHtml(employee.department) || 'N/A'}</p>
        <p><strong>Leave Type:</strong> ${escapeHtml(leaveRequest.leaveType)}</p>
        <p><strong>Start Date (first day off):</strong> ${startDate}</p>
        <p><strong>End Date (last day off):</strong> ${endDate}</p>
        <p><strong>Expected Return Date:</strong> ${returnDate}</p>
        <p><strong>Duration (working days):</strong> ${daysCount} day${daysCount > 1 ? 's' : ''}</p>
        <p><strong>Reason:</strong> ${escapeHtml(leaveRequest.reason)}</p>
        ${leaveRequest.coverPerson ? `<p><strong>Cover Person:</strong> ${escapeHtml(leaveRequest.coverPerson.name)}</p>` : ''}
      </div>

      ${transitionPlan ? `
        <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin: 0 0 10px; color: #92400E;">Transition Plan:</h4>
          <p style="margin: 0; color: #92400E;">${escapeHtml(transitionPlan)}</p>
        </div>
      ` : `
        <div style="background: #FFF7ED; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin: 0 0 10px; color: #9A3412;">Transition Plan:</h4>
          <p style="margin: 0; color: #9A3412;">Not submitted yet. A reminder will be sent before leave starts.</p>
        </div>
      `}

      <p style="color: #64748B; font-size: 14px;">
        Please review this request and take action in the HR Portal.
      </p>
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject: `Leave Request: ${employee.name} - ${leaveRequest.leaveType} (${startDate} to ${endDate})`,
      html: htmlContent,
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send leave request notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendLeaveApprovalNotification(
  requestId: string,
  status: 'approved' | 'rejected',
  approverName: string,
  comment?: string
) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
    },
  })

  if (!leaveRequest || !leaveRequest.employee.email) {
    return { success: false, message: 'Request or employee email not found' }
  }

  const employee = leaveRequest.employee
  const employeeEmail = employee.email as string // Already validated above
  const startDateValue = new Date(leaveRequest.startDate)
  const endDateValue = new Date(leaveRequest.endDate)
  const returnDateValue = new Date(endDateValue)
  returnDateValue.setDate(returnDateValue.getDate() + 1)

  const startDate = startDateValue.toLocaleDateString()
  const endDate = endDateValue.toLocaleDateString()
  const returnDate = returnDateValue.toLocaleDateString()
  const daysCount = calculateLeaveDays(startDateValue, endDateValue)

  const isApproved = status === 'approved'
  const statusColor = isApproved ? '#10B981' : '#EF4444'
  const statusBg = isApproved ? '#D1FAE5' : '#FEE2E2'

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${statusColor};">
        Leave Request ${isApproved ? 'Approved' : 'Rejected'}
      </h2>
      
      <div style="background: ${statusBg}; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="font-size: 18px; color: ${statusColor}; margin: 0;">
          Your ${leaveRequest.leaveType.toLowerCase()} leave request has been <strong>${status}</strong>.
        </p>
      </div>
      
      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Leave Type:</strong> ${leaveRequest.leaveType}</p>
        <p><strong>Start Date (first day off):</strong> ${startDate}</p>
        <p><strong>End Date (last day off):</strong> ${endDate}</p>
        <p><strong>Expected Return Date:</strong> ${returnDate}</p>
        <p><strong>Duration (working days):</strong> ${daysCount} day${daysCount > 1 ? 's' : ''}</p>
        <p><strong>${isApproved ? 'Approved' : 'Reviewed'} by:</strong> ${escapeHtml(approverName)}</p>
        ${comment ? `<p><strong>Comment:</strong> ${escapeHtml(comment)}</p>` : ''}
      </div>
      
      ${isApproved ? `
        <p style="color: #059669;">
          Your leave balance has been updated. Enjoy your time off!
        </p>
      ` : `
        <p style="color: #64748B;">
          If you have questions about this decision, please contact HR.
        </p>
      `}
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: employeeEmail,
      subject: `Leave Request ${isApproved ? 'Approved' : 'Rejected'}: ${leaveRequest.leaveType} (${startDate} - ${endDate})`,
      html: htmlContent,
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send leave approval notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendTransitionPlanReminderNotification(requestId: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
    },
  })

  if (!leaveRequest) {
    return { success: false, message: 'Leave request not found' }
  }

  if (!['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED'].includes(leaveRequest.status)) {
    return { success: false, message: 'Leave request is not active' }
  }

  if ((leaveRequest.transitionPlan || '').trim()) {
    return { success: false, message: 'Transition plan already provided' }
  }

  if (!leaveRequest.employee.email) {
    return { success: false, message: 'Employee email not found' }
  }

  const employee = leaveRequest.employee
  const employeeEmail = employee.email as string
  const startDateValue = new Date(leaveRequest.startDate)
  const endDateValue = new Date(leaveRequest.endDate)
  const returnDateValue = new Date(endDateValue)
  returnDateValue.setDate(returnDateValue.getDate() + 1)

  const startDate = startDateValue.toLocaleDateString()
  const endDate = endDateValue.toLocaleDateString()
  const returnDate = returnDateValue.toLocaleDateString()
  const daysCount = calculateLeaveDays(startDateValue, endDateValue)
  const msPerDay = 1000 * 60 * 60 * 24
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const leaveStart = new Date(startDateValue)
  leaveStart.setHours(0, 0, 0, 0)
  const daysUntilStart = Math.ceil((leaveStart.getTime() - today.getTime()) / msPerDay)

  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '')
  const leavePageUrl = appBaseUrl ? `${appBaseUrl}/leave` : ''
  const timelineMessage =
    daysUntilStart <= 0
      ? 'Your leave starts today.'
      : daysUntilStart === 1
        ? 'Your leave starts tomorrow.'
        : `Your leave starts in ${daysUntilStart} days.`

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #D97706;">Transition Plan Reminder</h2>

      <p>Hi ${escapeHtml(employee.name)},</p>
      <p style="color: #92400E;"><strong>${timelineMessage}</strong></p>
      <p>Please add your transition plan for this leave request so your team has handover details.</p>

      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Leave Type:</strong> ${escapeHtml(leaveRequest.leaveType)}</p>
        <p><strong>Start Date (first day off):</strong> ${startDate}</p>
        <p><strong>End Date (last day off):</strong> ${endDate}</p>
        <p><strong>Expected Return Date:</strong> ${returnDate}</p>
        <p><strong>Duration (working days):</strong> ${daysCount} day${daysCount > 1 ? 's' : ''}</p>
        <p><strong>Reason:</strong> ${escapeHtml(leaveRequest.reason)}</p>
      </div>

      ${
        leavePageUrl
          ? `<p><a href="${leavePageUrl}" style="display:inline-block;background:#4F46E5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Open Leave Management</a></p>`
          : ''
      }

      <p style="color: #64748B; font-size: 14px;">
        If your leave details have changed, please update the request in the portal.
      </p>
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: employeeEmail,
      subject: `Reminder: Add transition plan for leave (${startDate} to ${endDate})`,
      html: htmlContent,
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send transition plan reminder:', error)
    return { success: false, error: error.message }
  }
}

// Device Management Email Functions
async function getSupportRecipientEmails() {
  const supportUsers = await prisma.user.findMany({
    where: {
      role: { in: ['HR', 'SECURITY'] },
      email: { not: null },
    },
    select: { email: true },
  })

  return [...new Set(supportUsers.map((u) => u.email).filter(Boolean) as string[])]
}

export async function sendNewTicketNotificationToHR(ticketId: string) {
  const ticket = await prisma.deviceTicket.findUnique({
    where: { id: ticketId },
    include: {
      employee: true,
    },
  })

  if (!ticket) {
    console.error(`[Email] New ticket ${ticketId} not found`)
    return { success: false, message: 'Ticket not found' }
  }

  const recipients = await getSupportRecipientEmails()
  if (recipients.length === 0) {
    console.warn('[Email] No HR/Security recipients found for new ticket notification')
    return { success: false, message: 'No support recipients configured' }
  }

  const priorityColors: Record<string, string> = {
    LOW: '#6B7280',
    MEDIUM: '#3B82F6',
    HIGH: '#F59E0B',
    URGENT: '#EF4444',
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">New Device Support Ticket</h2>

      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Employee:</strong> ${escapeHtml(ticket.employee.name)}</p>
        <p><strong>Department:</strong> ${escapeHtml(ticket.employee.department) || 'N/A'}</p>
        <p><strong>Device:</strong> ${escapeHtml(ticket.deviceType)}</p>
        <p><strong>Priority:</strong> <span style="color: ${priorityColors[ticket.priority]}; font-weight: bold;">${ticket.priority}</span></p>
        <p><strong>Issue:</strong> ${escapeHtml(ticket.title)}</p>
      </div>

      <div style="background: #FFFBEB; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #FEF3C7;">
        <h4 style="margin: 0 0 10px; color: #92400E;">Description:</h4>
        <p style="margin: 0; color: #92400E; white-space: pre-wrap;">${escapeHtml(ticket.description)}</p>
      </div>

      <p style="color: #64748B; font-size: 14px;">
        Please review and update the ticket status in the support dashboard.
      </p>
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject: `New Device Support Ticket [${ticket.priority}]: ${ticket.title}`,
      html: htmlContent,
    })
    console.log(`[Email] New ticket notification sent to support team: ${ticketId}`)
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error(`[Email] Failed to send new ticket notification to support team:`, error)
    return { success: false, error: error.message }
  }
}

export async function sendTicketStatusNotification(
  ticketId: string,
  updatedByName?: string,
  updatedByRole?: 'EMPLOYEE' | 'HR' | 'SECURITY' | 'OA'
) {
  console.log(`[Email] Triggering status notification for ticket: ${ticketId}`)

  const ticket = await prisma.deviceTicket.findUnique({
    where: { id: ticketId },
    include: {
      employee: true,
    },
  })

  if (!ticket) {
    console.error(`[Email] Ticket ${ticketId} not found for notification`)
    return { success: false, message: 'Ticket not found' }
  }

  const employee = ticket.employee
  const supportRecipients = await getSupportRecipientEmails()
  const recipients = [...new Set([employee.email, ...supportRecipients].filter(Boolean) as string[])]
  if (recipients.length === 0) {
    return { success: false, message: 'No recipients available for status notification' }
  }

  const statusLabels: Record<string, string> = {
    OPEN: 'Open',
    UNDER_REVIEW: 'Under Review',
    SOLUTION: 'Solution Provided',
    RESOLVED: 'Resolved',
  }

  const statusColors: Record<string, { text: string; bg: string }> = {
    OPEN: { text: '#3B82F6', bg: '#DBEAFE' },
    UNDER_REVIEW: { text: '#F59E0B', bg: '#FEF3C7' },
    SOLUTION: { text: '#8B5CF6', bg: '#EDE9FE' },
    RESOLVED: { text: '#10B981', bg: '#D1FAE5' },
  }

  const statusLabel = statusLabels[ticket.status] || ticket.status
  const colors = statusColors[ticket.status] || { text: '#6B7280', bg: '#F3F4F6' }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Device Support Ticket Update</h2>

      <div style="background: ${colors.bg}; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="font-size: 18px; color: ${colors.text}; margin: 0;">
          Your ticket status has been updated to: <strong>${statusLabel}</strong>
        </p>
      </div>

      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Employee:</strong> ${escapeHtml(employee.name)}</p>
        <p><strong>Ticket:</strong> ${escapeHtml(ticket.title)}</p>
        <p><strong>Device:</strong> ${escapeHtml(ticket.deviceType)}</p>
        <p><strong>Priority:</strong> ${ticket.priority}</p>
        ${ticket.expectedResolutionDate ? `<p><strong>Expected Resolution:</strong> ${new Date(ticket.expectedResolutionDate).toLocaleDateString()}</p>` : ''}
        ${ticket.hrAssignedTo ? `<p><strong>Handled by:</strong> ${escapeHtml(ticket.hrAssignedTo)}</p>` : ''}
        ${updatedByName ? `<p><strong>Updated by:</strong> ${escapeHtml(updatedByName)}${updatedByRole ? ` (${escapeHtml(updatedByRole)})` : ''}</p>` : ''}
      </div>

      ${ticket.solution ? `
        <div style="background: #EDE9FE; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin: 0 0 10px; color: #6D28D9;">Solution:</h4>
          <p style="margin: 0; color: #5B21B6; white-space: pre-wrap;">${escapeHtml(ticket.solution)}</p>
        </div>
      ` : ''}

      ${ticket.status === 'RESOLVED' ? `
        <p style="color: #059669;">
          This ticket has been resolved. If you're still experiencing issues, feel free to open a new ticket.
        </p>
      ` : `
        <p style="color: #64748B; font-size: 14px;">
          You can check the latest updates on your ticket in the Compass portal.
        </p>
      `}
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject: `Device Support Ticket ${statusLabel}: ${ticket.title}`,
      html: htmlContent,
    })

    console.log(`[Email] Status notification sent to ${recipients.length} recipients for ticket: ${ticketId}`)
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error(`[Email] Failed to send status notification for ticket: ${ticketId}`, error)
    return { success: false, error: error.message }
  }
}
