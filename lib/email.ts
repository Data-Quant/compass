import { Resend } from 'resend'
import { prisma } from '@/lib/db'
import { formatReportAsHTML, generateDetailedReport } from './reports'
import { escapeHtml } from '@/lib/sanitize'

const resend = new Resend(process.env.RESEND_API_KEY)

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

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Performance Portal <noreply@example.com>',
      to: employee.email,
      subject: `Performance Evaluation Report - ${period.name}`,
      html: htmlContent,
    })

    if (error) {
      await prisma.emailQueue.update({
        where: { id: emailQueueId },
        data: {
          emailStatus: 'FAILED',
          errorMessage: error.message,
        },
      })
      throw error
    }

    await prisma.emailQueue.update({
      where: { id: emailQueueId },
      data: {
        emailStatus: 'SENT',
        sentAt: new Date(),
      },
    })

    return { success: true, data }
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
  const startDate = new Date(leaveRequest.startDate).toLocaleDateString()
  const endDate = new Date(leaveRequest.endDate).toLocaleDateString()
  const daysCount = Math.ceil(
    (new Date(leaveRequest.endDate).getTime() - new Date(leaveRequest.startDate).getTime()) / 
    (1000 * 60 * 60 * 24)
  ) + 1

  // Fixed email addresses
  const HR_EMAIL = 'hr@plutus21.com'
  const EXECUTION_EMAIL = 'execution@plutus21.com'

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

  // Build recipient list: HR + Execution + leads + optional additional (deduplicated)
  const recipients = [...new Set([HR_EMAIL, EXECUTION_EMAIL, ...leadEmails, ...additionalEmails])]

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Leave Request Submitted</h2>

      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Employee:</strong> ${escapeHtml(employee.name)}</p>
        <p><strong>Department:</strong> ${escapeHtml(employee.department) || 'N/A'}</p>
        <p><strong>Leave Type:</strong> ${escapeHtml(leaveRequest.leaveType)}</p>
        <p><strong>Duration:</strong> ${startDate} to ${endDate} (${daysCount} day${daysCount > 1 ? 's' : ''})</p>
        <p><strong>Reason:</strong> ${escapeHtml(leaveRequest.reason)}</p>
        ${leaveRequest.coverPerson ? `<p><strong>Cover Person:</strong> ${escapeHtml(leaveRequest.coverPerson.name)}</p>` : ''}
      </div>

      <div style="background: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h4 style="margin: 0 0 10px; color: #92400E;">Transition Plan:</h4>
        <p style="margin: 0; color: #92400E;">${escapeHtml(leaveRequest.transitionPlan)}</p>
      </div>

      <p style="color: #64748B; font-size: 14px;">
        Please review this request and take action in the HR Portal.
      </p>
    </div>
  `

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'HR Portal <noreply@example.com>',
      to: recipients,
      subject: `Leave Request: ${employee.name} - ${leaveRequest.leaveType} (${daysCount} days)`,
      html: htmlContent,
    })

    if (error) {
      console.error('Failed to send leave request notification:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
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
  const startDate = new Date(leaveRequest.startDate).toLocaleDateString()
  const endDate = new Date(leaveRequest.endDate).toLocaleDateString()
  const daysCount = Math.ceil(
    (new Date(leaveRequest.endDate).getTime() - new Date(leaveRequest.startDate).getTime()) / 
    (1000 * 60 * 60 * 24)
  ) + 1

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
        <p><strong>Duration:</strong> ${startDate} to ${endDate} (${daysCount} day${daysCount > 1 ? 's' : ''})</p>
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
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'HR Portal <noreply@example.com>',
      to: employeeEmail,
      subject: `Leave Request ${isApproved ? 'Approved' : 'Rejected'}: ${leaveRequest.leaveType} (${startDate} - ${endDate})`,
      html: htmlContent,
    })

    if (error) {
      console.error('Failed to send leave approval notification:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error: any) {
    console.error('Failed to send leave approval notification:', error)
    return { success: false, error: error.message }
  }
}
