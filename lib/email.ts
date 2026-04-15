import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'
import { formatReportAsHTML, generateDetailedReport } from './reports'
import { escapeHtml } from '@/lib/sanitize'
import { calculateLeaveDuration } from '@/lib/leave-utils'
import { safeRecordLeaveAuditEvent } from '@/lib/leave-audit'
import { calculateWfhDays } from '@/lib/wfh-utils'
import { normalizeCoverPersonIds } from '@/lib/leave-cover'

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
const DEFAULT_ONBOARDING_EXECUTION_RECIPIENT = 'execution@plutus21.com'

function parseRecipientList(raw: string | undefined | null) {
  return (raw || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

function getLeaveDurationLabel(days: number) {
  if (days === 0.5) return '0.5 day'
  return `${days} day${days > 1 ? 's' : ''}`
}

function getHalfDayDetailsHtml(leaveRequest: {
  isHalfDay: boolean
  halfDaySession: 'FIRST_HALF' | 'SECOND_HALF' | null
  unavailableStartTime: string | null
  unavailableEndTime: string | null
}) {
  if (!leaveRequest.isHalfDay) return ''
  const sessionLabel = leaveRequest.halfDaySession === 'FIRST_HALF' ? 'First half' : 'Second half'
  const unavailableHours =
    leaveRequest.unavailableStartTime && leaveRequest.unavailableEndTime
      ? `${leaveRequest.unavailableStartTime} - ${leaveRequest.unavailableEndTime}`
      : 'Not provided'

  return `
    <p><strong>Half-day Session:</strong> ${sessionLabel}</p>
    <p><strong>Unavailable Hours:</strong> ${escapeHtml(unavailableHours)}</p>
  `
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

async function getExecutionRecipientEmails() {
  const executionUsers = await prisma.user.findMany({
    where: {
      role: 'EXECUTION',
      email: { not: null },
    },
    select: { email: true },
  })

  return executionUsers.map((u) => u.email).filter(Boolean) as string[]
}

function getOnboardingExecutionRecipients() {
  return parseRecipientList(
    process.env.ONBOARDING_EXECUTION_RECIPIENTS || DEFAULT_ONBOARDING_EXECUTION_RECIPIENT
  )
}

function mergeRecipientEmails(...groups: Array<Array<string | null | undefined>>) {
  return [
    ...new Set(
      groups
        .flat()
        .map((email) => email?.trim())
        .filter(Boolean) as string[]
    ),
  ]
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
  const daysCount = calculateLeaveDuration(startDateValue, endDateValue, leaveRequest.isHalfDay)
  const durationLabel = getLeaveDurationLabel(daysCount)
  const subject = `Leave Request: ${employee.name} - ${leaveRequest.leaveType} (${startDate} to ${endDate})`

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

  const coverPersonIds = normalizeCoverPersonIds(
    leaveRequest.coverPersonIds,
    leaveRequest.coverPerson?.id ?? null,
    employee.id
  )
  const coverPeople = coverPersonIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: coverPersonIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const coverPersonEmails = coverPeople
    .filter((coverPerson) => coverPerson.email)
    .map((coverPerson) => coverPerson.email!)
  const coverPersonNames = coverPeople.map((coverPerson) => coverPerson.name)

  // Build recipient list: HR + configured fallback + leads + optional additional + cover people (deduplicated)
  const recipients = [...new Set([
    ...hrEmails,
    ...fallbackRecipients,
    ...leadEmails,
    ...additionalEmails,
    ...coverPersonEmails,
  ])]
  if (recipients.length === 0) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'REQUEST_NOTIFICATION',
      status: 'SKIPPED',
      recipients,
      subject,
      metadata: {
        reason: 'No recipients configured for leave request notification',
      },
    })
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
        <p><strong>Expected Return Date:</strong> ${leaveRequest.isHalfDay ? 'Same day' : returnDate}</p>
        <p><strong>Duration (working days):</strong> ${durationLabel}</p>
        ${getHalfDayDetailsHtml(leaveRequest)}
        <p><strong>Reason:</strong> ${escapeHtml(leaveRequest.reason)}</p>
        ${coverPersonNames.length > 0 ? `<p><strong>Cover People:</strong> ${escapeHtml(coverPersonNames.join(', '))}</p>` : ''}
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
      subject,
      html: htmlContent,
    })

    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'REQUEST_NOTIFICATION',
      status: 'SUCCESS',
      recipients,
      subject,
      providerMessageId: info.messageId || null,
      metadata: {
        leaveStatus: leaveRequest.status,
        recipientCount: recipients.length,
        isHalfDay: leaveRequest.isHalfDay,
      },
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send leave request notification:', error)
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'REQUEST_NOTIFICATION',
      status: 'FAILED',
      recipients,
      subject,
      metadata: {
        leaveStatus: leaveRequest.status,
        recipientCount: recipients.length,
        isHalfDay: leaveRequest.isHalfDay,
      },
      error,
    })
    return { success: false, error: error.message }
  }
}

