import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { periodId, type } = await request.json()

    if (!periodId) {
      return NextResponse.json({ error: 'Period ID is required' }, { status: 400 })
    }

    const period = await prisma.evaluationPeriod.findUnique({
      where: { id: periodId },
    })

    if (!period) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 })
    }

    // Get all users who need to submit evaluations
    const mappings = await prisma.evaluatorMapping.findMany({
      include: {
        evaluator: true,
        evaluatee: true,
      },
    })

    // Get all submitted evaluations for this period
    const submittedEvaluations = await prisma.evaluation.findMany({
      where: {
        periodId,
        submittedAt: { not: null },
      },
      select: {
        evaluatorId: true,
        evaluateeId: true,
      },
    })

    // Create a set of completed evaluation pairs
    const completedPairs = new Set(
      submittedEvaluations.map(e => `${e.evaluatorId}-${e.evaluateeId}`)
    )

    // Find pending evaluations
    const pendingEvaluations = mappings.filter(
      m => !completedPairs.has(`${m.evaluatorId}-${m.evaluateeId}`)
    )

    // Group by evaluator
    const pendingByEvaluator = pendingEvaluations.reduce((acc, mapping) => {
      if (!acc[mapping.evaluatorId]) {
        acc[mapping.evaluatorId] = {
          evaluator: mapping.evaluator,
          pendingEvaluatees: [],
        }
      }
      acc[mapping.evaluatorId].pendingEvaluatees.push(mapping.evaluatee.name)
      return acc
    }, {} as Record<string, { evaluator: any; pendingEvaluatees: string[] }>)

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    }

    // Send reminder emails
    for (const [evaluatorId, data] of Object.entries(pendingByEvaluator)) {
      if (!data.evaluator.email) {
        results.skipped++
        continue
      }

      try {
        const daysRemaining = Math.ceil(
          (new Date(period.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )

        const emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Performance Evaluation Reminder</h2>
            <p>Hi ${data.evaluator.name},</p>
            <p>This is a reminder that you have <strong>${data.pendingEvaluatees.length}</strong> pending evaluation(s) for the <strong>${period.name}</strong> evaluation period.</p>
            ${daysRemaining > 0 ? `<p style="color: #dc2626;">Only <strong>${daysRemaining} days</strong> remaining until the deadline!</p>` : '<p style="color: #dc2626;"><strong>The deadline has passed!</strong></p>'}
            <p>Pending evaluations for:</p>
            <ul>
              ${data.pendingEvaluatees.map(name => `<li>${name}</li>`).join('')}
            </ul>
            <p>Please log in to the Performance Evaluation Portal to complete your evaluations.</p>
            <p>Thank you,<br>HR Team</p>
          </div>
        `

        if (process.env.RESEND_API_KEY) {
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'Performance Portal <noreply@example.com>',
            to: data.evaluator.email,
            subject: `Reminder: ${data.pendingEvaluatees.length} Pending Evaluation(s) - ${period.name}`,
            html: emailContent,
          })
        }

        results.sent++
      } catch (error: any) {
        results.failed++
        results.errors.push(`Failed to send to ${data.evaluator.email}: ${error.message}`)
      }
    }

    // Mark reminder as sent
    await prisma.evaluationPeriod.update({
      where: { id: periodId },
      data: { reminderSent: true },
    })

    return NextResponse.json({
      success: true,
      results,
      totalPending: Object.keys(pendingByEvaluator).length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to send reminders' },
      { status: 500 }
    )
  }
}
