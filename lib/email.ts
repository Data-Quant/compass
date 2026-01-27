import { Resend } from 'resend'
import { prisma } from '@/lib/db'
import { formatReportAsHTML, generateDetailedReport } from './reports'

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