export async function sendWfhRequestNotification(requestId: string) {
  const wfhRequest = await prisma.wfhRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
    },
  })

  if (!wfhRequest) {
    throw new Error('WFH request not found')
  }

  const employee = wfhRequest.employee
  const startDateValue = new Date(wfhRequest.startDate)
  const endDateValue = new Date(wfhRequest.endDate)
  const startDate = startDateValue.toLocaleDateString()
  const endDate = endDateValue.toLocaleDateString()
  const daysCount = calculateWfhDays(startDateValue, endDateValue)
  const durationLabel = getLeaveDurationLabel(daysCount)
  const subject = `WFH Request: ${employee.name} (${startDate} to ${endDate})`

  const hrEmails = await getHrRecipientEmails()
  const executionEmails = await getExecutionRecipientEmails()
  const fallbackRecipients = parseRecipientList(
    process.env.WFH_FALLBACK_RECIPIENTS || 'hr@plutus21.com,execution@plutus21.com'
  )

  const recipients = mergeRecipientEmails(hrEmails, executionEmails, fallbackRecipients)
  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for WFH request notification' }
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0F766E;">WFH Request Submitted</h2>

      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Employee:</strong> ${escapeHtml(employee.name)}</p>
        <p><strong>Department:</strong> ${escapeHtml(employee.department) || 'N/A'}</p>
        <p><strong>Start Date:</strong> ${startDate}</p>
        <p><strong>End Date:</strong> ${endDate}</p>
        <p><strong>Duration (working days):</strong> ${durationLabel}</p>
        <p><strong>Reason:</strong> ${escapeHtml(wfhRequest.reason)}</p>
      </div>

      ${wfhRequest.workPlan?.trim() ? `
        <div style="background: #ECFEFF; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin: 0 0 10px; color: #155E75;">Work Plan / Availability:</h4>
          <p style="margin: 0; color: #155E75;">${escapeHtml(wfhRequest.workPlan)}</p>
        </div>
      ` : ''}

      <p style="color: #64748B; font-size: 14px;">
        Please review this WFH request in Compass.
      </p>
    </div>
  `

  const info = await transporter.sendMail({
    from: `P21 Compass <${FROM_EMAIL}>`,
    to: recipients.join(', '),
    subject,
    html: htmlContent,
  })

  return { success: true, messageId: info.messageId, recipients }
}

export async function sendWfhApprovalNotification(
  requestId: string,
  status: 'approved' | 'rejected',
  approverName: string,
  comment?: string
) {
  const wfhRequest = await prisma.wfhRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: true,
    },
  })

  if (!wfhRequest || !wfhRequest.employee.email) {
    return { success: false, message: 'WFH request or employee email not found' }
  }

  const employee = wfhRequest.employee
  const employeeEmail = employee.email as string
  const startDateValue = new Date(wfhRequest.startDate)
  const endDateValue = new Date(wfhRequest.endDate)
  const startDate = startDateValue.toLocaleDateString()
  const endDate = endDateValue.toLocaleDateString()
  const daysCount = calculateWfhDays(startDateValue, endDateValue)
  const durationLabel = getLeaveDurationLabel(daysCount)
  const isApproved = status === 'approved'
  const subject = `WFH Request ${isApproved ? 'Approved' : 'Rejected'}: ${startDate} - ${endDate}`

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${isApproved ? '#059669' : '#DC2626'};">
        WFH Request ${isApproved ? 'Approved' : 'Rejected'}
      </h2>

      <p>Hello ${escapeHtml(employee.name)},</p>
      <p>
        Your work-from-home request has been <strong>${isApproved ? 'approved' : 'rejected'}</strong>.
      </p>

      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Start Date:</strong> ${startDate}</p>
        <p><strong>End Date:</strong> ${endDate}</p>
        <p><strong>Duration (working days):</strong> ${durationLabel}</p>
        <p><strong>Reason:</strong> ${escapeHtml(wfhRequest.reason)}</p>
        ${wfhRequest.workPlan?.trim() ? `<p><strong>Work Plan:</strong> ${escapeHtml(wfhRequest.workPlan)}</p>` : ''}
      </div>

      <div style="background: ${isApproved ? '#ECFDF5' : '#FEF2F2'}; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Reviewed by:</strong> ${escapeHtml(approverName)}</p>
        ${comment ? `<p style="margin: 10px 0 0;"><strong>Comment:</strong> ${escapeHtml(comment)}</p>` : ''}
      </div>

      <p style="color: #64748B; font-size: 14px;">
        You can view the latest status in Compass.
      </p>
    </div>
  `

  const info = await transporter.sendMail({
    from: `P21 Compass <${FROM_EMAIL}>`,
    to: employeeEmail,
    subject,
    html: htmlContent,
  })

  return { success: true, messageId: info.messageId, recipient: employeeEmail }
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

  if (!leaveRequest) {
    return { success: false, message: 'Request or employee email not found' }
  }

  if (!leaveRequest.employee.email) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'APPROVAL_NOTIFICATION',
      status: 'SKIPPED',
      recipients: [],
      subject: null,
      metadata: {
        reason: 'Employee email not found',
        approvalStatus: status,
      },
    })
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
  const daysCount = calculateLeaveDuration(startDateValue, endDateValue, leaveRequest.isHalfDay)
  const durationLabel = getLeaveDurationLabel(daysCount)

  const isApproved = status === 'approved'
  const subject = `Leave Request ${isApproved ? 'Approved' : 'Rejected'}: ${leaveRequest.leaveType} (${startDate} - ${endDate})`
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
        <p><strong>Expected Return Date:</strong> ${leaveRequest.isHalfDay ? 'Same day' : returnDate}</p>
        <p><strong>Duration (working days):</strong> ${durationLabel}</p>
        ${getHalfDayDetailsHtml(leaveRequest)}
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
      subject,
      html: htmlContent,
    })

    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'APPROVAL_NOTIFICATION',
      status: 'SUCCESS',
      recipients: [employeeEmail],
      subject,
      providerMessageId: info.messageId || null,
      metadata: {
        approvalStatus: status,
        approverName,
      },
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send leave approval notification:', error)
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'APPROVAL_NOTIFICATION',
      status: 'FAILED',
      recipients: [employeeEmail],
      subject,
      metadata: {
        approvalStatus: status,
        approverName,
      },
      error,
    })
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
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_REMINDER',
      status: 'SKIPPED',
      recipients: [],
      subject: null,
      metadata: {
        reason: 'Employee email not found',
      },
    })
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
  const daysCount = calculateLeaveDuration(startDateValue, endDateValue, leaveRequest.isHalfDay)
  const durationLabel = getLeaveDurationLabel(daysCount)
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
  const subject = `Reminder: Add transition plan for leave (${startDate} to ${endDate})`

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
        <p><strong>Expected Return Date:</strong> ${leaveRequest.isHalfDay ? 'Same day' : returnDate}</p>
        <p><strong>Duration (working days):</strong> ${durationLabel}</p>
        ${getHalfDayDetailsHtml(leaveRequest)}
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
      subject,
      html: htmlContent,
    })

    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_REMINDER',
      status: 'SUCCESS',
      recipients: [employeeEmail],
      subject,
      providerMessageId: info.messageId || null,
      metadata: {
        daysUntilStart,
      },
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send transition plan reminder:', error)
    await safeRecordLeaveAuditEvent({
      leaveRequestId: requestId,
      channel: 'EMAIL',
      eventType: 'TRANSITION_PLAN_REMINDER',
      status: 'FAILED',
      recipients: [employeeEmail],
      subject,
      metadata: {
        daysUntilStart,
      },
      error,
    })
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
        <p><strong>Upgrade Request:</strong> ${ticket.isUpgradeRequest ? 'Yes' : 'No'}</p>
        ${ticket.isUpgradeRequest ? `<p><strong>Manager Approval:</strong> ${ticket.managerApprovalReceived === true ? 'Yes' : ticket.managerApprovalReceived === false ? 'No' : 'Not provided'}</p>` : ''}
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
  updatedByRole?: 'EMPLOYEE' | 'HR' | 'SECURITY' | 'OA' | 'EXECUTION'
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
        <p><strong>Upgrade Request:</strong> ${ticket.isUpgradeRequest ? 'Yes' : 'No'}</p>
        ${ticket.isUpgradeRequest ? `<p><strong>Manager Approval:</strong> ${ticket.managerApprovalReceived === true ? 'Yes' : ticket.managerApprovalReceived === false ? 'No' : 'Not provided'}</p>` : ''}
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

