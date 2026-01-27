import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const evaluationSchema = z.object({
  evaluateeId: z.string(),
  periodId: z.string(),
  responses: z.array(
    z.object({
      questionId: z.string(),
      ratingValue: z.number().min(1).max(4).optional(),
      textResponse: z.string().optional(),
    })
  ),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = evaluationSchema.parse(body)

    // Check if period is locked
    const period = await prisma.evaluationPeriod.findUnique({
      where: { id: data.periodId },
    })

    if (period?.isLocked) {
      return NextResponse.json(
        { error: 'This evaluation period is locked. Submissions are no longer accepted.' },
        { status: 403 }
      )
    }

    // Validate that evaluator has permission to evaluate this person
    const mapping = await prisma.evaluatorMapping.findFirst({
      where: {
        evaluatorId: user.id,
        evaluateeId: data.evaluateeId,
      },
    })

    if (!mapping) {
      return NextResponse.json(
        { error: 'You are not authorized to evaluate this person' },
        { status: 403 }
      )
    }

    // Save or update evaluations
    const evaluations = []
    for (const response of data.responses) {
      const evaluation = await prisma.evaluation.upsert({
        where: {
          evaluatorId_evaluateeId_questionId_periodId: {
            evaluatorId: user.id,
            evaluateeId: data.evaluateeId,
            questionId: response.questionId,
            periodId: data.periodId,
          },
        },
        create: {
          evaluatorId: user.id,
          evaluateeId: data.evaluateeId,
          questionId: response.questionId,
          periodId: data.periodId,
          ratingValue: response.ratingValue ?? null,
          textResponse: response.textResponse ?? null,
          submittedAt: new Date(),
        },
        update: {
          ratingValue: response.ratingValue ?? null,
          textResponse: response.textResponse ?? null,
          submittedAt: new Date(),
        },
      })
      evaluations.push(evaluation)
    }

    return NextResponse.json({ success: true, evaluations })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error.message || 'Failed to submit evaluation' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { evaluateeId, periodId, questionId, ratingValue, textResponse } = body

    // Save as draft (no submittedAt)
    const evaluation = await prisma.evaluation.upsert({
      where: {
        evaluatorId_evaluateeId_questionId_periodId: {
          evaluatorId: user.id,
          evaluateeId,
          questionId,
          periodId,
        },
      },
      create: {
        evaluatorId: user.id,
        evaluateeId,
        questionId,
        periodId,
        ratingValue: ratingValue ?? null,
        textResponse: textResponse ?? null,
      },
      update: {
        ratingValue: ratingValue ?? null,
        textResponse: textResponse ?? null,
      },
    })

    return NextResponse.json({ success: true, evaluation })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to save draft' },
      { status: 500 }
    )
  }
}