async function getSecurityRecipientEmails() {
  const securityUsers = await prisma.user.findMany({
    where: {
      role: 'SECURITY',
      email: { not: null },
    },
    select: { email: true },
  })
  return [...new Set(securityUsers.map((u) => u.email).filter(Boolean) as string[])]
}

export async function sendPositionClosedNotification(positionId: string) {
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    include: {
      teamLead: {
        select: { name: true, email: true },
      },
    },
  })

  if (!position) {
    return { success: false, message: 'Position not found' }
  }

  const securityRecipients = await getSecurityRecipientEmails()
  const recipients = mergeRecipientEmails(
    [position.teamLead?.email],
    securityRecipients,
    getOnboardingExecutionRecipients()
  )
  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for position closed notification' }
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0D9488;">Position Closed</h2>
      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Title:</strong> ${escapeHtml(position.title)}</p>
        <p><strong>Department:</strong> ${escapeHtml(position.department || 'N/A')}</p>
        <p><strong>Team Lead:</strong> ${escapeHtml(position.teamLead?.name || 'N/A')}</p>
      </div>
      <p style="color: #64748B; font-size: 14px;">
        A new hire record can now be created from this closed position.
      </p>
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject: `Position Closed: ${position.title}`,
      html: htmlContent,
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send position closed notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendTeamLeadFormSubmittedNotification(newHireId: string) {
  const newHire = await prisma.newHire.findUnique({
    where: { id: newHireId },
    include: {
      teamLead: { select: { name: true } },
    },
  })

  if (!newHire) {
    return { success: false, message: 'New hire not found' }
  }

  const recipients = mergeRecipientEmails(
    await getHrRecipientEmails(),
    getOnboardingExecutionRecipients()
  )
  if (recipients.length === 0) {
    return { success: false, message: 'No HR recipients configured' }
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0D9488;">Team Lead Form Submitted</h2>
      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>New Hire:</strong> ${escapeHtml(newHire.name)}</p>
        <p><strong>Title:</strong> ${escapeHtml(newHire.title)}</p>
        <p><strong>Department:</strong> ${escapeHtml(newHire.department || 'N/A')}</p>
        <p><strong>Submitted By:</strong> ${escapeHtml(newHire.teamLead?.name || 'Team Lead')}</p>
      </div>
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject: `Team Lead Form Submitted: ${newHire.name}`,
      html: htmlContent,
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send team lead form submitted notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendTeamLeadFormRequestNotification(newHireId: string) {
  const newHire = await prisma.newHire.findUnique({
    where: { id: newHireId },
    include: {
      teamLead: { select: { name: true, email: true } },
    },
  })

  if (!newHire) {
    return { success: false, message: 'New hire not found' }
  }

  const teamLeadEmail = newHire.teamLead?.email
  const recipients = mergeRecipientEmails([teamLeadEmail], getOnboardingExecutionRecipients())
  if (recipients.length === 0) {
    return { success: false, message: 'No team lead email configured' }
  }

  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '')
  const formUrl = appBaseUrl ? `${appBaseUrl}/team-lead-form/${newHire.id}` : '/team-lead-form'

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0D9488;">Onboarding Team Lead Form Required</h2>
      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>New Hire:</strong> ${escapeHtml(newHire.name)}</p>
        <p><strong>Title:</strong> ${escapeHtml(newHire.title)}</p>
        <p><strong>Department:</strong> ${escapeHtml(newHire.department || 'N/A')}</p>
        <p><strong>Onboarding Date:</strong> ${newHire.onboardingDate.toLocaleDateString()}</p>
      </div>
      <p style="color: #475569; margin: 0 0 14px;">
        Please complete the team lead onboarding form so security and HR can proceed.
      </p>
      ${
        appBaseUrl
          ? `<p><a href="${formUrl}" style="display:inline-block;background:#0D9488;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Open Team Lead Form</a></p>`
          : ''
      }
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject: `Action Required: Team Lead Form for ${newHire.name}`,
      html: htmlContent,
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send team lead form request notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendSecurityChecklistCompleteNotification(newHireId: string) {
  const newHire = await prisma.newHire.findUnique({
    where: { id: newHireId },
  })

  if (!newHire) {
    return { success: false, message: 'New hire not found' }
  }

  const recipients = mergeRecipientEmails(
    await getHrRecipientEmails(),
    getOnboardingExecutionRecipients()
  )
  if (recipients.length === 0) {
    return { success: false, message: 'No HR recipients configured' }
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0D9488;">Security Checklist Completed</h2>
      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>New Hire:</strong> ${escapeHtml(newHire.name)}</p>
        <p><strong>Title:</strong> ${escapeHtml(newHire.title)}</p>
        <p><strong>Department:</strong> ${escapeHtml(newHire.department || 'N/A')}</p>
      </div>
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject: `Security Checklist Complete: ${newHire.name}`,
      html: htmlContent,
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send security checklist completion notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendOnboardingCompletedNotification(userId: string) {
  const onboardingUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      newHireRecord: {
        include: {
          teamLead: {
            select: { email: true, name: true },
          },
        },
      },
    },
  })

  if (!onboardingUser) {
    return { success: false, message: 'User not found' }
  }

  const hrRecipients = await getHrRecipientEmails()
  const recipients = mergeRecipientEmails(
    hrRecipients,
    [onboardingUser.newHireRecord?.teamLead?.email],
    getOnboardingExecutionRecipients()
  )

  if (recipients.length === 0) {
    return { success: false, message: 'No recipients configured for onboarding completion notification' }
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0D9488;">Onboarding Completed</h2>
      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>User:</strong> ${escapeHtml(onboardingUser.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(onboardingUser.email || 'N/A')}</p>
        <p><strong>Department:</strong> ${escapeHtml(onboardingUser.department || 'N/A')}</p>
        <p><strong>Team Lead:</strong> ${escapeHtml(onboardingUser.newHireRecord?.teamLead?.name || 'N/A')}</p>
      </div>
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject: `Onboarding Completed: ${onboardingUser.name}`,
      html: htmlContent,
    })
    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send onboarding completed notification:', error)
    return { success: false, error: error.message }
  }
}

export async function sendPreEvaluationLeadPrepNotification(
  prepId: string,
  reminderType: 'INITIAL' | 'SEVEN_DAY' | 'ONE_DAY' | 'MANUAL_RESEND' = 'INITIAL'
) {
  const prep = await prisma.preEvaluationLeadPrep.findUnique({
    where: { id: prepId },
    include: {
      lead: {
        select: {
          name: true,
          email: true,
        },
      },
        period: {
          select: {
            name: true,
            startDate: true,
            reviewStartDate: true,
          },
        },
    },
  })

  if (!prep || !prep.lead.email) {
    return { success: false, message: 'Lead email not found' }
  }

  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '')
  const prepUrl = appBaseUrl ? `${appBaseUrl}/pre-evaluation` : '/pre-evaluation'
  const reviewStartDateLabel = new Date(prep.period.reviewStartDate).toLocaleDateString()
  const daysUntilStart = Math.ceil(
    (new Date(prep.period.reviewStartDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  const titleByType: Record<typeof reminderType, string> = {
    INITIAL: 'Performance evaluations open in 2 weeks',
    SEVEN_DAY: 'Performance evaluations open in 1 week',
    ONE_DAY: 'Performance evaluations open tomorrow',
    MANUAL_RESEND: 'Reminder: complete your pre-evaluation onboarding',
  }

  const bodyByType: Record<typeof reminderType, string> = {
    INITIAL: 'Performance evaluations are opening in 2 weeks. Please complete your required pre-evaluation onboarding before evaluations begin.',
    SEVEN_DAY: 'Performance evaluations are opening in 1 week. Please complete your required pre-evaluation questions before evaluations begin.',
    ONE_DAY: 'Performance evaluations open tomorrow. Complete your pre-evaluation onboarding now if it is still outstanding.',
    MANUAL_RESEND: 'Please complete your pre-evaluation onboarding as soon as possible so the upcoming evaluations can be prepared.',
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">${escapeHtml(titleByType[reminderType])}</h2>
      <p>Hi ${escapeHtml(prep.lead.name)},</p>
      <p>${escapeHtml(bodyByType[reminderType])}</p>

        <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Evaluation Period:</strong> ${escapeHtml(prep.period.name)}</p>
          <p><strong>Evaluations Begin:</strong> ${escapeHtml(reviewStartDateLabel)}</p>
          <p><strong>Required submission:</strong> 2 lead questions</p>
          <p><strong>Time remaining:</strong> ${
            daysUntilStart > 1
              ? `${daysUntilStart} days`
              : daysUntilStart === 1
                ? '1 day'
                : 'Evaluations start today'
          }</p>
        </div>

      ${
        appBaseUrl
          ? `<p><a href="${prepUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Open Pre-Evaluation Onboarding</a></p>`
          : ''
      }

      <p style="color: #64748B; font-size: 14px;">
        Evaluator change requests can be submitted separately from the Evaluations page while the pre-cycle window is open.
      </p>
    </div>
  `

  try {
    const info = await transporter.sendMail({
      from: `P21 Compass <${FROM_EMAIL}>`,
      to: prep.lead.email,
      subject: titleByType[reminderType],
      html: htmlContent,
    })

    return { success: true, data: { messageId: info.messageId } }
  } catch (error: any) {
    console.error('Failed to send pre-evaluation onboarding notification:', error)
    return { success: false, error: error.message }
  }
}
